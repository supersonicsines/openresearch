import { error, fail, redirect } from '@sveltejs/kit';
import { safeNext, startSession, upsertUser } from '#lib/server/auth.ts';
import { devSigninAllowed } from '#lib/server/env.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, getClientAddress }) => {
	if (!devSigninAllowed(getClientAddress)) error(404, 'Not found');
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, url, cookies, getClientAddress }) => {
		if (!devSigninAllowed(getClientAddress)) error(404, 'Not found');
		const form = await request.formData();
		const handle = String(form.get('handle') ?? '').trim().replace(/^@/, '');
		if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
			return fail(400, { message: 'A handle of up to 15 letters, numbers or underscores must be entered.', handle });
		}
		const user = upsertUser({ xId: `dev-${handle.toLowerCase()}`, handle, name: handle, avatarUrl: null });
		startSession(cookies, url, user.id);
		redirect(303, safeNext(String(form.get('next') ?? '/')));
	}
};
