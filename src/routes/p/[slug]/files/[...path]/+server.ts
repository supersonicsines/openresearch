import { error } from '@sveltejs/kit';
import { visibleProjectId } from '#lib/server/queries.ts';
import { readTracked, repoExists } from '#lib/server/repo.ts';
import type { RequestHandler } from './$types';

/**
 * Repository files are model output and are treated as hostile. HTML is served in a sandbox
 * with no scripts and no network access, so it cannot act on this site.
 */
const HTML_POLICY =
	"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'";

export const GET: RequestHandler = async ({ params }) => {
	if (!visibleProjectId(params.slug) || !repoExists(params.slug)) error(404, 'Not found');
	const contents = await readTracked(params.slug, params.path);
	if (contents === null) error(404, 'This file could not be found.');
	const isHtml = params.path.endsWith('.html');
	return new Response(contents, {
		headers: {
			'Content-Type': isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': isHtml ? HTML_POLICY : "default-src 'none'; sandbox"
		}
	});
};
