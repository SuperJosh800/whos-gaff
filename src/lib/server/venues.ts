// Venue vote: anyone invited suggests a pub or club and ticks every one they'd go to, like the date poll.
// The host locks one in, which shows at the top of the event.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireHost, requireMember, type Event } from './events.ts';
import { cleanLabel, peopleNotOut } from './themes.ts';

export const MAX_VENUES = 12;
/** So one person can't fill the list. */
export const MAX_EACH = 4;

function requireOpen(event: Event) {
	if (event.venue) throw new EventError('The host has picked where you’re going.');
	return event;
}

function requireOption(eventId: number, optionId: number) {
	const option = db.prepare('SELECT id, name, link, suggested_by FROM venue_options WHERE id = ? AND event_id = ?').get(optionId, eventId) as
		| { id: number; name: string; link: string; suggested_by: number }
		| undefined;
	if (!option) throw new EventError('That place isn’t on the list any more.');
	return option;
}

/** An optional https link to the place, such as its map pin or website. */
function cleanLink(link: string) {
	link = link.trim();
	if (!link) return '';
	let url: URL | null = null;
	try {
		url = new URL(link);
	} catch {
		/* checked below */
	}
	if (url?.protocol !== 'https:') throw new EventError('Links need to start with https://');
	if (link.length > 500) throw new EventError('That link is too long.');
	return link;
}

/** The suggestions with who'd go to each, most first. */
export function listVenues(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	const options = db
		.prepare(
			`SELECT o.id, o.name, o.link, o.suggested_by, COUNT(v.user_id) AS votes,
				group_concat(u.name, ', ') AS voters, MAX(v.user_id = ?) AS mine
			 FROM venue_options o
			 LEFT JOIN venue_votes v ON v.option_id = o.id
			 LEFT JOIN users u ON u.id = v.user_id
			 WHERE o.event_id = ? GROUP BY o.id ORDER BY votes DESC, o.id`
		)
		.all(userId, eventId) as { id: number; name: string; link: string; suggested_by: number; votes: number; voters: string | null; mine: number | null }[];
	return {
		venue: event.venue,
		link: event.venue_link,
		options: options.map((o) => ({
			id: o.id,
			name: o.name,
			link: o.link,
			votes: o.votes,
			voters: o.voters ?? '',
			mine: !!o.mine,
			canRemove: !event.venue && (o.suggested_by === userId || event.host_id === userId)
		}))
	};
}

/** Suggests a place. Whoever suggests it is counted as up for it. */
export function suggestVenue(eventId: number, userId: number, name: string, link: string) {
	requireOpen(requireMember(eventId, userId));
	name = cleanLabel(name, 'Type the name of the pub or club.');
	link = cleanLink(link);
	const { n, mine } = db
		.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(suggested_by = ?), 0) AS mine FROM venue_options WHERE event_id = ?')
		.get(userId, eventId) as { n: number; mine: number };
	if (n >= MAX_VENUES) throw new EventError('That’s plenty of places. Tick the ones you’d go to.');
	if (mine >= MAX_EACH) throw new EventError(`You’ve suggested ${MAX_EACH} already. Let someone else have a go.`);
	if (db.prepare('SELECT 1 FROM venue_options WHERE event_id = ? AND name = ? COLLATE NOCASE').get(eventId, name)) {
		throw new EventError('That place is already on the list.');
	}
	const { lastInsertRowid } = db.prepare('INSERT INTO venue_options (event_id, name, link, suggested_by) VALUES (?, ?, ?, ?)').run(eventId, name, link, userId);
	db.prepare('INSERT INTO venue_votes (option_id, user_id) VALUES (?, ?)').run(lastInsertRowid, userId);
	publish(eventId);
}

/** Ticks or unticks a place. Tick as many as you'd go to. */
export function voteVenue(eventId: number, userId: number, optionId: number, up: boolean) {
	requireOpen(requireMember(eventId, userId));
	requireOption(eventId, optionId);
	if (up) db.prepare('INSERT OR IGNORE INTO venue_votes (option_id, user_id) VALUES (?, ?)').run(optionId, userId);
	else db.prepare('DELETE FROM venue_votes WHERE option_id = ? AND user_id = ?').run(optionId, userId);
	publish(eventId);
}

/** Whoever suggested a place, or the host, can take it off the list. */
export function removeVenue(eventId: number, userId: number, optionId: number) {
	const event = requireOpen(requireMember(eventId, userId));
	const option = requireOption(eventId, optionId);
	if (option.suggested_by !== userId && event.host_id !== userId) throw new EventError('Only whoever suggested it, or the host, can remove it.');
	db.prepare('DELETE FROM venue_options WHERE id = ?').run(optionId);
	publish(eventId);
}

/**
 * The host picks one of the suggestions. Everyone who might come hears where, but only when it's different
 * from the last place they were told, so reopening and picking the same one again stays quiet.
 */
export function lockVenue(eventId: number, hostId: number, optionId: number) {
	const event = requireOpen(requireHost(eventId, hostId));
	const { name, link } = requireOption(eventId, optionId);
	db.prepare('UPDATE events SET venue = ?, venue_link = ? WHERE id = ?').run(name, link, eventId);
	if (name.toLowerCase() !== event.venue_told.toLowerCase()) {
		db.prepare('UPDATE events SET venue_told = ? WHERE id = ?').run(name, eventId);
		for (const id of peopleNotOut(eventId, hostId)) notify(id, eventId, `${event.title} is at ${name}.`);
	}
	publish(eventId);
}

/** The host reopens the vote. Suggestions and ticks are as they were. */
export function reopenVenue(eventId: number, hostId: number) {
	requireHost(eventId, hostId);
	db.prepare(`UPDATE events SET venue = '', venue_link = '' WHERE id = ?`).run(eventId);
	publish(eventId);
}
