import { error } from '@sveltejs/kit';
import { money } from '#lib/format.ts';
import { cachedCard, donorCard, pngResponse } from '#lib/server/cards.ts';
import { donorStats, userByHandle } from '#lib/server/queries.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const person = userByHandle(params.handle);
	if (!person) error(404, 'Not found');
	const stats = donorStats(person.id);
	const png = await cachedCard(`donor:${person.id}:${stats.spent}:${stats.rank}:${stats.projects}:${stats.runs}`, () =>
		donorCard({
			handle: person.handle,
			name: person.name,
			avatarUrl: person.avatar_url,
			items: [
				{ value: money(stats.spent), label: 'donated' },
				{ value: stats.rank ? `#${stats.rank}` : 'Unplaced', label: 'on the board' },
				{ value: String(stats.projects), label: stats.projects === 1 ? 'project' : 'projects' },
				{ value: String(stats.runs), label: stats.runs === 1 ? 'run' : 'runs' }
			]
		})
	);
	return pngResponse(png, 300);
};
