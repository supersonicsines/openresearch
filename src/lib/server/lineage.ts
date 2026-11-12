// Keeps the record of questions from which the research tree is drawn (see src/lib/lineage.ts).
// It is written in the same transaction as each run. For projects older than the record, it is
// rebuilt once from their repositories, which hold the list of open questions as it stood after every run.
import {
	advance,
	oneLine,
	readQuestionList,
	type Advance,
	type NewQuestion,
	type OpenQuestion,
	type Step,
	type TreeNode
} from '#lib/lineage.ts';
import { scrub } from './crypto.ts';
import { all, get, run, tx } from './db.ts';
import { renderFindings } from './render.ts';
import { readAt, repoExists } from './repo.ts';

function openQuestions(projectId: number): OpenQuestion[] {
	return all<OpenQuestion>(
		`SELECT id, text FROM questions
		WHERE project_id = ? AND origin = 'editor' AND run_seq IS NULL AND closed_seq IS NULL ORDER BY id`,
		projectId
	);
}

function insert(projectId: number, row: NewQuestion, runSeq: number | null): number {
	const { lastInsertRowid } = run(
		`INSERT INTO questions (project_id, text, origin, parent_seq, proposal_id, raised_at, run_seq)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		projectId,
		row.text,
		row.origin,
		row.parent_seq,
		row.proposal_id,
		row.raised_at,
		runSeq
	);
	return Number(lastInsertRowid);
}

function apply(projectId: number, step: Step, change: Advance) {
	if ('id' in change.answered) run('UPDATE questions SET run_seq = ? WHERE id = ?', step.seq, change.answered.id);
	else insert(projectId, change.answered.row, step.seq);
	for (const id of change.closed) {
		run('UPDATE questions SET closed_seq = ?, closed_at = ? WHERE id = ?', step.seq, step.at, id);
	}
	for (const text of change.raised) {
		insert(projectId, { text, origin: 'editor', parent_seq: step.seq, proposal_id: null, raised_at: step.at }, null);
	}
}

/** Records one run. It is called inside the transaction that stores the run itself. */
export function recordRun(projectId: number, step: Step) {
	apply(projectId, step, advance(openQuestions(projectId), step));
}

/** The run that was the latest when a question was proposed, which is the one it hangs from. */
export function runBefore(projectId: number, at: number): number {
	return (
		get<{ n: number }>(
			`SELECT COALESCE(MAX(seq), 0) AS n FROM runs WHERE project_id = ? AND status = 'completed' AND finished_at <= ?`,
			projectId,
			at
		)?.n ?? 0
	);
}

type PastRun = {
	seq: number;
	question: string;
	commit_sha: string | null;
	finished_at: number;
	proposal_id: number | null;
	proposal_kind: 'question' | 'audit' | null;
	proposal_question: string | null;
	proposal_at: number | null;
};

async function rebuild(projectId: number) {
	const project = get<{ slug: string; prompt: string }>('SELECT slug, prompt FROM projects WHERE id = ?', projectId);
	if (!project) return;
	const runs = all<PastRun>(
		`SELECT r.seq, r.question, r.commit_sha, r.finished_at, d.proposal_id,
			o.kind AS proposal_kind, o.question AS proposal_question, o.created_at AS proposal_at
		FROM runs r JOIN donations d ON d.id = r.donation_id LEFT JOIN proposals o ON o.id = d.proposal_id
		WHERE r.project_id = ? AND r.status = 'completed' ORDER BY r.seq`,
		projectId
	);
	// The list as each run left it is read before anything is written, so that nothing is half done.
	const lists = new Map<number, string[] | null>();
	const readable = repoExists(project.slug);
	for (const past of runs) {
		const file = readable && past.commit_sha ? await readAt(project.slug, past.commit_sha, 'open-questions.md') : null;
		lists.set(past.seq, file === null ? null : readQuestionList(file));
	}
	tx(() => {
		// Another request may have finished the same work while the files were being read.
		if (get<{ lineage: number }>('SELECT lineage FROM projects WHERE id = ?', projectId)?.lineage) return;
		run('DELETE FROM questions WHERE project_id = ?', projectId);
		const prompt = oneLine(project.prompt);
		let lastSeq = 0;
		for (const past of runs) {
			const question = oneLine(past.question);
			const directed =
				past.proposal_id !== null && past.proposal_kind !== null && oneLine(past.proposal_question ?? '') === question
					? {
							kind: past.proposal_kind,
							proposalId: past.proposal_id,
							raisedAt: past.proposal_at ?? past.finished_at,
							parentSeq: runBefore(projectId, past.proposal_at ?? past.finished_at)
						}
					: undefined;
			recordRun(projectId, {
				seq: past.seq,
				question,
				at: past.finished_at,
				lastSeq,
				prompt,
				directed,
				next: lists.get(past.seq) ?? null
			});
			lastSeq = past.seq;
		}
		run('UPDATE projects SET lineage = 1 WHERE id = ?', projectId);
	});
}

const holder = globalThis as unknown as { __osLineage?: Map<number, Promise<void>> };
const pending = (holder.__osLineage ??= new Map());

/** Completes a project's record if it is not complete. One piece of work is shared by all who ask for it. */
export function ensureLineage(projectId: number): Promise<void> {
	if (get<{ lineage: number }>('SELECT lineage FROM projects WHERE id = ?', projectId)?.lineage) return Promise.resolve();
	let work = pending.get(projectId);
	if (!work) {
		work = rebuild(projectId)
			.catch((err) => console.error(`The record of questions for project ${projectId} could not be rebuilt:`, scrub(String(err))))
			.finally(() => pending.delete(projectId));
		pending.set(projectId, work);
	}
	return work;
}

/**
 * Run once at startup, in the background: projects from before the record are given one, and findings
 * rendered before sections were introduced are rendered again. Both are done a few at a time, so that
 * the site answers while they are.
 */
export function upgradeStored() {
	const step = async () => {
		try {
			const stale = all<{ id: number; findings_md: string }>(
				'SELECT id, findings_md FROM projects WHERE findings_format < 2 LIMIT 20'
			);
			for (const { id, findings_md } of stale) {
				run(
					'UPDATE projects SET findings_html = ?, findings_format = 2 WHERE id = ?',
					findings_md ? renderFindings(findings_md) : '',
					id
				);
			}
			const old = all<{ id: number }>('SELECT id FROM projects WHERE lineage = 0 LIMIT 5');
			for (const { id } of old) await ensureLineage(id);
			// A record that could not be rebuilt is left for the next start, so the work always ends.
			if (stale.length === 20 || old.length === 5) setTimeout(step, 50).unref?.();
		} catch (err) {
			console.error('Stored projects could not be brought up to date:', scrub(String(err)));
		}
	};
	setTimeout(step, 0).unref?.();
}

/** The heading with which a report opens, which states what was found. Read without a pattern that can backtrack. */
function headline(opening: string): string {
	for (const line of opening.split('\n', 20)) {
		if (line.startsWith('## ')) return line.slice(3).split('*').join('').split('`').join('').trim().slice(0, 240);
	}
	return '';
}

type QuestionRow = {
	id: number;
	text: string;
	origin: TreeNode['origin'];
	parent_seq: number;
	raised_at: number;
	run_seq: number | null;
	closed_seq: number | null;
	proposal_id: number | null;
	proposer: string | null;
};

type RunRow = {
	seq: number;
	finished_at: number;
	model_name: string;
	cost_micro: number;
	handle: string;
	avatar_url: string | null;
	sources: number;
	opening: string;
};

type RoundRow = {
	id: number;
	kind: 'question' | 'audit';
	question: string;
	created_at: number;
	handle: string;
	pledged: number;
	backers: number;
};

/** Every question asked of a project, with the run that researched it where there was one. */
export function treeNodes(projectId: number): TreeNode[] {
	const runs = new Map(
		all<RunRow>(
			`SELECT r.seq, r.finished_at, r.model_name, r.cost_micro, u.handle, u.avatar_url,
				json_array_length(r.sources) AS sources, substr(r.report_md, 1, 800) AS opening
			FROM runs r JOIN users u ON u.id = r.user_id WHERE r.project_id = ? AND r.status = 'completed'`,
			projectId
		).map((row) => [row.seq, row])
	);
	const questions = all<QuestionRow>(
		`SELECT q.id, q.origin, q.parent_seq, q.raised_at, q.run_seq, q.closed_seq, q.proposal_id,
			CASE WHEN o.status = 'removed' THEN 'A question that has been removed' ELSE q.text END AS text,
			CASE WHEN o.kind = 'question' AND o.status <> 'removed' THEN pu.handle END AS proposer
		FROM questions q LEFT JOIN proposals o ON o.id = q.proposal_id LEFT JOIN users pu ON pu.id = o.user_id
		WHERE q.project_id = ? ORDER BY q.id`,
		projectId
	);
	const nodes: TreeNode[] = questions.map((q) => {
		const row = q.run_seq === null ? undefined : runs.get(q.run_seq);
		return {
			id: `q${q.id}`,
			text: q.text,
			origin: q.origin,
			parent: q.parent_seq,
			raisedAt: q.raised_at,
			proposer: q.proposer,
			run: row
				? {
						seq: row.seq,
						at: row.finished_at,
						modelName: row.model_name,
						costMicro: row.cost_micro,
						handle: row.handle,
						avatar: row.avatar_url,
						headline: headline(row.opening),
						sources: row.sources
					}
				: null,
			closedSeq: q.closed_seq,
			proposalId: null,
			pledged: 0,
			backers: 0
		};
	});
	// Questions still in a round: those listed, and one that has led its round and is yet to be researched.
	const inRound = all<RoundRow>(
		`SELECT o.id, o.kind, o.question, o.created_at, u.handle,
			COALESCE(SUM(g.amount_micro), 0) AS pledged, COUNT(g.id) AS backers
		FROM proposals o JOIN users u ON u.id = o.user_id
		LEFT JOIN pledges g ON g.proposal_id = o.id AND g.status IN ('standing','called')
		WHERE o.project_id = ? AND o.status IN ('open','won')
			AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.proposal_id = o.id)
		GROUP BY o.id ORDER BY o.id`,
		projectId
	);
	const finished = [...runs.values()].sort((a, b) => a.seq - b.seq);
	for (const o of inRound) {
		let parent = 0;
		for (const row of finished) if (row.finished_at <= o.created_at) parent = row.seq;
		nodes.push({
			id: `p${o.id}`,
			text: o.question,
			origin: o.kind === 'audit' ? 'audit' : 'proposal',
			parent,
			raisedAt: o.created_at,
			proposer: o.kind === 'question' ? o.handle : null,
			run: null,
			closedSeq: null,
			proposalId: o.id,
			pledged: o.pledged,
			backers: o.backers
		});
	}
	return nodes;
}
