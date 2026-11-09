import { get } from '#lib/server/db.ts';
import type { RequestHandler } from './$types';

/** For an uptime monitor or a container's health check. It reveals nothing but that the site is up. */
export const GET: RequestHandler = () => {
	try {
		get('SELECT 1 AS ok');
		return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
	}
};
