import { error } from '@sveltejs/kit';
import { isMember } from '#lib/server/events.ts';
import { subscribe } from '#lib/server/realtime.ts';
import type { RequestHandler } from './$types';

// Server-sent events: sends "update" whenever anything on the event changes,
// so open pages reload their data without a manual refresh.
export const GET: RequestHandler = ({ params, locals, request }) => {
	const eventId = Number(params.id);
	if (!locals.user || !isMember(eventId, locals.user.id)) error(404, 'Event not found');

	let cleanup = () => {};
	const stream = new ReadableStream({
		start(controller) {
			const send = (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk));
			send(': connected\n\n');
			const unsubscribe = subscribe(eventId, () => send('data: update\n\n'));
			// Comment lines keep proxies from closing an idle connection.
			const keepAlive = setInterval(() => send(': ping\n\n'), 25_000);
			cleanup = () => {
				unsubscribe();
				clearInterval(keepAlive);
			};
			request.signal.addEventListener('abort', () => {
				cleanup();
				controller.close();
			});
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};
