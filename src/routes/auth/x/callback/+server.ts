import { isRedirect, redirect } from '@sveltejs/kit';
import { safeNext, startSession, upsertUser } from '#lib/server/auth.ts';
import { scrub } from '#lib/server/crypto.ts';
import { completeAuthorize } from '#lib/server/x.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const raw = cookies.get('os_oauth');
	cookies.delete('os_oauth', { path: '/auth/x' });
	let flow: { state: string; verifier: string; next: string } | null = null;
	try {
		flow = raw ? JSON.parse(raw) : null;
	} catch {
		flow = null;
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!flow || !code || !state || state !== flow.state) {
		redirect(303, '/auth/unavailable?reason=expired');
	}

	try {
		const profile = await completeAuthorize(code, flow.verifier, `${url.origin}/auth/x/callback`);
		const user = upsertUser(profile);
		if (user.suspended_at) redirect(303, '/auth/unavailable?reason=suspended');
		startSession(cookies, url, user.id);
	} catch (err) {
		if (isRedirect(err)) throw err;
		console.error('X sign-in failed:', scrub(String(err)));
		redirect(303, '/auth/unavailable?reason=failed');
	}
	redirect(303, safeNext(flow.next));
};
