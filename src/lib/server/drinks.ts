// Drink and water tracker: tap to count a drink or a water. Private to you; every few drinks
// without a water, the tracker suggests one.
import { db } from './db.ts';
import { EventError, requireMember } from './events.ts';
import { canSeeAddress } from './gaff.ts';

/** Drinks in a row, with no water in between, before the tracker suggests a water. */
export const WATER_EVERY = 3;

type Entry = { id: number; kind: 'drink' | 'water' };

export function getDrinks(eventId: number, userId: number) {
	const entries = db
		.prepare('SELECT id, kind FROM drink_log WHERE event_id = ? AND user_id = ? ORDER BY id')
		.all(eventId, userId) as Entry[];
	const lastWater = entries.findLastIndex((e) => e.kind === 'water');
	const sinceWater = entries.length - 1 - lastWater;
	return {
		drinks: entries.filter((e) => e.kind === 'drink').length,
		waters: entries.filter((e) => e.kind === 'water').length,
		sinceWater,
		haveWater: sinceWater >= WATER_EVERY,
		/** Sent back with each tap, so a double tap or a stale tab counts once. */
		last: entries.at(-1)?.id ?? 0
	};
}

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('RSVP “going” to count your drinks.');
}

/** Counts a drink or a water, unless something was counted since `after` (your last entry when you tapped). */
export function logDrink(eventId: number, userId: number, kind: string, after: number) {
	requireGoing(eventId, userId);
	if (kind !== 'drink' && kind !== 'water') throw new EventError('Choose a drink or a water.');
	if (getDrinks(eventId, userId).last !== after) return;
	db.prepare('INSERT INTO drink_log (event_id, user_id, kind) VALUES (?, ?, ?)').run(eventId, userId, kind);
}

/** Takes back your last tap, if `last` is still your last entry. */
export function undoDrink(eventId: number, userId: number, last: number) {
	requireGoing(eventId, userId);
	db.prepare(
		`DELETE FROM drink_log WHERE id = ? AND event_id = ? AND user_id = ?
		 AND id = (SELECT MAX(id) FROM drink_log WHERE event_id = ? AND user_id = ?)`
	).run(last, eventId, userId, eventId, userId);
}
