import { error } from '@sveltejs/kit';
import { get } from '#lib/server/db.ts';
import { currentRun, subscribe, type ProjectEvent } from '#lib/server/events.ts';
import { openStream } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request, locals }) => {
	const project = get<{ id: number }>('SELECT id FROM projects WHERE slug = ? AND hidden_at IS NULL', params.slug);
	if (!project) error(404, 'Not found');
	const held = openStream(locals.address);
	if (!held) error(429, 'Too many live connections are open.');
	const release = held;

	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const send = (text: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					close();
				}
			};
			const push = (event: ProjectEvent) => send(`data: ${JSON.stringify(event)}\n\n`);

			const live = currentRun(project.id);
			if (live) push({ type: 'run', live });
			else send(': connected\n\n');

			const unsubscribe = subscribe(project.id, push);
			const heartbeat = setInterval(() => send(': keep-alive\n\n'), 20_000);

			function close() {
				if (closed) return;
				closed = true;
				release();
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					/* Already closed by the client. */
				}
			}
			cleanup = close;
			request.signal.addEventListener('abort', close);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive'
		}
	});
};
