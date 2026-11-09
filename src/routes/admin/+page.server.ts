import { error, fail } from '@sveltejs/kit';
import {
	hideProject,
	isAdmin,
	purgeProject,
	resolveReport,
	resolveReportsFor,
	restoreProject,
	restoreUser,
	suspendUser
} from '#lib/server/moderation.ts';
import { adminProjects, openReports, totals } from '#lib/server/queries.ts';
import type { Actions, PageServerLoad } from './$types';

// The page does not reveal that it exists to anyone else.
function guard(locals: App.Locals) {
	if (!isAdmin(locals.user)) error(404, 'Not found');
}

export const load: PageServerLoad = ({ locals }) => {
	guard(locals);
	return { reports: openReports(), projects: adminProjects(), totals: totals() };
};

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export const actions: Actions = {
	hide: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const slug = text(form, 'slug');
		if (!hideProject(slug, text(form, 'reason') || 'Removed by the operator of this site.')) {
			return fail(404, { message: 'That project could not be found.' });
		}
		resolveReportsFor(slug);
		return { message: 'The project has been removed from public view.' };
	},
	restore: async ({ request, locals }) => {
		guard(locals);
		restoreProject(text(await request.formData(), 'slug'));
		return { message: 'The project has been restored.' };
	},
	purge: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const slug = text(form, 'slug');
		if (text(form, 'confirm') !== 'on') return fail(400, { message: 'Deletion must be confirmed.' });
		if (!(await purgeProject(slug))) return fail(404, { message: 'That project could not be found.' });
		resolveReportsFor(slug);
		return { message: 'The text and repository of the project have been deleted.' };
	},
	suspend: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const handle = text(form, 'handle').replace(/^@/, '');
		if (handle.toLowerCase() === locals.user!.handle.toLowerCase()) {
			return fail(400, { message: 'The account in use cannot be suspended from here.' });
		}
		if (!suspendUser(handle, text(form, 'hidePrompts') === 'on')) {
			return fail(404, { message: 'That account could not be found.' });
		}
		return { message: `@${handle} has been suspended.` };
	},
	unsuspend: async ({ request, locals }) => {
		guard(locals);
		const handle = text(await request.formData(), 'handle').replace(/^@/, '');
		restoreUser(handle);
		return { message: `@${handle} has been restored.` };
	},
	resolve: async ({ request, locals }) => {
		guard(locals);
		resolveReport(Number(text(await request.formData(), 'id')));
		return { message: 'The report has been closed.' };
	}
};
