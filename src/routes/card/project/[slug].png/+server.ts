import { error } from '@sveltejs/kit';
import { milestone, money, reference, wholeMoney } from '#lib/format.ts';
import { cachedCard, pngResponse, projectCard } from '#lib/server/cards.ts';
import { getProject } from '#lib/server/queries.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProject(params.slug);
	if (!project) error(404, 'Not found');
	const target = milestone(project.spent);
	const png = await cachedCard(`project:${project.id}:${project.spent}:${project.runs}:${project.donors}`, () =>
		projectCard({
			title: project.title,
			reference: reference(project.id),
			handle: project.author_handle,
			avatarUrl: project.author_avatar,
			amount: money(project.spent),
			target: wholeMoney(target),
			fraction: project.spent / target,
			items: [
				{ value: String(project.runs), label: project.runs === 1 ? 'run' : 'runs' },
				{ value: String(project.donors), label: project.donors === 1 ? 'donor' : 'donors' }
			]
		})
	);
	return pngResponse(png, 300);
};
