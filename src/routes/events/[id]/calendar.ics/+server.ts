import { error } from '@sveltejs/kit';
import { eventIcs } from '#lib/server/calendar.ts';
import { getEvent, isMember } from '#lib/server/events.ts';
import { canSeeAddress, getGaff } from '#lib/server/gaff.ts';
import type { RequestHandler } from './$types';

// The night as a calendar file. The address is only in it for people who can see it on the event page.
export const GET: RequestHandler = ({ params, locals, url }) => {
	const eventId = Number(params.id);
	const event = getEvent(eventId);
	if (!locals.user || !event || !isMember(eventId, locals.user.id)) error(404, 'Event not found');
	if (!event.starts_at) error(404, 'The date isn’t decided yet');

	const gaff = event.gaff_id ? getGaff(event.gaff_id) : undefined;
	const location = canSeeAddress(event, locals.user.id) ? gaff?.address || event.location : null;
	const ics = eventIcs({ ...event, starts_at: event.starts_at }, { url: `${url.origin}/events/${eventId}`, location });
	const name = event.title.replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'night-out';
	return new Response(ics, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': `inline; filename="${name}.ics"`,
			'cache-control': 'private, no-store'
		}
	});
};
