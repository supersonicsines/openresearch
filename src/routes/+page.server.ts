import { memo } from '#lib/server/memo.ts';
import { countProjects, fundingSeries, isProjectSort, listProjects, totals } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

/** The board is a sample. With its last cell this fills complete rows, and /prompts shows the rest. */
const SHOWN = 14;
const SORTS = ['donated', 'rising', 'recent'];

export const load: PageServerLoad = ({ url }) => {
	const raw = url.searchParams.get('sort');
	const sort = isProjectSort(raw) && SORTS.includes(raw) ? raw : 'donated';
	return memo(`home:${sort}`, () => {
		const projects = listProjects(sort, SHOWN);
		// A chart is drawn only in the largest cell, so only that history is read.
		return {
			sort,
			projects,
			series: Object.fromEntries(fundingSeries(projects.slice(0, 1).map((p) => p.id))),
			total: countProjects(),
			totals: totals()
		};
	});
};
