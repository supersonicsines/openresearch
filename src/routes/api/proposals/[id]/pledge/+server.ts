import { getPublicKey } from '#lib/server/keys.ts';
import { HOUR, hit } from '#lib/server/limits.ts';
import { pledge, withdrawPledge } from '#lib/server/rounds.ts';
import type { RequestHandler } from './$types';

const reply = (status: number, message: string) => Response.json({ message }, { status });

/** A pledge towards a question. Nothing is charged for it unless that question leads when the round closes. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) return reply(401, 'A GitHub account must be connected first.');
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) return reply(404, 'This question is no longer listed.');
	if (hit(`pledge:${locals.user.id}`, 60, HOUR)) {
		return reply(429, 'Too many pledges have been made from this account. The attempt may be repeated later.');
	}
	const body = (await request.json().catch(() => null)) as { amountMicro?: unknown; model?: unknown } | null;
	const result = await pledge(
		locals.user.id,
		id,
		Number(body?.amountMicro),
		typeof body?.model === 'string' ? body.model : ''
	);
	if (!result.ok) return reply(result.status, result.message);
	return Response.json({ closesAt: result.closesAt, key: getPublicKey(locals.user.id) }, { status: 201 });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user) return reply(401, 'A GitHub account must be connected first.');
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) return reply(404, 'This pledge could not be found.');
	const result = withdrawPledge(locals.user.id, id);
	if (!result.ok) return reply(result.status, result.message);
	return Response.json({ status: 'withdrawn' });
};
