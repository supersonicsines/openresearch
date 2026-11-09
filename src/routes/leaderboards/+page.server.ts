import { memo } from '#lib/server/memo.ts';
import { donorLeaderboard, projectLeaderboard } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

const PERIODS: Record<string, number | null> = { all: null, '30': 30, '7': 7 };

export const load: PageServerLoad = ({ url, locals }) => {
	const board = url.searchParams.get('board') === 'donors' ? 'donors' : 'projects';
	const rawPeriod = url.searchParams.get('period') ?? 'all';
	const period = Object.hasOwn(PERIODS, rawPeriod) ? rawPeriod : 'all';
	const days = PERIODS[period];
	const since = days ? Date.now() - days * 86_400_000 : 0;
	return {
		board,
		period,
		projects: board === 'projects' ? memo(`board:projects:${period}`, () => projectLeaderboard(since)) : [],
		donors: board === 'donors' ? memo(`board:donors:${period}`, () => donorLeaderboard(since)) : [],
		me: locals.user?.handle ?? null
	};
};
