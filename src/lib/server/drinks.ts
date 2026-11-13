// Drink and water tracker: tap to count a drink or a water. Private to you; every few drinks
// without a water, the tracker suggests one. Taps are deleted a week after they're made.
import { db } from './db.ts';
import { EventError, requireMember } from './events.ts';
import { canSeeAddress } from './gaff.ts';

/** Drinks in a row, with no water in between, before the tracker suggests a water. */
export const WATER_EVERY = 3;

type Entry = { token: string; kind: 'drink' | 'water' };

export function getDrinks(eventId: number, userId: number) {
	const entries = db
		.prepare('SELECT token, kind FROM drink_log WHERE event_id = ? AND user_id = ? ORDER BY id')
		.all(eventId, userId) as Entry[];
	const lastWater = entries.findLastIndex((e) => e.kind === 'water');
	const sinceWater = entries.length - 1 - lastWater;
	return {
		drinks: entries.filter((e) => e.kind === 'drink').length,
		waters: entries.filter((e) => e.kind === 'water').length,
		sinceWater,
		haveWater: sinceWater >= WATER_EVERY,
		lastKind: entries.at(-1)?.kind ?? null,
		/**
		 * Your last tap's random token, sent back with each tap so a double tap or a stale tab counts once.
		 * Not the row id: ids are shared by everyone, so gaps between yours would show other people's taps.
		 */
		last: entries.at(-1)?.token ?? ''
	};
}

/** Counts a drink or a water, unless something was counted since `after` (your last tap's token when you tapped). */
export function logDrink(eventId: number, userId: number, kind: string, after: string) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('RSVP “going” to count your drinks.');
	if (kind !== 'drink' && kind !== 'water') throw new EventError('Choose a drink or a water.');
	if (getDrinks(eventId, userId).last !== after) return;
	db.prepare('INSERT INTO drink_log (event_id, user_id, kind) VALUES (?, ?, ?)').run(eventId, userId, kind);
}

/** Takes back your last tap, if `last` is still its token. Works even after you stop going. */
export function undoDrink(eventId: number, userId: number, last: string) {
	requireMember(eventId, userId);
	db.prepare(
		`DELETE FROM drink_log WHERE token = ? AND id = (SELECT MAX(id) FROM drink_log WHERE event_id = ? AND user_id = ?)`
	).run(last, eventId, userId);
}

/** Taps are only for the night itself, so they're deleted after a week. */
export function purgeDrinks() {
	db.prepare("DELETE FROM drink_log WHERE at < datetime('now', '-7 days')").run();
}
