import { listFiles, log, repoExists } from '#lib/server/repo.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { project } = await parent();
	if (!repoExists(project.slug)) return { files: [], commits: [], cloneUrl: '' };
	return {
		files: await listFiles(project.slug),
		commits: await log(project.slug, 30),
		cloneUrl: `${url.origin}/git/${project.slug}.git`
	};
};
