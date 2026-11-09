import { error } from '@sveltejs/kit';
import { memo } from '#lib/server/memo.ts';
import { donorStats, projectsFundedBy, projectsSubmittedBy, userByHandle } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const person = userByHandle(params.handle);
	if (!person) error(404, 'This account could not be found.');
	return memo(`person:${person.id}`, () => ({
		person: { handle: person.handle, name: person.name, avatar_url: person.avatar_url },
		stats: donorStats(person.id),
		funded: projectsFundedBy(person.id),
		submitted: projectsSubmittedBy(person.id)
	}));
};
