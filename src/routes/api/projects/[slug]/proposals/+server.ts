import { get } from '#lib/server/db.ts';
import { HOUR, hit } from '#lib/server/limits.ts';
import { propose } from '#lib/server/rounds.ts';
import type { RequestHandler } from './$types';

const reply = (status: number, message: string) => Response.json({ message }, { status });

/** A question is listed for the next round. The standing audit question is listed the first time it is backed. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) return reply(401, 'A GitHub account must be connected first.');
	const project = get<{ id: number }>('SELECT id FROM projects WHERE slug = ? AND hidden_at IS NULL', params.slug);
	if (!project) return reply(404, 'This project could not be found.');
	if (hit(`propose:${locals.user.id}`, 20, HOUR)) {
		return reply(429, 'Too many questions have been proposed from this account. The attempt may be repeated later.');
	}
	const body = (await request.json().catch(() => null)) as { question?: unknown; kind?: unknown } | null;
	const result = propose(locals.user.id, project.id, body ?? {});
	if (!result.ok) return reply(result.status, result.message);
	return Response.json({ id: result.id, existing: result.existing }, { status: result.existing ? 200 : 201 });
};
