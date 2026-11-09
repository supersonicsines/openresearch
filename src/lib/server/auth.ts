import type { Cookies } from '@sveltejs/kit';
import { randomToken, sha256 } from './crypto.ts';
import { get, run, type User } from './db.ts';

export const SESSION_COOKIE = 'os_session';
const SESSION_DAYS = 30;

const cookieOptions = (url: URL) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: url.protocol === 'https:'
});

export function upsertUser(input: {
	githubId: string;
	handle: string;
	name: string;
	avatarUrl: string | null;
}): User {
	const now = Date.now();
	run(
		`INSERT INTO users (github_id, handle, handle_lower, name, avatar_url, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (github_id) DO UPDATE SET
			handle = excluded.handle, handle_lower = excluded.handle_lower,
			name = excluded.name, avatar_url = excluded.avatar_url`,
		input.githubId,
		input.handle,
		input.handle.toLowerCase(),
		input.name,
		input.avatarUrl,
		now
	);
	return get<User>('SELECT * FROM users WHERE github_id = ?', input.githubId)!;
}

export function startSession(cookies: Cookies, url: URL, userId: number) {
	const token = randomToken();
	const expires = Date.now() + SESSION_DAYS * 86_400_000;
	run(
		'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
		sha256(token),
		userId,
		expires
	);
	run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
	cookies.set(SESSION_COOKIE, token, {
		...cookieOptions(url),
		maxAge: SESSION_DAYS * 86_400
	});
}

export function sessionUser(token: string | undefined): User | null {
	if (!token) return null;
	return (
		get<User>(
			`SELECT u.id, u.github_id, u.handle, u.name, u.avatar_url, u.created_at
			FROM sessions s JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = ? AND s.expires_at > ?`,
			sha256(token),
			Date.now()
		) ?? null
	);
}

export function endSession(cookies: Cookies, url: URL) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
	cookies.delete(SESSION_COOKIE, cookieOptions(url));
}

/** Only paths on this site are accepted as a place to return to after sign-in. */
export function safeNext(value: string | null | undefined): string {
	// Browsers remove tabs and newlines from addresses, so "/<tab>/site" would become "//site".
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\s\\\u0000-\u001f]/.test(value)) {
		return '/';
	}
	return value;
}
