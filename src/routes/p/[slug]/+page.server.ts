import { roundView } from '#lib/server/rounds.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { project } = await parent();
	// The time is sent with the page, so that a countdown reads the same when it is first drawn.
	return { round: roundView(project.id, locals.user?.id ?? null), now: Date.now() };
};
