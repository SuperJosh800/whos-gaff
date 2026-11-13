// "Come get me": someone going who is lost or in trouble sends their location to everyone else going.
// Others say they're on their way; once they're OK, the location is wiped. Requests go after a week.
import { db } from './db.ts';
import { notify } from './notifications.ts';
import { publish } from './realtime.ts';
import { attempt } from './ratelimit.ts';
import { EventError, requireMember, type Event } from './events.ts';
import { canSeeAddress } from './gaff.ts';
import { goingPeople } from './money.ts';
import { nowLocal, shiftLocal } from '../time.ts';

export type Spot = { lat: number; lng: number; accuracy: number } | null;

export type HelpRequest = {
	id: number;
	user_id: number;
	name: string;
	note: string;
	at: string;
	map: string | null;
	accuracy: number | null;
	coming: string[];
	mine: boolean;
	iAmComing: boolean;
};

/** A request is shown, and re-sending updates it, for 12 hours; after that a new ask starts afresh. */
const SHOWN_MINUTES = 12 * 60;

/** Open from 3 hours before the night starts (getting there) until a day after it starts. */
export function helpWindow(event: Pick<Event, 'starts_at'>) {
	return event.starts_at ? { from: shiftLocal(event.starts_at, -3 * 60), until: shiftLocal(event.starts_at, 24 * 60) } : null;
}

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('RSVP “going” to use Come get me.');
	return event;
}

const nameOf = (userId: number) => (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;

/** Reads a location from the form: all three numbers in range, or none (the phone said no). */
export function readSpot(lat: string, lng: string, accuracy: string): Spot {
	if (!lat && !lng) return null;
	if (!lat || !lng) throw new EventError('That location didn’t look right.');
	const spot = { lat: Number(lat), lng: Number(lng), accuracy: Math.round(Number(accuracy) || 0) };
	if (!(Math.abs(spot.lat) <= 90 && Math.abs(spot.lng) <= 180 && spot.accuracy >= 0)) throw new EventError('That location didn’t look right.');
	return spot;
}

/**
 * Sends your request to everyone else going, or re-sends it with a new location or note. A new
 * request always tells people unless you've started 5 in the last hour; re-sending one tells them
 * again at most 3 times in 10 minutes. Returns whether people were told this time.
 */
export function askForHelp(eventId: number, userId: number, spot: Spot, note: string, now = nowLocal()) {
	const event = requireGoing(eventId, userId);
	const window = helpWindow(event);
	if (!window || now < window.from || now >= window.until)
		throw new EventError('Come get me works from 3 hours before the night starts until the next day.');
	note = note.trim().slice(0, 200);
	// A request nobody can see any more is closed quietly, so a new ask doesn't inherit old "on my way"s.
	db.prepare('UPDATE help_requests SET resolved_at = ?, lat = NULL, lng = NULL, accuracy = NULL WHERE event_id = ? AND user_id = ? AND resolved_at IS NULL AND at < ?').run(
		now,
		eventId,
		userId,
		shiftLocal(now, -SHOWN_MINUTES)
	);
	const open = db.prepare('SELECT id FROM help_requests WHERE event_id = ? AND user_id = ? AND resolved_at IS NULL').get(eventId, userId) as
		| { id: number }
		| undefined;
	let id: number;
	let tell: boolean;
	if (open) {
		id = open.id;
		// A re-send without a fix keeps the last good location.
		db.prepare('UPDATE help_requests SET lat = COALESCE(?, lat), lng = COALESCE(?, lng), accuracy = COALESCE(?, accuracy), note = ?, at = ? WHERE id = ?').run(
			spot?.lat ?? null,
			spot?.lng ?? null,
			spot?.accuracy ?? null,
			note,
			now,
			id
		);
		tell = attempt(`help:${id}`, 3, 10 * 60_000).ok;
	} else {
		id = Number(
			db
				.prepare('INSERT INTO help_requests (event_id, user_id, lat, lng, accuracy, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
				.run(eventId, userId, spot?.lat ?? null, spot?.lng ?? null, spot?.accuracy ?? null, note, now).lastInsertRowid
		);
		tell = attempt(`help-new:${eventId}:${userId}`, 5, 60 * 60_000).ok;
	}
	if (tell) {
		db.prepare('UPDATE help_requests SET told = 1 WHERE id = ?').run(id);
		const { lat } = db.prepare('SELECT lat FROM help_requests WHERE id = ?').get(id) as { lat: number | null };
		const message = `${nameOf(userId)} needs someone to come get them${lat === null ? '' : '. Their location is on the Night tab'}. (${event.title})`;
		for (const p of goingPeople(eventId)) if (p.id !== userId) notify(p.id, eventId, message, '/night#help');
	}
	publish(eventId);
	return { told: tell };
}

/** You're OK now: everyone who was told is stood down, and your location is wiped. */
export function resolveHelp(eventId: number, userId: number, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	const open = db.prepare('SELECT id, told FROM help_requests WHERE event_id = ? AND user_id = ? AND resolved_at IS NULL').get(eventId, userId) as
		| { id: number; told: number }
		| undefined;
	if (!open) return;
	db.prepare('UPDATE help_requests SET resolved_at = ?, lat = NULL, lng = NULL, accuracy = NULL WHERE id = ?').run(now, open.id);
	if (open.told) {
		const me = nameOf(userId);
		for (const p of goingPeople(eventId)) if (p.id !== userId) notify(p.id, eventId, `${me} is OK now, no need to come. (${event.title})`, '/night');
	}
	publish(eventId);
}

/** Tells the person who asked that you're coming, or that you can't after all (each once per change). */
export function onMyWay(eventId: number, userId: number, requestId: number, coming = true) {
	requireGoing(eventId, userId);
	const request = db
		.prepare('SELECT user_id FROM help_requests WHERE id = ? AND event_id = ? AND resolved_at IS NULL')
		.get(requestId, eventId) as { user_id: number } | undefined;
	if (!request) throw new EventError('They’re OK now.');
	if (request.user_id === userId) throw new EventError('That’s your own request.');
	const { changes } = coming
		? db.prepare('INSERT OR IGNORE INTO help_responders (request_id, user_id) VALUES (?, ?)').run(requestId, userId)
		: db.prepare('DELETE FROM help_responders WHERE request_id = ? AND user_id = ?').run(requestId, userId);
	if (changes)
		notify(request.user_id, eventId, `${nameOf(userId)} ${coming ? 'is on their way to you' : 'can’t come after all'}.`, '/night#help');
	publish(eventId);
}

/**
 * Open requests from the last 12 hours. Only people going see others' requests (the location is like
 * the address), but you always see your own, so you can stand people down even after changing your RSVP.
 */
export function listHelp(eventId: number, viewerId: number, now = nowLocal()): HelpRequest[] {
	const event = requireMember(eventId, viewerId);
	const going = canSeeAddress(event, viewerId);
	const rows = db
		.prepare(
			`SELECT h.id, h.user_id, u.name, h.note, h.at, h.lat, h.lng, h.accuracy FROM help_requests h JOIN users u ON u.id = h.user_id
			 WHERE h.event_id = ? AND h.resolved_at IS NULL AND h.at >= ? AND (? OR h.user_id = ?) ORDER BY h.at DESC, h.id DESC`
		)
		.all(eventId, shiftLocal(now, -SHOWN_MINUTES), going ? 1 : 0, viewerId) as {
		id: number;
		user_id: number;
		name: string;
		note: string;
		at: string;
		lat: number | null;
		lng: number | null;
		accuracy: number | null;
	}[];
	const responders = db.prepare(
		'SELECT r.user_id, u.name FROM help_responders r JOIN users u ON u.id = r.user_id WHERE r.request_id = ? ORDER BY u.name'
	);
	return rows.map((r) => {
		const coming = responders.all(r.id) as { user_id: number; name: string }[];
		return {
			id: r.id,
			user_id: r.user_id,
			name: r.name,
			note: r.note,
			at: r.at,
			map: r.lat === null || r.lng === null ? null : `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
			accuracy: r.accuracy,
			coming: coming.map((c) => c.name),
			mine: r.user_id === viewerId,
			iAmComing: coming.some((c) => c.user_id === viewerId)
		};
	});
}

/** Locations go once nobody can see them (12 hours); requests are deleted a week after they were last sent. */
export function purgeHelp(now = nowLocal()) {
	db.prepare('UPDATE help_requests SET lat = NULL, lng = NULL, accuracy = NULL WHERE at < ? AND lat IS NOT NULL').run(shiftLocal(now, -SHOWN_MINUTES));
	db.prepare('DELETE FROM help_requests WHERE at < ?').run(shiftLocal(now, -7 * 24 * 60));
}
