import { createHash } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import { safeNext } from '#lib/server/auth.ts';
import { randomToken } from '#lib/server/crypto.ts';
import { connectUrl } from '#lib/server/openrouter.ts';
import type { RequestHandler } from './$types';

/** Sends the visitor to OpenRouter, where a key is created for this site and nothing has to be copied. */
export const GET: RequestHandler = ({ url, cookies, locals }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (!locals.user) redirect(303, `/auth/github?next=${encodeURIComponent(next)}`);

	const state = randomToken(24);
	const verifier = randomToken(48);
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	cookies.set('os_openrouter', JSON.stringify({ state, verifier, next }), {
		path: '/auth/openrouter',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600
	});
	const target = connectUrl(`${url.origin}/auth/openrouter/callback`, challenge, state);
	redirect(303, target, { external: [new URL(target).origin] });
};
