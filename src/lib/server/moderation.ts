// What the operator can do once something has been published. Prompts are not reviewed in advance,
// so these are what stands between a complaint and the removal of the material complained of.
import { rm } from 'node:fs/promises';
import { all, get, run, tx } from './db.ts';
import { config } from './env.ts';
import { deleteKey } from './keys.ts';
import { repoDir, repoExists } from './repo.ts';
import { stopDonation, stopDonationsForUser } from './worker.ts';

export function isAdmin(user: { handle: string } | null | undefined): boolean {
	return Boolean(user) && config.adminHandles.includes(user!.handle.toLowerCase());
}

function stopForProject(projectId: number, reason: string) {
	const open = all<{ id: number }>(
		`SELECT id FROM donations WHERE project_id = ? AND status IN ('queued','running')`,
		projectId
	);
	for (const { id } of open) stopDonation(id, reason);
}

/** Takes a project out of every public view. It can be restored, since nothing has been deleted. */
export function hideProject(slug: string, reason: string) {
	const project = get<{ id: number }>('SELECT id FROM projects WHERE slug = ?', slug);
	if (!project) return false;
	run('UPDATE projects SET hidden_at = ?, hidden_reason = ? WHERE id = ?', Date.now(), reason, project.id);
	stopForProject(project.id, 'The project was removed by the operator of this site.');
	return true;
}

export function restoreProject(slug: string) {
	run('UPDATE projects SET hidden_at = NULL, hidden_reason = NULL WHERE slug = ?', slug);
}

/**
 * Removes the text of a project for good: the prompt, the findings, every report and the repository.
 * The amounts remain, because they record what donors actually spent.
 */
export async function purgeProject(slug: string) {
	const project = get<{ id: number }>('SELECT id FROM projects WHERE slug = ?', slug);
	if (!project) return false;
	hideProject(slug, 'Deleted by the operator of this site.');
	tx(() => {
		run(
			`UPDATE projects SET title = '[deleted]', prompt = '[deleted]', findings_md = '', findings_html = '', open_questions = '[]'
			WHERE id = ?`,
			project.id
		);
		run(
			`UPDATE runs SET question = '[deleted]', report_md = '', report_html = '', sources = '[]' WHERE project_id = ?`,
			project.id
		);
	});
	if (repoExists(slug)) await rm(repoDir(slug), { recursive: true, force: true });
	return true;
}

/** Ends an account's access, and stops anything that account has in progress. */
export function suspendUser(handle: string, hidePrompts: boolean) {
	const user = get<{ id: number }>('SELECT id FROM users WHERE handle_lower = ? ORDER BY id DESC', handle.toLowerCase());
	if (!user) return false;
	run('UPDATE users SET suspended_at = ? WHERE id = ?', Date.now(), user.id);
	run('DELETE FROM sessions WHERE user_id = ?', user.id);
	stopDonationsForUser(user.id, 'The account was suspended by the operator of this site.');
	deleteKey(user.id);
	if (hidePrompts) {
		const projects = all<{ slug: string }>('SELECT slug FROM projects WHERE author_id = ? AND hidden_at IS NULL', user.id);
		for (const { slug } of projects) hideProject(slug, 'The account that submitted it was suspended.');
	}
	return true;
}

export function restoreUser(handle: string) {
	run('UPDATE users SET suspended_at = NULL WHERE handle_lower = ?', handle.toLowerCase());
}

export const MAX_REPORT_CHARS = 1_000;

export function addReport(projectId: number, reporterId: number | null, reason: string) {
	run(
		'INSERT INTO reports (project_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)',
		projectId,
		reporterId,
		reason,
		Date.now()
	);
}

export function resolveReport(id: number) {
	run('UPDATE reports SET resolved_at = ? WHERE id = ?', Date.now(), id);
}

/** Every open report on a project is closed once that project has been dealt with. */
export function resolveReportsFor(slug: string) {
	run(
		`UPDATE reports SET resolved_at = ?
		WHERE resolved_at IS NULL AND project_id = (SELECT id FROM projects WHERE slug = ?)`,
		Date.now(),
		slug
	);
}
