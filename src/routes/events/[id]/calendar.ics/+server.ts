import { error, redirect } from '@sveltejs/kit';
import { calendarFile, calendarLinkUser } from '#lib/server/calendar.ts';
import type { RequestHandler } from './$types';

// The night as a calendar file, for whoever the signed link was made for or whoever is logged in.
export const GET: RequestHandler = ({ params, locals, url }) => {
	const eventId = Number(params.id);
	const userId = calendarLinkUser(eventId, url.searchParams) ?? locals.user?.id;
	// An old link opened in a browser that isn't logged in: log in, then get the file.
	if (!userId) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const file = calendarFile(eventId, userId, url.origin);
	if (!file) error(404, 'Event not found');

	const name = file.title.replace(/[^\p{L}\p{N} ]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'night-out';
	const ascii = name.replace(/[^\w-]/g, '') || 'night-out';
	return new Response(file.ics, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': `inline; filename="${ascii}.ics"; filename*=UTF-8''${encodeURIComponent(name)}.ics`,
			'cache-control': 'private, no-store'
		}
	});
};
