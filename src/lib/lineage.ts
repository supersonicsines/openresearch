// The record of every question asked of a prompt: where each came from, and what became of it.
// A run researches one question and its edit leaves a list of further ones, so the questions form a
// tree, and each carries the run after which it was raised. That is enough to show the tree as it
// stood after any run, which is done on the page itself, by `stateAt`.

export type Origin = 'prompt' | 'editor' | 'review' | 'proposal' | 'audit';

/** Asked when a new donation arrives on a project whose list of questions is empty. */
export const REVIEW_QUESTION =
	'What important aspects of the prompt have not yet been covered by the findings so far?';

/** Control characters cannot be stored by git, and line breaks could forge the fields of a record. */
export function oneLine(text: string): string {
	return text.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export type OpenQuestion = { id: number; text: string };

export type NewQuestion = {
	text: string;
	origin: Origin;
	/** The run after which the question was raised. 0 for the prompt, and for anything asked before the first run. */
	parent_seq: number;
	proposal_id: number | null;
	raised_at: number;
};

export type Step = {
	seq: number;
	/** The question that the run researched, on one line. */
	question: string;
	at: number;
	/** The number of the run before it, or 0. */
	lastSeq: number;
	/** The prompt, on one line. */
	prompt: string;
	/** Set where the question was chosen in a round. */
	directed?: { kind: 'question' | 'audit'; proposalId: number; raisedAt: number; parentSeq: number };
	/** The list of questions as the edit left it, or null where that is not known. */
	next: string[] | null;
};

export type Advance = {
	/** The question that was researched: one already listed, or one recorded now. */
	answered: { id: number } | { row: NewQuestion };
	/** Listed questions that the edit took off the list without their being researched. */
	closed: number[];
	/** Questions that the edit listed for the first time. */
	raised: string[];
};

/** What one run does to the record. `open` holds the questions the editor has listed and nobody has researched. */
export function advance(open: OpenQuestion[], step: Step): Advance {
	let answered: Advance['answered'];
	let remaining = open;
	if (step.directed) {
		answered = {
			row: {
				text: step.question,
				origin: step.directed.kind === 'audit' ? 'audit' : 'proposal',
				parent_seq: step.directed.parentSeq,
				proposal_id: step.directed.proposalId,
				raised_at: step.directed.raisedAt
			}
		};
	} else {
		const listed = open.find((q) => q.text === step.question);
		if (listed) {
			answered = { id: listed.id };
			remaining = open.filter((q) => q.id !== listed.id);
		} else {
			const origin: Origin =
				step.question === step.prompt ? 'prompt' : step.question === REVIEW_QUESTION ? 'review' : 'editor';
			answered = {
				row: {
					text: step.question,
					origin,
					// A review looks at the prompt afresh, so it stands beside the first run, not beneath the last.
					// Otherwise each one would hang a level deeper than the one before.
					parent_seq: origin === 'editor' ? step.lastSeq : 0,
					proposal_id: null,
					raised_at: step.at
				}
			};
		}
	}
	if (step.next === null) return { answered, closed: [], raised: [] };
	const next = [...new Set(step.next.map(oneLine).filter(Boolean))];
	const held = new Set(remaining.map((q) => q.text));
	return {
		answered,
		closed: remaining.filter((q) => !next.includes(q.text)).map((q) => q.id),
		raised: next.filter((text) => !held.has(text))
	};
}

/** The list of questions in a repository's open-questions.md, as it was written after a run. */
export function readQuestionList(file: string): string[] {
	return file
		.split('\n')
		.filter((line) => line.startsWith('- '))
		.map((line) => oneLine(line.slice(2)))
		.filter(Boolean);
}

// What a page is given, and how it reads the record at a point in time.

export type TreeRun = {
	seq: number;
	at: number;
	modelName: string;
	costMicro: number;
	handle: string;
	avatar: string | null;
	/** The heading of the report, which states what was found. */
	headline: string;
	sources: number;
};

export type TreeNode = {
	/** Unique on the page, and usable in an address: q12, or p3 for a question still in a round. */
	id: string;
	text: string;
	origin: Origin;
	parent: number;
	raisedAt: number;
	/** Whoever proposed it, where it came from a round. */
	proposer: string | null;
	run: TreeRun | null;
	/** The run after which the editor took it off the list. */
	closedSeq: number | null;
	/** For a question still in a round. */
	proposalId: number | null;
	pledged: number;
	backers: number;
};

export type State = 'researched' | 'open' | 'aside' | 'proposed';

/** How a question stood after run `at`, or null where it had not yet been raised. */
export function stateAt(node: TreeNode, at: number): State | null {
	if (node.parent > at) return null;
	if (node.run && node.run.seq <= at) return 'researched';
	// A question that was researched later was still on the list, or in a round, at this point.
	if (node.proposalId !== null || node.origin === 'proposal' || node.origin === 'audit') return 'proposed';
	if (node.closedSeq !== null && node.closedSeq <= at) return 'aside';
	return 'open';
}

export type Branch = { node: TreeNode; state: State; children: Branch[]; runs: number; costMicro: number; below: number };

/**
 * The tree as it stood after run `at`. A question hangs from the run after which it was raised, and
 * the totals of each branch count everything beneath it.
 */
export function treeAt(nodes: TreeNode[], at: number): Branch[] {
	const visible = nodes
		.map((node) => ({ node, state: stateAt(node, at) }))
		.filter((entry): entry is { node: TreeNode; state: State } => entry.state !== null);
	const runs = new Set(visible.filter((v) => v.state === 'researched').map((v) => v.node.run!.seq));
	const byParent = new Map<number, typeof visible>();
	for (const entry of visible) {
		// A question whose parent cannot be found is shown at the top, and is never lost.
		const parent = runs.has(entry.node.parent) ? entry.node.parent : 0;
		byParent.set(parent, [...(byParent.get(parent) ?? []), entry]);
	}
	const rank: Record<State, number> = { researched: 0, proposed: 1, open: 2, aside: 3 };
	const build = (parent: number, seen: Set<number>): Branch[] =>
		(byParent.get(parent) ?? [])
			.sort(
				(a, b) =>
					rank[a.state] - rank[b.state] ||
					// Runs are in the order they were made. A question researched later was not yet a run at this point.
					(a.state === 'researched' ? a.node.run!.seq - b.node.run!.seq : 0) ||
					b.node.pledged - a.node.pledged ||
					a.node.raisedAt - b.node.raisedAt
			)
			.map(({ node, state }) => {
				const seq = state === 'researched' ? node.run!.seq : 0;
				const children = seq && !seen.has(seq) ? build(seq, new Set(seen).add(seq)) : [];
				return {
					node,
					state,
					children,
					runs: children.reduce((n, c) => n + c.runs, state === 'researched' ? 1 : 0),
					costMicro: children.reduce((n, c) => n + c.costMicro, state === 'researched' ? node.run!.costMicro : 0),
					below: children.reduce((n, c) => n + c.below + 1, 0)
				};
			});
	return build(0, new Set([0]));
}

export type Tally = { raised: number; researched: number; open: number; aside: number; proposed: number; depth: number };

export function tally(branches: Branch[]): Tally {
	const out: Tally = { raised: 0, researched: 0, open: 0, aside: 0, proposed: 0, depth: 0 };
	const walk = (list: Branch[], depth: number) => {
		for (const branch of list) {
			out.raised += 1;
			out[branch.state] += 1;
			out.depth = Math.max(out.depth, depth);
			walk(branch.children, depth + 1);
		}
	};
	walk(branches, 1);
	return out;
}
