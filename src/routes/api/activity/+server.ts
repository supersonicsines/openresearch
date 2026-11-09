import { memo } from '#lib/server/memo.ts';
import { countProjects, recentActivity, totals } from '#lib/server/queries.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const body = memo('activity-feed', () => {
		const items = recentActivity();
		return JSON.stringify({ items, totals: { ...totals(), prompts: countProjects() }, version: items[0]?.key ?? '' });
	});
	return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
