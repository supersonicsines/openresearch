import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, sessionUser } from '#lib/server/auth.ts';
import { scrub } from '#lib/server/crypto.ts';
import { buildOrigin, checkStartup } from '#lib/server/env.ts';
import { clientKey, hit, limitFor, routedPath } from '#lib/server/limits.ts';
import { startWorker } from '#lib/server/worker.ts';

export const init: ServerInit = () => {
	checkStartup();
	startWorker();
};

const LIMITED = 'Too many requests have been made from this address. The attempt may be repeated shortly.';

// A site built for https is only ever reached over https, and browsers are told to remember that.
const HSTS = buildOrigin.startsWith('https://');

export const handle: Handle = async ({ event, resolve }) => {
	const path = routedPath(event.url.pathname);
	const address = clientKey(event.getClientAddress);
	event.locals.address = address;
	const rule = limitFor(event.request.method, path, address);
	if (rule) {
		const wait = hit(`${rule.name}:${address}`, rule.limit, rule.windowMs);
		if (wait) {
			const json = path.startsWith('/api/') || event.request.headers.get('accept')?.includes('json');
			return new Response(json ? JSON.stringify({ message: LIMITED }) : LIMITED, {
				status: 429,
				headers: {
					'Retry-After': String(wait),
					'Content-Type': json ? 'application/json' : 'text/plain; charset=utf-8'
				}
			});
		}
	}

	event.locals.user = sessionUser(event.cookies.get(SESSION_COOKIE));
	const response = await resolve(event, {
		// The faces used on every page load early, which reduces the shift when they arrive.
		preload: ({ type, path }) =>
			type === 'js' ||
			type === 'css' ||
			(type === 'font' &&
				(path.includes('source-serif-4-latin-opsz-normal') ||
					path.includes('hanken-grotesk-latin-wght-normal') ||
					path.includes('ibm-plex-mono-latin-400-normal')))
	});
	// Browsers keep a 410 or a 404 unless told otherwise, so a restored project would stay "removed"
	// for anyone who had seen it. Pages are always checked again, and are not held by shared caches.
	if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'private, no-cache');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	if (HSTS) response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	return response;
};

/** Details go to the log with any key removed. The visitor is told nothing about the internals. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return {};
	console.error(`${event.request.method} ${event.url.pathname} failed:`, scrub(String((error as Error)?.stack ?? error)));
	return { message: 'An unexpected error occurred.' };
};
