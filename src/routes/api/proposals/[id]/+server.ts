import { withdrawProposal } from '#lib/server/rounds.ts';
import type { RequestHandler } from './$types';

const reply = (status: number, message: string) => Response.json({ message }, { status });

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user) return reply(401, 'A GitHub account must be connected first.');
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) return reply(404, 'This question could not be found.');
	const result = withdrawProposal(locals.user.id, id);
	if (!result.ok) return reply(result.status, result.message);
	return Response.json({ status: 'withdrawn' });
};
