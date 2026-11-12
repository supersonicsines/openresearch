import { all, get, run } from './db.ts';
import type { User } from './db.ts';

export type ProjectSummary = {
	id: number;
	slug: string;
	title: string;
	prompt: string;
	author_handle: string;
	author_avatar: string | null;
	created_at: number;
	spent: number;
	runs: number;
	donors: number;
	last_at: number;
	active: 0 | 1;
	/** Pledged but not yet spent. */
	pending: number;
	/** Spent on runs completed in the last 24 hours. */
	spent_24h: number;
	/** The number of the round that is open. */
	round: number;
	/** When that round closes, once a pledge has been made in it. */
	round_closes_at: number | null;
	/** Pledged towards questions in that round. Nothing is charged for it unless its question leads. */
	backing: number;
};

const SUMMARY = `
SELECT p.id, p.slug, p.title, p.prompt, p.created_at, p.round, p.round_closes_at,
	(SELECT COALESCE(SUM(g.amount_micro), 0) FROM pledges g JOIN proposals o ON o.id = g.proposal_id
		WHERE o.project_id = p.id AND o.status = 'open' AND g.status = 'standing') AS backing,
	u.handle AS author_handle, u.avatar_url AS author_avatar,
	COALESCE(s.spent, 0) AS spent, COALESCE(s.runs, 0) AS runs, COALESCE(s.donors, 0) AS donors,
	COALESCE(s.last_at, p.created_at) AS last_at,
	COALESCE(s.spent_24h, 0) AS spent_24h,
	EXISTS (SELECT 1 FROM donations d WHERE d.project_id = p.id AND d.status IN ('queued','running')) AS active,
	(SELECT COALESCE(SUM(MAX(d.amount_micro - d.spent_micro, 0)), 0) FROM donations d
		WHERE d.project_id = p.id AND d.status IN ('queued','running')) AS pending
FROM projects p
JOIN users u ON u.id = p.author_id
LEFT JOIN (
	SELECT project_id, SUM(cost_micro) AS spent, COUNT(*) AS runs,
		COUNT(DISTINCT user_id) AS donors, MAX(finished_at) AS last_at,
		SUM(CASE WHEN finished_at >= unixepoch() * 1000 - 86400000 THEN cost_micro ELSE 0 END) AS spent_24h
	FROM runs WHERE status = 'completed' GROUP BY project_id
) s ON s.project_id = p.id`;

/** Removed projects are left out of every public list. */
const VISIBLE = 'p.hidden_at IS NULL';

const SORTS = {
	donated: 'spent DESC, p.created_at DESC',
	recent: 'p.created_at DESC, p.id DESC',
	rising: 'spent_24h DESC, active DESC, pending DESC, backing DESC, last_at DESC',
	active: 'active DESC, last_at DESC'
} as const;

export type ProjectSort = keyof typeof SORTS;

export function isProjectSort(value: unknown): value is ProjectSort {
	return typeof value === 'string' && Object.hasOwn(SORTS, value);
}

export function listProjects(sort: ProjectSort, limit: number, offset = 0): ProjectSummary[] {
	return all<ProjectSummary>(
		`${SUMMARY} WHERE ${VISIBLE} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`,
		limit,
		offset
	);
}

export function countProjects(): number {
	return get<{ n: number }>(`SELECT COUNT(*) AS n FROM projects p WHERE ${VISIBLE}`)?.n ?? 0;
}

export type ProjectFilter = 'all' | 'unfunded' | 'funded' | 'live';

const FILTERS: Record<ProjectFilter, string> = {
	all: '1',
	unfunded: 'COALESCE(s.runs, 0) = 0 AND NOT EXISTS (SELECT 1 FROM donations o WHERE o.project_id = p.id AND o.status IN (\'queued\',\'running\'))',
	funded: 'COALESCE(s.runs, 0) > 0',
	live: 'EXISTS (SELECT 1 FROM donations o WHERE o.project_id = p.id AND o.status IN (\'queued\',\'running\'))'
};

export function isProjectFilter(value: unknown): value is ProjectFilter {
	return typeof value === 'string' && Object.hasOwn(FILTERS, value);
}

/** Characters with a special meaning to LIKE are matched literally. */
function likeTerm(query: string): string {
	return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const MATCHES = `(p.prompt LIKE ? ESCAPE '\\' OR u.handle LIKE ? ESCAPE '\\' OR p.slug LIKE ? ESCAPE '\\')`;

/** The page of every prompt: filtered, searched, and sorted. */
export function browseProjects(input: {
	sort: ProjectSort;
	filter: ProjectFilter;
	query: string;
	limit: number;
	offset: number;
}): { rows: ProjectSummary[]; total: number } {
	const where = [VISIBLE, FILTERS[input.filter]];
	const params: string[] = [];
	if (input.query) {
		const term = likeTerm(input.query);
		where.push(MATCHES);
		params.push(term, term, term);
	}
	const clause = where.join(' AND ');
	const total =
		get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${SUMMARY} WHERE ${clause})`, ...params)?.n ?? 0;
	const rows = all<ProjectSummary>(
		`${SUMMARY} WHERE ${clause} ORDER BY ${SORTS[input.sort]} LIMIT ? OFFSET ?`,
		...params,
		input.limit,
		input.offset
	);
	return { rows, total };
}

export type SeriesPoint = { at: number; micro: number };

/** Cumulative amounts spent, oldest first, for each of the given projects. */
export function fundingSeries(projectIds: number[]): Map<number, SeriesPoint[]> {
	const out = new Map<number, SeriesPoint[]>();
	if (projectIds.length === 0) return out;
	const rows = all<{ project_id: number; at: number; cost: number }>(
		`SELECT project_id, finished_at AS at, cost_micro AS cost FROM runs
		WHERE status = 'completed' AND project_id IN (${projectIds.map(() => '?').join(',')})
		ORDER BY finished_at, id`,
		...projectIds
	);
	for (const row of rows) {
		const series = out.get(row.project_id) ?? [];
		series.push({ at: row.at, micro: (series.at(-1)?.micro ?? 0) + row.cost });
		out.set(row.project_id, series);
	}
	return out;
}

export type ActivityItem = {
	key: string;
	kind: 'submitted' | 'pledged' | 'completed' | 'proposed' | 'backed' | 'won';
	at: number;
	handle: string;
	id: number;
	slug: string;
	micro: number;
	seq: number;
};

/** What has happened most recently across the site. Only public facts appear here. */
export function recentActivity(limit = 24): ActivityItem[] {
	return all<ActivityItem>(
		`SELECT * FROM (
			SELECT * FROM (
				SELECT 'p' || p.id AS key, 'submitted' AS kind, p.created_at AS at, u.handle, p.id, p.slug, 0 AS micro, 0 AS seq
				FROM projects p JOIN users u ON u.id = p.author_id WHERE ${VISIBLE}
				ORDER BY p.created_at DESC LIMIT ?1
			)
			UNION ALL
			SELECT * FROM (
				SELECT 'd' || d.id, 'pledged', d.created_at, u.handle, p.id, p.slug, d.amount_micro, 0
				FROM donations d JOIN users u ON u.id = d.user_id JOIN projects p ON p.id = d.project_id
				WHERE d.proposal_id IS NULL AND ${VISIBLE}
				ORDER BY d.created_at DESC LIMIT ?1
			)
			UNION ALL
			SELECT * FROM (
				SELECT 'o' || o.id, 'proposed', o.created_at, u.handle, p.id, p.slug, 0, 0
				FROM proposals o JOIN users u ON u.id = o.user_id JOIN projects p ON p.id = o.project_id
				WHERE o.kind = 'question' AND o.status IN ('open','won') AND ${VISIBLE}
				ORDER BY o.created_at DESC LIMIT ?1
			)
			UNION ALL
			SELECT * FROM (
				SELECT 'g' || g.id, 'backed', g.created_at, u.handle, p.id, p.slug, g.amount_micro, 0
				FROM pledges g JOIN proposals o ON o.id = g.proposal_id JOIN users u ON u.id = g.user_id
				JOIN projects p ON p.id = o.project_id
				WHERE g.status IN ('standing','called') AND o.status IN ('open','won') AND ${VISIBLE}
				ORDER BY g.created_at DESC LIMIT ?1
			)
			UNION ALL
			SELECT * FROM (
				SELECT 'w' || o.id, 'won', o.settled_at, u.handle, p.id, p.slug,
					(SELECT COALESCE(SUM(g.amount_micro), 0) FROM pledges g WHERE g.proposal_id = o.id AND g.status = 'called'),
					o.round
				FROM proposals o JOIN users u ON u.id = o.user_id JOIN projects p ON p.id = o.project_id
				WHERE o.status = 'won' AND ${VISIBLE}
				ORDER BY o.settled_at DESC LIMIT ?1
			)
			UNION ALL
			SELECT * FROM (
				SELECT 'r' || r.id, 'completed', r.finished_at, u.handle, p.id, p.slug, r.cost_micro, r.seq
				FROM runs r JOIN users u ON u.id = r.user_id JOIN projects p ON p.id = r.project_id
				WHERE r.status = 'completed' AND ${VISIBLE}
				ORDER BY r.finished_at DESC LIMIT ?1
			)
		) ORDER BY at DESC, key DESC LIMIT ?1`,
		limit
	);
}

export type ProjectDetail = ProjectSummary & {
	findings_md: string;
	findings_html: string;
	open_questions: string;
	head_sha: string | null;
	hidden_at: number | null;
};

export function getProject(slug: string): ProjectDetail | undefined {
	return get<ProjectDetail>(
		`SELECT sub.*, q.findings_md, q.findings_html, q.open_questions, q.hidden_at,
			(SELECT commit_sha FROM runs r WHERE r.project_id = sub.id ORDER BY seq DESC LIMIT 1) AS head_sha
		FROM (${SUMMARY} WHERE p.slug = ? AND ${VISIBLE}) sub
		JOIN projects q ON q.id = sub.id`,
		slug
	);
}

/** True for a project that existed but has been taken down, which is not the same as not found. */
export function projectRemoved(slug: string): boolean {
	return Boolean(get<{ id: number }>('SELECT id FROM projects WHERE slug = ? AND hidden_at IS NOT NULL', slug));
}

export function visibleProjectId(slug: string): number | null {
	return get<{ id: number }>('SELECT id FROM projects p WHERE p.slug = ? AND ' + VISIBLE, slug)?.id ?? null;
}

export type DonorRow = {
	handle: string;
	name: string;
	avatar_url: string | null;
	spent: number;
	runs: number;
};

export function projectDonors(projectId: number, limit = 8): DonorRow[] {
	return all<DonorRow>(
		`SELECT u.handle, u.name, u.avatar_url, SUM(r.cost_micro) AS spent, COUNT(*) AS runs
		FROM runs r JOIN users u ON u.id = r.user_id
		WHERE r.project_id = ? AND r.status = 'completed'
		GROUP BY u.id ORDER BY spent DESC LIMIT ?`,
		projectId,
		limit
	);
}

export type RunRow = {
	id: number;
	seq: number;
	model: string;
	model_name: string;
	question: string;
	report_md: string;
	report_html: string;
	sources: string;
	input_tokens: number;
	output_tokens: number;
	cost_micro: number;
	commit_sha: string | null;
	finished_at: number;
	handle: string;
	avatar_url: string | null;
	/** Whoever proposed the question, where it was chosen in a round. */
	proposer: string | null;
	/** The run whose edit first listed the question, where it came from the editor's list. */
	raised_by: number | null;
};

// A run answers a proposed question only where its question is that one. The later runs of the same
// donation take theirs from the list.
const RUN_FIELDS = `r.id, r.seq, r.model, r.model_name, r.question, r.sources, r.input_tokens,
	r.output_tokens, r.cost_micro, r.commit_sha, r.finished_at, u.handle, u.avatar_url,
	(SELECT pu.handle FROM donations d JOIN proposals o ON o.id = d.proposal_id JOIN users pu ON pu.id = o.user_id
		WHERE d.id = r.donation_id AND o.kind = 'question' AND o.status = 'won' AND o.question = r.question) AS proposer,
	(SELECT NULLIF(q.parent_seq, 0) FROM questions q
		WHERE q.project_id = r.project_id AND q.run_seq = r.seq AND q.origin = 'editor') AS raised_by`;

export type RunListRow = Omit<RunRow, 'report_md' | 'report_html'>;

export function projectRuns(projectId: number, limit = 200): RunListRow[] {
	return all<RunListRow>(
		`SELECT ${RUN_FIELDS} FROM runs r JOIN users u ON u.id = r.user_id
		WHERE r.project_id = ? AND r.status = 'completed' ORDER BY r.seq DESC LIMIT ?`,
		projectId,
		limit
	);
}

export function getRun(projectId: number, seq: number): RunRow | undefined {
	return get<RunRow>(
		`SELECT ${RUN_FIELDS}, r.report_md, r.report_html FROM runs r JOIN users u ON u.id = r.user_id
		WHERE r.project_id = ? AND r.seq = ? AND r.status = 'completed'`,
		projectId,
		seq
	);
}

export type LeaderboardProject = {
	id: number;
	slug: string;
	title: string;
	spent: number;
	runs: number;
	donors: number;
	author_handle: string;
	author_avatar: string | null;
};

export type LeaderboardDonor = {
	handle: string;
	name: string;
	avatar_url: string | null;
	spent: number;
	runs: number;
	projects: number;
};

/** Both boards count money actually spent on completed runs, as reported by OpenRouter. */
export function projectLeaderboard(since: number, limit = 100): LeaderboardProject[] {
	return all<LeaderboardProject>(
		`SELECT p.id, p.slug, p.title, SUM(r.cost_micro) AS spent, COUNT(*) AS runs,
			COUNT(DISTINCT r.user_id) AS donors, a.handle AS author_handle, a.avatar_url AS author_avatar
		FROM runs r JOIN projects p ON p.id = r.project_id JOIN users a ON a.id = p.author_id
		WHERE r.status = 'completed' AND r.finished_at >= ? AND ${VISIBLE}
		GROUP BY p.id ORDER BY spent DESC, p.id LIMIT ?`,
		since,
		limit
	);
}

export function donorLeaderboard(since: number, limit = 100): LeaderboardDonor[] {
	return all<LeaderboardDonor>(
		`SELECT u.handle, u.name, u.avatar_url, SUM(r.cost_micro) AS spent, COUNT(*) AS runs,
			COUNT(DISTINCT r.project_id) AS projects
		FROM runs r JOIN users u ON u.id = r.user_id
		WHERE r.status = 'completed' AND r.finished_at >= ? AND u.suspended_at IS NULL
		GROUP BY u.id ORDER BY spent DESC, u.id LIMIT ?`,
		since,
		limit
	);
}

export function userByHandle(handle: string): User | undefined {
	// Suspended accounts have no public page.
	return get<User>(
		'SELECT * FROM users WHERE handle_lower = ? AND suspended_at IS NULL ORDER BY id DESC',
		handle.toLowerCase()
	);
}

export type DonorStats = { spent: number; runs: number; projects: number; rank: number | null };

export function donorStats(userId: number): DonorStats {
	const row = get<{ spent: number; runs: number; projects: number }>(
		`SELECT COALESCE(SUM(cost_micro), 0) AS spent, COUNT(*) AS runs,
			COUNT(DISTINCT project_id) AS projects
		FROM runs WHERE user_id = ? AND status = 'completed'`,
		userId
	) ?? { spent: 0, runs: 0, projects: 0 };
	if (row.runs === 0) return { ...row, rank: null };
	const rank = get<{ n: number }>(
		`SELECT COUNT(*) + 1 AS n FROM (
			SELECT SUM(cost_micro) AS total FROM runs WHERE status = 'completed' GROUP BY user_id
		) WHERE total > ?`,
		row.spent
	);
	return { ...row, rank: rank?.n ?? null };
}

export function projectsFundedBy(userId: number): LeaderboardProject[] {
	return all<LeaderboardProject>(
		`SELECT p.id, p.slug, p.title, SUM(r.cost_micro) AS spent, COUNT(*) AS runs,
			COUNT(DISTINCT r.user_id) AS donors, a.handle AS author_handle, a.avatar_url AS author_avatar
		FROM runs r JOIN projects p ON p.id = r.project_id JOIN users a ON a.id = p.author_id
		WHERE r.user_id = ? AND r.status = 'completed' AND ${VISIBLE}
		GROUP BY p.id ORDER BY spent DESC LIMIT 100`,
		userId
	);
}

export function projectsSubmittedBy(userId: number): ProjectSummary[] {
	return all<ProjectSummary>(
		`${SUMMARY} WHERE p.author_id = ? AND ${VISIBLE} ORDER BY p.created_at DESC LIMIT 100`,
		userId
	);
}

export type DonationRow = {
	id: number;
	public_id: string;
	project_id: number;
	user_id: number;
	model: string;
	model_name: string;
	amount_micro: number;
	spent_micro: number;
	run_count: number;
	status: 'queued' | 'running' | 'completed' | 'stopped' | 'failed';
	end_reason: string | null;
	created_at: number;
	finished_at: number | null;
	/** The question it was pledged towards, where it came from a round. */
	proposal_id: number | null;
};

export type DonationListRow = DonationRow & { slug: string; title: string; question: string | null };

export function userDonations(userId: number, limit = 50): DonationListRow[] {
	return all<DonationListRow>(
		`SELECT d.*, p.slug, CASE WHEN p.hidden_at IS NULL THEN p.title ELSE 'A project that has been removed' END AS title,
			(SELECT o.question FROM proposals o WHERE o.id = d.proposal_id AND o.status = 'won' AND p.hidden_at IS NULL) AS question
		FROM donations d JOIN projects p ON p.id = d.project_id
		WHERE d.user_id = ? ORDER BY d.id DESC LIMIT ?`,
		userId,
		limit
	);
}

export type DonationShare = DonationRow & { slug: string; title: string; handle: string; avatar_url: string | null };

export function donationByPublicId(publicId: string): DonationShare | undefined {
	return get<DonationShare>(
		`SELECT d.*, p.slug, p.title, u.handle, u.avatar_url
		FROM donations d JOIN projects p ON p.id = d.project_id JOIN users u ON u.id = d.user_id
		WHERE d.public_id = ? AND ${VISIBLE}`,
		publicId
	);
}

export function totals() {
	const row = get<{ spent: number; runs: number; donors: number }>(
		`SELECT COALESCE(SUM(cost_micro), 0) AS spent, COUNT(*) AS runs,
			COUNT(DISTINCT user_id) AS donors FROM runs WHERE status = 'completed'`
	) ?? { spent: 0, runs: 0, donors: 0 };
	const live = get<{ n: number }>(
		`SELECT COUNT(DISTINCT d.project_id) AS n FROM donations d JOIN projects p ON p.id = d.project_id
		WHERE d.status IN ('queued','running') AND ${VISIBLE}`
	);
	return { ...row, live: live?.n ?? 0 };
}

export type ReportRow = {
	id: number;
	reason: string;
	created_at: number;
	slug: string;
	title: string;
	hidden_at: number | null;
	author_handle: string;
	reporter: string | null;
};

export function openReports(limit = 100): ReportRow[] {
	return all<ReportRow>(
		`SELECT r.id, r.reason, r.created_at, p.slug, p.title, p.hidden_at, a.handle AS author_handle, u.handle AS reporter
		FROM reports r JOIN projects p ON p.id = r.project_id JOIN users a ON a.id = p.author_id
		LEFT JOIN users u ON u.id = r.reporter_id
		WHERE r.resolved_at IS NULL ORDER BY r.id DESC LIMIT ?`,
		limit
	);
}

export type AdminProject = {
	id: number;
	slug: string;
	title: string;
	created_at: number;
	hidden_at: number | null;
	hidden_reason: string | null;
	author_handle: string;
	author_suspended: number | null;
};

export function adminProjects(limit = 100): AdminProject[] {
	return all<AdminProject>(
		`SELECT p.id, p.slug, p.title, p.created_at, p.hidden_at, p.hidden_reason,
			u.handle AS author_handle, u.suspended_at AS author_suspended
		FROM projects p JOIN users u ON u.id = p.author_id ORDER BY p.id DESC LIMIT ?`,
		limit
	);
}

export { run };
