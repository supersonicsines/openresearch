import { createHash } from 'node:crypto';
import { randomToken } from './crypto.ts';
import { config } from './env.ts';

// Both may be pointed elsewhere, so that the sign-in can be tested without GitHub.
const WEB = (process.env.GITHUB_WEB_BASE || 'https://github.com').replace(/\/$/, '');
const API = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
const AUTHORIZE = `${WEB}/login/oauth/authorize`;
const TOKEN = `${WEB}/login/oauth/access_token`;
const USER = `${API}/user`;

/** No scope is asked for, so only the public profile can be read. No access token is kept. */
export function beginAuthorize(redirectUri: string) {
	const state = randomToken(24);
	const verifier = randomToken(48);
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const url = new URL(AUTHORIZE);
	url.search = new URLSearchParams({
		client_id: config.githubClientId,
		redirect_uri: redirectUri,
		state,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	}).toString();
	return { url: url.toString(), state, verifier };
}

export type GitHubProfile = { githubId: string; handle: string; name: string; avatarUrl: string | null };

const AVATARS = 'avatars.githubusercontent.com';

/** Asks for a picture large enough for the cards, and declines any address that is not GitHub's own. */
function avatarUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.hostname !== AVATARS) return null;
		url.searchParams.set('s', '200');
		return url.toString();
	} catch {
		return null;
	}
}

export async function completeAuthorize(
	code: string,
	verifier: string,
	redirectUri: string
): Promise<GitHubProfile> {
	const tokenRes = await fetch(TOKEN, {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.githubClientId,
			client_secret: config.githubClientSecret,
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier
		}),
		signal: AbortSignal.timeout(15_000)
	});
	if (!tokenRes.ok) throw new Error(`GitHub token request failed with status ${tokenRes.status}.`);
	// GitHub reports a refused code with a status of 200 and an error in the body.
	const token = (await tokenRes.json()) as { access_token?: string; error?: string };
	if (!token.access_token) throw new Error(`GitHub did not return an access token: ${token.error ?? 'no reason was given'}.`);

	const userRes = await fetch(USER, {
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token.access_token}`,
			'User-Agent': 'OpenResearch',
			'X-GitHub-Api-Version': '2022-11-28'
		},
		signal: AbortSignal.timeout(15_000)
	});
	if (!userRes.ok) throw new Error(`GitHub profile request failed with status ${userRes.status}.`);
	const user = (await userRes.json()) as { id?: number; login?: string; name?: string | null; avatar_url?: string | null };
	if (!user.id || !user.login) throw new Error('GitHub did not return an account.');
	return {
		githubId: String(user.id),
		handle: user.login,
		name: user.name || user.login,
		avatarUrl: avatarUrl(user.avatar_url)
	};
}
