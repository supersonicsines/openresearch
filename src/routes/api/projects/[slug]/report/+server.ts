import { HOUR, hit } from '#lib/server/limits.ts';
import { addReport, MAX_REPORT_CHARS } from '#lib/server/moderation.ts';
import { visibleProjectId } from '#lib/server/queries.ts';
import type { RequestHandler } from './$types';

const reply = (status: number, message: string) => Response.json({ message }, { status });

/** Anyone may report a project, signed in or not, because those affected may have no account. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const projectId = visibleProjectId(params.slug);
	if (!projectId) return reply(404, 'This project could not be found.');
	const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
	const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
	if (reason.length < 3) return reply(400, 'The reason for the report must be entered.');
	if (reason.length > MAX_REPORT_CHARS) {
		return reply(400, `A report must be no longer than ${MAX_REPORT_CHARS.toLocaleString('en-GB')} characters.`);
	}
	const reporter = locals.user ? `u${locals.user.id}` : (locals.address ?? 'anonymous');
	if (hit(`report:${reporter}`, 10, HOUR)) {
		return reply(429, 'Too many reports have been made. The attempt may be repeated later.');
	}
	addReport(projectId, locals.user?.id ?? null, reason);
	return Response.json({ status: 'received' }, { status: 201 });
};
