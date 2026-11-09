import { error } from '@sveltejs/kit';
import { money, reference, shortModelName } from '#lib/format.ts';
import { cachedCard, donationCard, pngResponse } from '#lib/server/cards.ts';
import { donationByPublicId } from '#lib/server/queries.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const donation = donationByPublicId(params.id);
	if (!donation) error(404, 'Not found');
	// An amount is called donated only once it has been spent. Until then it is a pledge.
	const open = donation.status === 'queued' || donation.status === 'running';
	const amount = open ? donation.amount_micro : donation.spent_micro;
	const png = await cachedCard(`donation:${donation.id}:${donation.status}:${amount}:${donation.run_count}`, () =>
		donationCard({
			handle: donation.handle,
			avatarUrl: donation.avatar_url,
			verb: open ? 'pledged towards' : 'donated towards',
			amount: money(amount),
			title: donation.title,
			reference: reference(donation.project_id),
			items: [
				{ value: shortModelName(donation.model_name), label: '' },
				{ value: String(donation.run_count), label: donation.run_count === 1 ? 'run' : 'runs' }
			]
		})
	);
	return pngResponse(png, 60);
};
