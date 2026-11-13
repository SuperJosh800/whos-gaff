import { error, redirect } from '@sveltejs/kit';
import { getEvent, isMember, listAttendees, votingOpen } from '#lib/server/events.ts';
import { canSeeAddress, getGaff } from '#lib/server/gaff.ts';
import { getActivity } from '#lib/server/activities.ts';
import { calendarLink } from '#lib/server/calendar.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params, locals, url, depends }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const eventId = Number(params.id);
	const full = getEvent(eventId);
	if (!full || !isMember(eventId, locals.user.id)) error(404, 'Event not found');
	depends(`event:${eventId}`);

	// The address and gaff details never leave the server for people who haven't RSVP'd "going".
	const unlocked = canSeeAddress(full, locals.user.id);
	const gaff = full.gaff_id ? getGaff(full.gaff_id) : undefined;
	const address = gaff?.address || full.location;
	const { location: _, invite_token: __, ...event } = full;
	return {
		event,
		isHost: full.host_id === locals.user.id,
		votingOpen: votingOpen(full),
		attendees: listAttendees(eventId),
		address: unlocked ? address : null,
		addressLocked: !unlocked && !!address,
		gaff: unlocked && gaff ? gaff : null,
		calendarUrl: full.starts_at ? calendarLink(eventId, locals.user.id) : null,
		gameOn: (() => {
			const game = getActivity(eventId, locals.user.id);
			return game ? { name: game.name, started: game.started, joined: game.joined, count: game.players.length } : null;
		})()
	};
};
