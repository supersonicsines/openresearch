import { projectRuns } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { project } = await parent();
	return { runs: projectRuns(project.id) };
};
