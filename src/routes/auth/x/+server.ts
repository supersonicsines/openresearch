import { redirect } from '@sveltejs/kit';
import { safeNext } from '#lib/server/auth.ts';
import { devSigninAllowed, xConfigured } from '#lib/server/env.ts';
import { beginAuthorize } from '#lib/server/x.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies, getClientAddress }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (devSigninAllowed(getClientAddress)) redirect(303, `/auth/dev?next=${encodeURIComponent(next)}`);
	if (!xConfigured()) redirect(303, '/auth/unavailable');

	const redirectUri = `${url.origin}/auth/x/callback`;
	const flow = beginAuthorize(redirectUri);
	cookies.set('os_oauth', JSON.stringify({ state: flow.state, verifier: flow.verifier, next }), {
		path: '/auth/x',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600
	});
	redirect(303, flow.url, { external: [new URL(flow.url).origin] });
};
