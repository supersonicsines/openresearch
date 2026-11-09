import { error } from '@sveltejs/kit';
import { visibleProjectId } from '#lib/server/queries.ts';
import { archiveZip, repoExists } from '#lib/server/repo.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!visibleProjectId(params.slug) || !repoExists(params.slug)) error(404, 'Not found');
	const zip = await archiveZip(params.slug);
	return new Response(new Uint8Array(zip), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${params.slug}.zip"`
		}
	});
};
