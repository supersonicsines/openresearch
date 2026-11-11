import { redirect } from '@sveltejs/kit';
import { userDonations } from '#lib/server/queries.ts';
import { userPledges } from '#lib/server/rounds.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/github?next=/account');
	return { donations: userDonations(locals.user.id), pledges: userPledges(locals.user.id) };
};
