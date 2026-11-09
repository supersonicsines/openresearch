import { redirect } from '@sveltejs/kit';
import { userDonations } from '#lib/server/queries.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/x?next=/account');
	return { donations: userDonations(locals.user.id) };
};
