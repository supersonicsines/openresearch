import { money } from '#lib/format.ts';
import { cachedCard, pngResponse, siteCard } from '#lib/server/cards.ts';
import { countProjects, totals } from '#lib/server/queries.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const figures = totals();
	const prompts = countProjects();
	const png = await cachedCard(`site:${figures.spent}:${figures.runs}:${figures.donors}:${prompts}`, () =>
		siteCard({
			items: [
				{ value: money(figures.spent), label: 'raised' },
				{ value: String(prompts), label: prompts === 1 ? 'prompt' : 'prompts' },
				{ value: String(figures.runs), label: figures.runs === 1 ? 'run' : 'runs' }
			]
		})
	);
	return pngResponse(png, 300);
};
