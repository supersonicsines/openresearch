import { memo } from '#lib/server/memo.ts';
import { browseProjects, isProjectFilter, isProjectSort, type ProjectSort } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;
const SORTS: ProjectSort[] = ['recent', 'donated', 'rising'];

export const load: PageServerLoad = ({ url }) => {
	const rawSort = url.searchParams.get('sort');
	const sort = isProjectSort(rawSort) && SORTS.includes(rawSort) ? rawSort : 'recent';
	const rawFilter = url.searchParams.get('filter');
	const filter = isProjectFilter(rawFilter) ? rawFilter : 'all';
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
	const asked = Math.floor(Number(url.searchParams.get('page')));
	const wanted = Number.isSafeInteger(asked) ? Math.min(Math.max(asked, 1), 1_000_000) : 1;

	return memo(`prompts:${sort}:${filter}:${wanted}:${query}`, () => {
		let { rows, total } = browseProjects({ sort, filter, query, limit: PAGE_SIZE, offset: (wanted - 1) * PAGE_SIZE });
		const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
		// A page beyond the last, from an old link or a narrower search, shows the last page instead.
		const current = Math.min(wanted, pages);
		if (current !== wanted) {
			({ rows, total } = browseProjects({ sort, filter, query, limit: PAGE_SIZE, offset: (current - 1) * PAGE_SIZE }));
		}
		return { rows, total, pages, current, sort, filter, query };
	});
};
