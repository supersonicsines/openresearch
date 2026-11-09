import { get } from '#lib/server/db.ts';
import { stopDonation } from '#lib/server/worker.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) => {
	if (!locals.user) return Response.json({ message: 'An X account must be connected first.' }, { status: 401 });
	const donation = get<{ id: number; user_id: number }>(
		'SELECT id, user_id FROM donations WHERE public_id = ?',
		params.id
	);
	if (!donation || donation.user_id !== locals.user.id) {
		return Response.json({ message: 'This donation could not be found.' }, { status: 404 });
	}
	stopDonation(donation.id, 'This was requested by the donor.');
	return Response.json({ status: 'stopped' });
};
