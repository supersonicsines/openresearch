import { redirect } from '@sveltejs/kit';
import { safeNext } from '#lib/server/auth.ts';
import { scrub } from '#lib/server/crypto.ts';
import { getPublicKey, looksLikeKey, saveKey } from '#lib/server/keys.ts';
import { HOUR, hit } from '#lib/server/limits.ts';
import { checkKey, exchangeCode } from '#lib/server/openrouter.ts';
import { releasePledgesForUser } from '#lib/server/rounds.ts';
import { stopDonationsForUser } from '#lib/server/worker.ts';
import type { RequestHandler } from './$types';

/** The page the visitor came from, with the outcome added so that it can be shown there. */
function back(next: string, outcome: 'connected' | 'declined' | 'failed'): never {
	const target = new URL(next, 'http://site.invalid');
	target.searchParams.set('openrouter', outcome);
	redirect(303, `${target.pathname}${target.search}`);
}

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const raw = cookies.get('os_openrouter');
	cookies.delete('os_openrouter', { path: '/auth/openrouter' });
	let flow: { state: string; verifier: string; next: string } | null = null;
	try {
		flow = raw ? JSON.parse(raw) : null;
	} catch {
		flow = null;
	}
	const next = safeNext(flow?.next);
	if (!locals.user) redirect(303, `/auth/github?next=${encodeURIComponent(next)}`);

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	// OpenRouter sends the visitor back without a code when the request is declined on its page.
	if (!code) back(next, 'declined');
	// The code is of use only with the verifier held in this browser's cookie, so a code planted by
	// someone else cannot be exchanged. The state is compared as well wherever OpenRouter returns it.
	if (!flow || (state !== null && state !== flow.state)) back(next, 'failed');
	if (hit(`key:${locals.user.id}`, 20, HOUR)) back(next, 'failed');

	let key: string;
	let info;
	try {
		key = await exchangeCode(code, flow.verifier);
		if (!looksLikeKey(key)) throw new Error('OpenRouter returned something that is not a key.');
		info = await checkKey(key);
	} catch (err) {
		console.error('The connection to OpenRouter failed:', scrub(String(err)));
		back(next, 'failed');
	}

	// A donation was agreed against the key that was held at the time, so it does not move to a new one.
	if (getPublicKey(locals.user.id)) {
		stopDonationsForUser(locals.user.id, 'The OpenRouter key was replaced.');
		releasePledgesForUser(locals.user.id, 'The OpenRouter key was replaced.');
	}
	saveKey(locals.user.id, key, info);
	back(next, 'connected');
};
