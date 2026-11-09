import { looksLikeKey, deleteKey, getPublicKey, saveKey } from '#lib/server/keys.ts';
import { HOUR, hit } from '#lib/server/limits.ts';
import { checkKey, OpenRouterError } from '#lib/server/openrouter.ts';
import { stopDonationsForUser } from '#lib/server/worker.ts';
import type { RequestHandler } from './$types';

const reply = (status: number, message: string) => Response.json({ message }, { status });

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return reply(401, 'A GitHub account must be connected first.');
	const body = (await request.json().catch(() => null)) as { key?: unknown; acknowledged?: unknown } | null;
	const key = typeof body?.key === 'string' ? body.key.trim() : '';
	if (!looksLikeKey(key)) {
		return reply(400, 'This does not appear to be an OpenRouter key. Such keys begin with sk-or-.');
	}
	// Otherwise this could be used to test stolen keys against OpenRouter.
	if (hit(`key:${locals.user.id}`, 20, HOUR)) {
		return reply(429, 'Too many keys have been tried from this account. The attempt may be repeated later.');
	}

	let info;
	try {
		info = await checkKey(key);
	} catch (err) {
		if (err instanceof OpenRouterError && (err.status === 401 || err.status === 403)) {
			return reply(400, 'The key was not accepted by OpenRouter. It should be checked and entered again.');
		}
		return reply(502, 'OpenRouter could not be reached, so the key could not be checked. The attempt may be repeated shortly.');
	}

	if (info.limitMicro === null && body?.acknowledged !== true) {
		return Response.json({ status: 'needs_acknowledgement' });
	}

	// A donation was agreed against the key that was held at the time, so it does not move to a new one.
	if (getPublicKey(locals.user.id)) {
		stopDonationsForUser(locals.user.id, 'The OpenRouter key was replaced.');
	}
	saveKey(locals.user.id, key, info);
	return Response.json({
		status: 'saved',
		limit_micro: info.limitMicro,
		remaining_micro: info.remainingMicro,
		key: getPublicKey(locals.user.id)
	});
};

export const DELETE: RequestHandler = ({ locals }) => {
	if (!locals.user) return reply(401, 'A GitHub account must be connected first.');
	stopDonationsForUser(locals.user.id, 'The OpenRouter key was removed.');
	deleteKey(locals.user.id);
	return Response.json({ status: 'removed' });
};
