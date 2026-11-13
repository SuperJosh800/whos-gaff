// Repeat nights: the host sets a dated event to happen every week or fortnight. Once a night has started,
// the next one is made for the same time, with the same details and the same people, who are told it's on.
import { randomBytes } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, getEvent, requireHost, type Event } from './events.ts';
import { formatWhen, nowLocal, shiftLocal } from '../time.ts';

export const REPEATS = { 7: 'Every week', 14: 'Every fortnight' } as const;
export type RepeatDays = keyof typeof REPEATS;

export function setRepeat(eventId: number, hostId: number, days: RepeatDays | null) {
	const event = requireHost(eventId, hostId);
	if (days !== null && !(days in REPEATS)) throw new EventError('Pick how often it repeats.');
	if (days !== null && !event.starts_at) throw new EventError('Pick the date first, then set it to repeat.');
	db.prepare('UPDATE events SET repeat_days = ? WHERE id = ?').run(days, eventId);
	publish(eventId);
}

/** The first repeat of `startsAt` that's still to come. A night missed while the server was off is skipped, not made late. */
export function nextDate(startsAt: string, days: number, now = nowLocal()) {
	let next = shiftLocal(startsAt, days * 24 * 60);
	while (next <= now) next = shiftLocal(next, days * 24 * 60);
	return next;
}

/** Makes the next night for every repeating event that has started. Safe to run as often as you like. */
export function makeRepeats(now = nowLocal()) {
	const due = db
		.prepare('SELECT id FROM events WHERE repeat_days IS NOT NULL AND starts_at IS NOT NULL AND starts_at <= ?')
		.all(now) as { id: number }[];
	return due.map(({ id }) => repeat(getEvent(id)!, now)).filter((id) => id !== null);
}

function repeat(event: Event, now: string) {
	const next = nextDate(event.starts_at!, event.repeat_days!, now);
	const created = tx(() => {
		// Hand the repeat on to the new night; if another run already did, there's nothing to do.
		if (!db.prepare('UPDATE events SET repeat_days = NULL WHERE id = ? AND repeat_days IS NOT NULL').run(event.id).changes) return null;
		const { lastInsertRowid } = db
			.prepare(
				`INSERT INTO events (host_id, title, details, location, mode, starts_at, invite_token, gaff_id, group_id, playlist_url,
					repeat_days, repeated_from)
				 SELECT host_id, title, details, location, 'fixed', ?, ?, gaff_id, group_id, playlist_url, ?, id FROM events WHERE id = ?`
			)
			.run(next, randomBytes(12).toString('base64url'), event.repeat_days, event.id);
		const id = Number(lastInsertRowid);
		db.prepare('INSERT INTO event_members (event_id, user_id) VALUES (?, ?)').run(id, event.host_id);
		// A group night invites whoever's in the group now; otherwise the same people as last time.
		if (event.group_id) {
			db.prepare('INSERT OR IGNORE INTO event_members (event_id, user_id) SELECT ?, user_id FROM group_members WHERE group_id = ?').run(id, event.group_id);
		} else {
			db.prepare('INSERT OR IGNORE INTO event_members (event_id, user_id) SELECT ?, user_id FROM event_members WHERE event_id = ?').run(id, event.id);
		}
		return id;
	});
	if (created === null) return null;
	const guests = db.prepare('SELECT user_id FROM event_members WHERE event_id = ? AND user_id != ?').all(created, event.host_id) as { user_id: number }[];
	for (const g of guests) notify(g.user_id, created, `${event.title} is on again: ${formatWhen(next)}. Are you coming?`);
	publish(event.id);
	return created;
}
