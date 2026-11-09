import { getPublicKey } from '#lib/server/keys.ts';
import { config } from '#lib/server/env.ts';
import { memo } from '#lib/server/memo.ts';
import { isAdmin } from '#lib/server/moderation.ts';
import { recentActivity } from '#lib/server/queries.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const user = locals.user;
	return {
		user: user ? { handle: user.handle, name: user.name, avatar_url: user.avatar_url } : null,
		key: user ? getPublicKey(user.id) : null,
		demo: config.demoMode,
		admin: isAdmin(user),
		contactEmail: config.contactEmail,
		activity: memo('activity', () => recentActivity())
	};
};
