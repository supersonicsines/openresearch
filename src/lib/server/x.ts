import { createHash } from 'node:crypto';
import { randomToken } from './crypto.ts';
import { config } from './env.ts';

// Both may be pointed elsewhere, so that the sign-in can be tested without X.
const AUTHORIZE = process.env.X_AUTHORIZE_URL || 'https://x.com/i/oauth2/authorize';
const API = (process.env.X_API_BASE || 'https://api.x.com').replace(/\/$/, '');
const TOKEN = `${API}/2/oauth2/token`;
const ME = `${API}/2/users/me?user.fields=profile_image_url,name,username`;

/** Only what is needed to identify the account. No access token is kept. */
const SCOPES = 'tweet.read users.read';

export function beginAuthorize(redirectUri: string) {
	const state = randomToken(24);
	const verifier = randomToken(48);
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const url = new URL(AUTHORIZE);
	url.search = new URLSearchParams({
		response_type: 'code',
		client_id: config.xClientId,
		redirect_uri: redirectUri,
		scope: SCOPES,
		state,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	}).toString();
	return { url: url.toString(), state, verifier };
}

export type XProfile = { xId: string; handle: string; name: string; avatarUrl: string | null };

export async function completeAuthorize(
	code: string,
	verifier: string,
	redirectUri: string
): Promise<XProfile> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: redirectUri,
		code_verifier: verifier
	});
	const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
	if (config.xClientSecret) {
		const basic = Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');
		headers.Authorization = `Basic ${basic}`;
	} else {
		body.set('client_id', config.xClientId);
	}

	const tokenRes = await fetch(TOKEN, {
		method: 'POST',
		headers,
		body,
		signal: AbortSignal.timeout(15_000)
	});
	if (!tokenRes.ok) throw new Error(`X token request failed with status ${tokenRes.status}.`);
	const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
	if (!accessToken) throw new Error('X did not return an access token.');

	const meRes = await fetch(ME, {
		headers: { Authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(15_000)
	});
	if (!meRes.ok) throw new Error(`X profile request failed with status ${meRes.status}.`);
	const { data } = (await meRes.json()) as {
		data?: { id: string; username: string; name: string; profile_image_url?: string };
	};
	if (!data?.id || !data.username) throw new Error('X did not return an account.');
	return {
		xId: data.id,
		handle: data.username,
		name: data.name || data.username,
		avatarUrl: data.profile_image_url?.replace('_normal', '_200x200') ?? null
	};
}
