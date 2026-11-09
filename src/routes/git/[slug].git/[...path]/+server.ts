import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { visibleProjectId } from '#lib/server/queries.ts';
import { clonePath } from '#lib/server/repo.ts';
import type { RequestHandler } from './$types';

/** Read-only git over plain HTTP. `git clone` needs nothing more, and nothing can be pushed. */
export const GET: RequestHandler = async ({ params }) => {
	const file = visibleProjectId(params.slug) ? clonePath(params.slug, params.path) : null;
	if (!file) error(404, 'Not found');
	try {
		const contents = await readFile(file);
		return new Response(new Uint8Array(contents), {
			headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-cache' }
		});
	} catch {
		error(404, 'Not found');
	}
};
