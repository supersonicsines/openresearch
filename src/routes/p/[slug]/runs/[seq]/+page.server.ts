import { error } from '@sveltejs/kit';
import { getRun } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { project } = await parent();
	const seq = Number(params.seq);
	const run = Number.isInteger(seq) ? getRun(project.id, seq) : undefined;
	if (!run) error(404, 'This run could not be found.');
	return { run, sources: JSON.parse(run.sources) as { url: string; title: string }[] };
};
