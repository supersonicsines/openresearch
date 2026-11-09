import { error } from '@sveltejs/kit';
import { memo } from '#lib/server/memo.ts';
import { donationByPublicId, fundingSeries, getProject, projectDonors, projectRemoved } from '#lib/server/queries.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params, url }) => {
	const project = memo(`project:${params.slug}`, () => getProject(params.slug));
	if (!project) {
		if (projectRemoved(params.slug)) error(410, 'This project has been removed by the operator of this site.');
		error(404, 'This project could not be found.');
	}
	const donationId = url.searchParams.get('d');
	const donation = donationId ? donationByPublicId(donationId) : undefined;
	return {
		project,
		donors: memo(`donors:${project.id}`, () => projectDonors(project.id)),
		series: memo(`series:${project.id}`, () => fundingSeries([project.id]).get(project.id) ?? []),
		sharedDonation:
			donation && donation.project_id === project.id
				? { id: donation.public_id, amount: donation.amount_micro, handle: donation.handle }
				: null
	};
};
