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

/** From when the night starts until a day later. */
export function helpOpen(event: Event, now: string) {
	return !!event.starts_at && event.starts_at <= now && now < shiftLocal(event.starts_at, 24 * 60);
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
 * Sends (or re-sends, with a new location) your request to everyone going. Re-sending tells them again
 * at most 3 times in 10 minutes; the location still updates.
 */
export function askForHelp(eventId: number, userId: number, spot: Spot, note: string, now = nowLocal()) {
	const event = requireGoing(eventId, userId);
	if (!helpOpen(event, now)) throw new EventError('Come get me works from when the night starts until the next day.');
	note = note.trim().slice(0, 200);
	const open = db.prepare('SELECT id FROM help_requests WHERE event_id = ? AND user_id = ? AND resolved_at IS NULL').get(eventId, userId) as
		| { id: number }
		| undefined;
	const values = [spot?.lat ?? null, spot?.lng ?? null, spot?.accuracy ?? null, note, now];
	if (open) db.prepare('UPDATE help_requests SET lat = ?, lng = ?, accuracy = ?, note = ?, at = ? WHERE id = ?').run(...values, open.id);
	else db.prepare('INSERT INTO help_requests (event_id, user_id, lat, lng, accuracy, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(eventId, userId, ...values);
	if (attempt(`help:${eventId}:${userId}`, 3, 10 * 60_000).ok) {
		const me = nameOf(userId);
		const message = `${me} needs someone to come get them${spot ? '. Their location is on the Night tab' : ''}. (${event.title})`;
		for (const p of goingPeople(eventId)) if (p.id !== userId) notify(p.id, eventId, message, '/night#help');
	}
	publish(eventId);
}

/** You're OK now: everyone going is told, and your location is wiped. */
export function resolveHelp(eventId: number, userId: number, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	const { changes } = db
		.prepare('UPDATE help_requests SET resolved_at = ?, lat = NULL, lng = NULL, accuracy = NULL WHERE event_id = ? AND user_id = ? AND resolved_at IS NULL')
		.run(now, eventId, userId);
	if (!changes) return;
	const me = nameOf(userId);
	for (const p of goingPeople(eventId)) if (p.id !== userId) notify(p.id, eventId, `${me} is OK now, no need to come. (${event.title})`, '/night');
	publish(eventId);
}

/** Tells the person who asked that you're coming (once). */
export function onMyWay(eventId: number, userId: number, requestId: number) {
	requireGoing(eventId, userId);
	const request = db
		.prepare('SELECT user_id FROM help_requests WHERE id = ? AND event_id = ? AND resolved_at IS NULL')
		.get(requestId, eventId) as { user_id: number } | undefined;
	if (!request) throw new EventError('They’re OK now.');
	if (request.user_id === userId) throw new EventError('That’s your own request.');
	const { changes } = db.prepare('INSERT OR IGNORE INTO help_responders (request_id, user_id) VALUES (?, ?)').run(requestId, userId);
	if (changes) notify(request.user_id, eventId, `${nameOf(userId)} is on their way to you.`, '/night#help');
	publish(eventId);
}

/** Open requests from the last 12 hours, only for people going (the location is like the address). */
export function listHelp(eventId: number, viewerId: number, now = nowLocal()): HelpRequest[] {
	const event = requireMember(eventId, viewerId);
	if (!canSeeAddress(event, viewerId)) return [];
	const rows = db
		.prepare(
			`SELECT h.id, h.user_id, u.name, h.note, h.at, h.lat, h.lng, h.accuracy FROM help_requests h JOIN users u ON u.id = h.user_id
			 WHERE h.event_id = ? AND h.resolved_at IS NULL AND h.at >= ? ORDER BY h.at DESC, h.id DESC`
		)
		.all(eventId, shiftLocal(now, -12 * 60)) as { id: number; user_id: number; name: string; note: string; at: string; lat: number | null; lng: number | null; accuracy: number | null }[];
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

/** Requests, with any location left on them, are deleted a week after they were last sent. */
export function purgeHelp(now = nowLocal()) {
	db.prepare('DELETE FROM help_requests WHERE at < ?').run(shiftLocal(now, -7 * 24 * 60));
}
