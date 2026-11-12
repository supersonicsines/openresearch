import { ensureLineage, treeNodes } from '#lib/server/lineage.ts';
import { memo } from '#lib/server/memo.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { project } = await parent();
	// A project from before the record was kept has it rebuilt from its repository, once.
	await ensureLineage(project.id);
	return { nodes: memo(`tree:${project.id}`, () => treeNodes(project.id)) };
};
