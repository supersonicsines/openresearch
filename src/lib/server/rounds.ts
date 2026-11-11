// Rounds. Anyone may propose the next question on a project, and anyone with a key may pledge towards
// one. A day after the first pledge the round closes: the pledges on the leading question become
// donations and are spent on it, and every other pledge stands for the next round, having cost nothing.
//
// No money is ever held here. A pledge is a promise to spend from the pledger's own key, and OpenRouter
// has no means of reserving an amount, so each key is checked again when the round closes and a pledge
// that can no longer be met is set aside before the leader is decided.
import { randomBytes } from 'node:crypto';
import { minimumDonationMicro } from '#lib/budget.ts';
import { money } from '#lib/format.ts';
import { AUDIT_QUESTION, byPledged, checkQuestion, extensionMs } from '#lib/round.ts';
import { scrub } from './crypto.ts';
import { all, get, run, tx } from './db.ts';
import { config } from './env.ts';
import { publishRound } from './events.ts';
import { readKey, updateKeyInfo } from './keys.ts';
import { checkKey, findModel, OpenRouterError, type KeyInfo } from './openrouter.ts';

export const MAX_OPEN_PER_PROJECT = 30;
export const MAX_OPEN_PER_ACCOUNT = 3;
export const MAX_STANDING_PLEDGES = 10;
/** An account with this many pledges that could not be met, within the period below, may not pledge. */
export const UNHONOURED_LIMIT = 3;
const UNHONOURED_WINDOW = 30 * 86_400_000;

/** Far beyond any sensible pledge. It exists to reject mistyped or malformed amounts. */
const MAX_PLEDGE_MICRO = 100_000 * 1_000_000;

export type Failure = { ok: false; status: number; message: string };
const refuse = (status: number, message: string): Failure => ({ ok: false, status, message });

type ProposalRow = {
	id: number;
	project_id: number;
	user_id: number;
	kind: 'question' | 'audit';
	question: string;
	status: 'open' | 'won' | 'withdrawn' | 'removed';
};

type ProjectClock = { id: number; round: number; round_closes_at: number | null };

function clock(projectId: number): ProjectClock | undefined {
	return get<ProjectClock>(
		'SELECT id, round, round_closes_at FROM projects WHERE id = ? AND hidden_at IS NULL',
		projectId
	);
}

/** True from the moment a round closes until it has been settled. Pledges are fixed for that time. */
const closed = (project: ProjectClock, now = Date.now()) =>
	project.round_closes_at !== null && project.round_closes_at <= now;

const SETTLING = 'The round is being settled. A further attempt may be made in a moment.';

/** A round with nothing pledged has no closing time. The next pledge starts it again. */
function restClock(projectId: number) {
	run(
		`UPDATE projects SET round_closes_at = NULL
		WHERE id = ? AND NOT EXISTS (
			SELECT 1 FROM pledges g JOIN proposals o ON o.id = g.proposal_id
			WHERE o.project_id = projects.id AND g.status = 'standing'
		)`,
		projectId
	);
}

/**
 * Pledges that could not be met: those set aside when a round closed, and those that led a round and
 * then paid for nothing at all, as when the key has a limit but the account behind it has no credit.
 */
export function unhonoured(userId: number, now = Date.now()): number {
	return (
		get<{ n: number }>(
			`SELECT COUNT(*) AS n FROM pledges g LEFT JOIN donations d ON d.id = g.donation_id
			WHERE g.user_id = ?1 AND g.settled_at >= ?2 AND (
				g.status = 'lapsed'
				OR (g.status = 'called' AND d.status = 'failed' AND d.spent_micro = 0 AND d.run_count = 0)
			)`,
			userId,
			now - UNHONOURED_WINDOW
		)?.n ?? 0
	);
}

// What a page shows.

export type RoundProposal = {
	id: number;
	kind: 'question' | 'audit';
	question: string;
	handle: string;
	avatar_url: string | null;
	pledged: number;
	backers: number;
	/** What the visitor has pledged towards it, or 0. */
	mine: number;
	/** True where the visitor proposed it and nobody else has pledged, so that it may be withdrawn. */
	withdrawable: boolean;
};

export type RoundWinner = {
	round: number;
	question: string;
	kind: 'question' | 'audit';
	handle: string;
	pledged: number;
	backers: number;
	settled_at: number;
};

export type RoundView = {
	round: number;
	closesAt: number | null;
	pledged: number;
	proposals: RoundProposal[];
	last: RoundWinner | null;
};

export function roundView(projectId: number, viewerId: number | null): RoundView {
	const project = clock(projectId);
	const rows = all<Omit<RoundProposal, 'withdrawable'> & { user_id: number }>(
		`SELECT o.id, o.kind, o.question, o.user_id, u.handle, u.avatar_url,
			COALESCE(SUM(g.amount_micro), 0) AS pledged, COUNT(g.id) AS backers,
			COALESCE(SUM(CASE WHEN g.user_id = ?1 THEN g.amount_micro ELSE 0 END), 0) AS mine
		FROM proposals o JOIN users u ON u.id = o.user_id
		LEFT JOIN pledges g ON g.proposal_id = o.id AND g.status = 'standing'
		WHERE o.project_id = ?2 AND o.status = 'open'
		GROUP BY o.id`,
		viewerId ?? 0,
		projectId
	);
	const proposals = byPledged(rows).map(({ user_id, ...row }) => ({
		...row,
		withdrawable:
			row.kind === 'question' && viewerId !== null && user_id === viewerId && row.backers === (row.mine > 0 ? 1 : 0)
	}));
	const last = get<RoundWinner>(
		`SELECT o.round, o.question, o.kind, u.handle, o.settled_at,
			COALESCE(SUM(g.amount_micro), 0) AS pledged, COUNT(g.id) AS backers
		FROM proposals o JOIN users u ON u.id = o.user_id
		LEFT JOIN pledges g ON g.proposal_id = o.id AND g.status = 'called'
		WHERE o.project_id = ? AND o.status = 'won'
		GROUP BY o.id ORDER BY o.round DESC LIMIT 1`,
		projectId
	);
	return {
		round: project?.round ?? 1,
		closesAt: project?.round_closes_at ?? null,
		pledged: proposals.reduce((sum, p) => sum + p.pledged, 0),
		proposals,
		last: last ?? null
	};
}

export type PledgeListRow = {
	id: number;
	proposal_id: number;
	status: 'standing' | 'called' | 'withdrawn' | 'lapsed' | 'released';
	reason: string | null;
	amount_micro: number;
	model_name: string;
	created_at: number;
	settled_at: number | null;
	question: string;
	kind: 'question' | 'audit';
	slug: string;
	title: string;
};

/** Pledges that stand, and those that could not be met. One that was called is listed with the donations. */
export function userPledges(userId: number, limit = 40): PledgeListRow[] {
	return all<PledgeListRow>(
		`SELECT g.id, g.proposal_id, g.status, g.reason, g.amount_micro, g.model_name, g.created_at, g.settled_at,
			o.question, o.kind, p.slug, p.title
		FROM pledges g JOIN proposals o ON o.id = g.proposal_id JOIN projects p ON p.id = o.project_id
		WHERE g.user_id = ? AND g.status IN ('standing','lapsed') AND p.hidden_at IS NULL AND o.status IN ('open','won')
		ORDER BY g.status = 'standing' DESC, g.id DESC LIMIT ?`,
		userId,
		limit
	);
}

export type AdminProposal = {
	id: number;
	question: string;
	status: string;
	created_at: number;
	handle: string;
	slug: string;
	title: string;
};

export function adminProposals(limit = 100): AdminProposal[] {
	return all<AdminProposal>(
		`SELECT o.id, o.question, o.status, o.created_at, u.handle, p.slug, p.title
		FROM proposals o JOIN users u ON u.id = o.user_id JOIN projects p ON p.id = o.project_id
		WHERE o.kind = 'question' AND o.status IN ('open','won') ORDER BY o.id DESC LIMIT ?`,
		limit
	);
}

// What a visitor may do.

export function propose(
	userId: number,
	projectId: number,
	input: { question?: unknown; kind?: unknown }
): { ok: true; id: number; existing: boolean } | Failure {
	if (!clock(projectId)) return refuse(404, 'This project could not be found.');
	let kind: 'question' | 'audit' = input.kind === 'audit' ? 'audit' : 'question';
	let question = AUDIT_QUESTION;
	if (kind === 'question') {
		const checked = checkQuestion(input.question);
		if (!checked.ok) return refuse(400, checked.message);
		question = checked.question;
		if (question.toLowerCase() === AUDIT_QUESTION.toLowerCase()) kind = 'audit';
	}
	return tx(() => {
		// A question that is already listed is not listed twice. Whoever asks for it is shown the first.
		const found =
			kind === 'audit'
				? get<{ id: number }>(
						`SELECT id FROM proposals WHERE project_id = ? AND kind = 'audit' AND status = 'open'`,
						projectId
					)
				: get<{ id: number }>(
						`SELECT id FROM proposals WHERE project_id = ? AND status = 'open' AND LOWER(question) = LOWER(?)`,
						projectId,
						question
					);
		if (found) return { ok: true as const, id: found.id, existing: true };
		if (kind === 'question') {
			const open = get<{ total: number; own: number }>(
				`SELECT COUNT(*) AS total, COALESCE(SUM(user_id = ?), 0) AS own FROM proposals
				WHERE project_id = ? AND status = 'open' AND kind = 'question'`,
				userId,
				projectId
			) ?? { total: 0, own: 0 };
			if (open.own >= MAX_OPEN_PER_ACCOUNT) {
				return refuse(429, `No more than ${MAX_OPEN_PER_ACCOUNT} questions from one account may be listed on a project at once. One may be withdrawn first.`);
			}
			if (open.total >= MAX_OPEN_PER_PROJECT) {
				return refuse(429, `${MAX_OPEN_PER_PROJECT} questions are listed on this project, which is the most that are kept at once. One of them may be backed.`);
			}
		}
		const { lastInsertRowid } = run(
			`INSERT INTO proposals (project_id, user_id, kind, question, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`,
			projectId,
			userId,
			kind,
			question,
			Date.now()
		);
		publishRound(projectId);
		return { ok: true as const, id: Number(lastInsertRowid), existing: false };
	});
}

function openProposal(id: number): (ProposalRow & { hidden_at: number | null }) | undefined {
	return get<ProposalRow & { hidden_at: number | null }>(
		`SELECT o.id, o.project_id, o.user_id, o.kind, o.question, o.status, p.hidden_at
		FROM proposals o JOIN projects p ON p.id = o.project_id WHERE o.id = ?`,
		id
	);
}

export async function pledge(
	userId: number,
	proposalId: number,
	amount: number,
	modelId: string
): Promise<{ ok: true; projectId: number; closesAt: number } | Failure> {
	const proposal = openProposal(proposalId);
	if (!proposal || proposal.hidden_at || proposal.status !== 'open') {
		return refuse(404, 'This question is no longer listed.');
	}
	const before = clock(proposal.project_id);
	if (!before) return refuse(404, 'This project could not be found.');
	if (closed(before)) return refuse(409, SETTLING);
	if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_PLEDGE_MICRO) {
		return refuse(400, 'The amount is not valid. An amount of at least $0.10 is required.');
	}
	if (unhonoured(userId) >= UNHONOURED_LIMIT) {
		return refuse(403, `${UNHONOURED_LIMIT} pledges from this account could not be met in the last 30 days, so no further pledge can be accepted for the present.`);
	}
	const key = readKey(userId);
	if (!key) return refuse(400, 'An OpenRouter key must be added first.');

	let model;
	try {
		model = await findModel(modelId);
	} catch {
		return refuse(502, 'OpenRouter could not be reached. The attempt may be repeated shortly.');
	}
	if (!model) return refuse(400, 'This model is not offered by OpenRouter.');
	const smallest = minimumDonationMicro(model.pricing);
	if (amount < smallest) {
		return refuse(400, `An amount of at least ${money(smallest)} is required for a run of this model.`);
	}

	try {
		const info = await checkKey(key);
		updateKeyInfo(userId, info);
		if (info.remainingMicro !== null && amount > info.remainingMicro) {
			return refuse(400, "This amount exceeds what remains on the key's spending limit.");
		}
	} catch (err) {
		if (err instanceof OpenRouterError && (err.status === 401 || err.status === 403)) {
			return refuse(400, 'The key is no longer accepted by OpenRouter. It should be replaced on the account page.');
		}
		return refuse(502, 'OpenRouter could not be reached. The attempt may be repeated shortly.');
	}

	// The checks above took time, during which the round may have closed or the question may have gone.
	return tx(() => {
		const now = Date.now();
		const still = openProposal(proposalId);
		const project = clock(proposal.project_id);
		if (!still || still.status !== 'open' || !project) return refuse(404, 'This question is no longer listed.');
		if (closed(project, now)) return refuse(409, SETTLING);
		const mine = get<{ id: number }>(
			`SELECT id FROM pledges WHERE proposal_id = ? AND user_id = ? AND status = 'standing'`,
			proposalId,
			userId
		);
		if (mine) {
			// A second pledge towards the same question replaces the first.
			run(`UPDATE pledges SET amount_micro = ?, model = ?, model_name = ? WHERE id = ?`, amount, model.id, model.name, mine.id);
		} else {
			const standing =
				get<{ n: number }>(`SELECT COUNT(*) AS n FROM pledges WHERE user_id = ? AND status = 'standing'`, userId)?.n ?? 0;
			if (standing >= MAX_STANDING_PLEDGES) {
				return refuse(429, `No more than ${MAX_STANDING_PLEDGES} pledges from one account may stand at once. One may be withdrawn on the account page.`);
			}
			run(
				`INSERT INTO pledges (proposal_id, user_id, model, model_name, amount_micro, status, created_at)
				VALUES (?, ?, ?, ?, ?, 'standing', ?)`,
				proposalId,
				userId,
				model.id,
				model.name,
				amount,
				now
			);
		}
		// The first pledge starts the clock, and one made at the very end leaves time for an answer.
		const extended = now + extensionMs(config.roundMs);
		const closesAt = project.round_closes_at === null ? now + config.roundMs : Math.max(project.round_closes_at, extended);
		run('UPDATE projects SET round_closes_at = ? WHERE id = ?', closesAt, project.id);
		publishRound(project.id);
		return { ok: true as const, projectId: project.id, closesAt };
	});
}

export function withdrawPledge(userId: number, proposalId: number): { ok: true } | Failure {
	const proposal = openProposal(proposalId);
	if (!proposal) return refuse(404, 'This pledge could not be found.');
	return tx(() => {
		const mine = get<{ id: number }>(
			`SELECT id FROM pledges WHERE proposal_id = ? AND user_id = ? AND status = 'standing'`,
			proposalId,
			userId
		);
		if (!mine) return refuse(404, 'This pledge could not be found.');
		const project = clock(proposal.project_id);
		if (project && closed(project)) return refuse(409, SETTLING);
		run(`UPDATE pledges SET status = 'withdrawn', settled_at = ? WHERE id = ?`, Date.now(), mine.id);
		restClock(proposal.project_id);
		publishRound(proposal.project_id);
		return { ok: true as const };
	});
}

/** A question may be withdrawn by whoever proposed it, until someone else has pledged towards it. */
export function withdrawProposal(userId: number, proposalId: number): { ok: true } | Failure {
	const proposal = openProposal(proposalId);
	if (!proposal || proposal.user_id !== userId || proposal.status !== 'open' || proposal.kind !== 'question') {
		return refuse(404, 'This question could not be found.');
	}
	return tx(() => {
		const others =
			get<{ n: number }>(
				`SELECT COUNT(*) AS n FROM pledges WHERE proposal_id = ? AND status = 'standing' AND user_id <> ?`,
				proposalId,
				userId
			)?.n ?? 0;
		if (others > 0) return refuse(409, 'Pledges have been made towards this question by others, so it can no longer be withdrawn.');
		const project = clock(proposal.project_id);
		const own = get<{ id: number }>(
			`SELECT id FROM pledges WHERE proposal_id = ? AND status = 'standing' AND user_id = ?`,
			proposalId,
			userId
		);
		if (own && project && closed(project)) return refuse(409, SETTLING);
		const now = Date.now();
		run(`UPDATE pledges SET status = 'withdrawn', settled_at = ? WHERE proposal_id = ? AND status = 'standing'`, now, proposalId);
		run(`UPDATE proposals SET status = 'withdrawn', settled_at = ? WHERE id = ?`, now, proposalId);
		restClock(proposal.project_id);
		publishRound(proposal.project_id);
		return { ok: true as const };
	});
}

// What the operator, or a change to an account, may undo.

function release(where: string, reason: string, ...params: (string | number)[]) {
	const affected = all<{ project_id: number }>(
		`SELECT DISTINCT o.project_id FROM pledges g JOIN proposals o ON o.id = g.proposal_id
		WHERE g.status = 'standing' AND ${where}`,
		...params
	);
	run(
		`UPDATE pledges SET status = 'released', reason = ?, settled_at = ?
		WHERE status = 'standing' AND id IN (
			SELECT g.id FROM pledges g JOIN proposals o ON o.id = g.proposal_id WHERE g.status = 'standing' AND ${where}
		)`,
		reason,
		Date.now(),
		...params
	);
	for (const { project_id } of affected) {
		restClock(project_id);
		publishRound(project_id);
	}
}

/** A pledge was agreed against the key that was held at the time, so it does not move to a new one. */
export function releasePledgesForUser(userId: number, reason: string) {
	release('g.user_id = ?', reason, userId);
}

export function releasePledgesForProject(projectId: number, reason: string) {
	release('o.project_id = ?', reason, projectId);
}

/**
 * Takes a question out of public view. Its pledges are released, and the donations that came from it
 * are returned so that they can be stopped.
 */
export function removeProposal(id: number): { donations: number[] } | null {
	const proposal = openProposal(id);
	if (!proposal) return null;
	run(`UPDATE proposals SET status = 'removed', settled_at = COALESCE(settled_at, ?) WHERE id = ?`, Date.now(), id);
	release('g.proposal_id = ?', 'The question was removed by the operator of this site.', id);
	publishRound(proposal.project_id);
	return {
		donations: all<{ id: number }>(
			`SELECT id FROM donations WHERE proposal_id = ? AND status IN ('queued','running')`,
			id
		).map((d) => d.id)
	};
}

/** Everything an account has listed is removed with it. */
export function removeProposalsBy(userId: number): number[] {
	const open = all<{ id: number }>(
		`SELECT id FROM proposals WHERE user_id = ? AND status = 'open' AND kind = 'question'`,
		userId
	);
	return open.flatMap(({ id }) => removeProposal(id)?.donations ?? []);
}

// Settlement.

type Standing = {
	id: number;
	proposal_id: number;
	user_id: number;
	model: string;
	model_name: string;
	amount_micro: number;
};

function standingPledges(projectId: number): Standing[] {
	return all<Standing>(
		`SELECT g.id, g.proposal_id, g.user_id, g.model, g.model_name, g.amount_micro
		FROM pledges g JOIN proposals o ON o.id = g.proposal_id
		WHERE o.project_id = ? AND o.status = 'open' AND g.status = 'standing' ORDER BY g.id`,
		projectId
	);
}

type SettleState = { busy: Set<number>; notBefore: Map<number, number> };
const holder = globalThis as unknown as { __osRounds?: SettleState };
const state: SettleState = (holder.__osRounds ??= { busy: new Set(), notBefore: new Map() });

/** Thrown where OpenRouter cannot be asked, so that the round is settled later and nothing is decided on a guess. */
class Unreachable extends Error {}

/** The reason a pledge can no longer be met, or null where it can. */
async function shortfall(pledge: Standing, keys: Map<number, KeyInfo | string>): Promise<string | null> {
	let model;
	try {
		model = await findModel(pledge.model);
	} catch {
		throw new Unreachable();
	}
	if (!model) return 'The model is no longer offered by OpenRouter.';
	let info = keys.get(pledge.user_id);
	if (info === undefined) {
		const key = readKey(pledge.user_id);
		if (!key) info = 'The OpenRouter key had been removed.';
		else {
			try {
				info = await checkKey(key);
				updateKeyInfo(pledge.user_id, info);
			} catch (err) {
				if (err instanceof OpenRouterError && (err.status === 401 || err.status === 403)) {
					info = 'The key was no longer accepted by OpenRouter when the round closed.';
				} else throw new Unreachable();
			}
		}
		keys.set(pledge.user_id, info);
	}
	if (typeof info === 'string') return info;
	if (info.remainingMicro !== null && info.remainingMicro < pledge.amount_micro) {
		return 'Too little remained on the key when the round closed.';
	}
	return null;
}

/**
 * Decides one round. The leading question's pledges are checked. If any cannot be met it may no longer
 * lead, so the order is taken again, until the question in front has had every one of its pledges
 * checked. A question's total can only fall, so nothing behind it needs to be checked at all.
 */
async function settle(projectId: number) {
	const lapsed = new Map<number, string>();
	const met = new Set<number>();
	const keys = new Map<number, KeyInfo | string>();
	let winner: number | null = null;
	for (;;) {
		const standing = standingPledges(projectId).filter((p) => !lapsed.has(p.id));
		if (standing.length === 0) break;
		const totals = new Map<number, number>();
		for (const p of standing) totals.set(p.proposal_id, (totals.get(p.proposal_id) ?? 0) + p.amount_micro);
		const lead = byPledged([...totals].map(([id, pledged]) => ({ id, pledged })))[0].id;
		const unchecked = standing.filter((p) => p.proposal_id === lead && !met.has(p.id));
		if (unchecked.length === 0) {
			winner = lead;
			break;
		}
		for (const p of unchecked) {
			const reason = await shortfall(p, keys);
			if (reason) lapsed.set(p.id, reason);
			else met.add(p.id);
		}
	}

	tx(() => {
		const now = Date.now();
		const project = get<ProjectClock>('SELECT id, round, round_closes_at FROM projects WHERE id = ?', projectId);
		if (!project || project.round_closes_at === null) return;
		for (const [id, reason] of lapsed) {
			run(
				`UPDATE pledges SET status = 'lapsed', reason = ?, settled_at = ? WHERE id = ? AND status = 'standing'`,
				reason,
				now,
				id
			);
		}
		// Pledges are fixed while a round is settled, but one may have been released by the operator.
		const winning = winner === null ? [] : standingPledges(projectId).filter((p) => p.proposal_id === winner && met.has(p.id));
		if (winner !== null && winning.length === 0) return;
		if (winner === null) {
			restClock(projectId);
			return;
		}
		for (const p of winning) {
			const { lastInsertRowid } = run(
				`INSERT INTO donations (public_id, project_id, user_id, model, model_name, amount_micro, status, created_at, proposal_id)
				VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
				randomBytes(8).toString('hex'),
				projectId,
				p.user_id,
				p.model,
				p.model_name,
				p.amount_micro,
				now,
				winner
			);
			run(
				`UPDATE pledges SET status = 'called', settled_at = ?, donation_id = ? WHERE id = ?`,
				now,
				Number(lastInsertRowid),
				p.id
			);
		}
		run(`UPDATE proposals SET status = 'won', round = ?, settled_at = ? WHERE id = ?`, project.round, now, winner);
		// What was pledged towards the other questions stands, so the next round begins at once.
		run('UPDATE projects SET round = round + 1, round_closes_at = ? WHERE id = ?', now + config.roundMs, projectId);
		restClock(projectId);
	});
	publishRound(projectId);
}

/** Called on the worker's own timer. Each round that has closed is settled, one at a time per project. */
export function settleDue(now = Date.now()) {
	const due = all<{ id: number }>(
		`SELECT id FROM projects WHERE round_closes_at IS NOT NULL AND round_closes_at <= ? AND hidden_at IS NULL`,
		now
	);
	for (const { id } of due) {
		if (state.busy.has(id) || (state.notBefore.get(id) ?? 0) > now) continue;
		state.busy.add(id);
		settle(id)
			.then(() => state.notBefore.delete(id))
			.catch((err) => {
				// With OpenRouter out of reach, nothing is decided. The round is tried again shortly.
				if (!(err instanceof Unreachable)) console.error('A round could not be settled:', scrub(String(err)));
				state.notBefore.set(id, Date.now() + 30_000);
			})
			.finally(() => state.busy.delete(id));
	}
}
