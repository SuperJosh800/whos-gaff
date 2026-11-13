import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { getDrinks, logDrink, purgeDrinks, undoDrink } from './drinks.ts';
import { deleteAccount, exportData } from './account.ts';
import { db } from './db.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@drinks.test`, name, 'correct-horse-9') as User;

function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const sam = user('Sam');
	joinByToken(getEvent(id)!.invite_token, sam.id);
	setRsvp(id, sam.id, 'yes');
	return { id, host, sam };
}
/** Taps like the page does: sending your last entry. */
const tap = (id: number, userId: number, kind: string) => logDrink(id, userId, kind, getDrinks(id, userId).last);
const counts = (id: number, userId: number) => {
	const d = getDrinks(id, userId);
	return { drinks: d.drinks, waters: d.waters, haveWater: d.haveWater };
};

describe('drink and water tracker', () => {
	it('suggests a water from the third drink in a row until you have one', () => {
		const { id, sam } = night();
		tap(id, sam.id, 'drink');
		tap(id, sam.id, 'drink');
		expect(counts(id, sam.id)).toEqual({ drinks: 2, waters: 0, haveWater: false });
		tap(id, sam.id, 'drink');
		expect(counts(id, sam.id)).toEqual({ drinks: 3, waters: 0, haveWater: true });
		tap(id, sam.id, 'drink');
		expect(getDrinks(id, sam.id).sinceWater).toBe(4);
		tap(id, sam.id, 'water');
		expect(counts(id, sam.id)).toEqual({ drinks: 4, waters: 1, haveWater: false });
		tap(id, sam.id, 'drink');
		tap(id, sam.id, 'water');
		tap(id, sam.id, 'drink');
		tap(id, sam.id, 'drink');
		expect(counts(id, sam.id)).toEqual({ drinks: 7, waters: 2, haveWater: false });
		tap(id, sam.id, 'drink');
		expect(counts(id, sam.id)).toEqual({ drinks: 8, waters: 2, haveWater: true });
	});

	it('counts a double tap or a stale tab once', () => {
		const { id, sam } = night();
		const before = getDrinks(id, sam.id).last;
		logDrink(id, sam.id, 'drink', before);
		logDrink(id, sam.id, 'drink', before);
		logDrink(id, sam.id, 'water', before);
		expect(counts(id, sam.id)).toEqual({ drinks: 1, waters: 0, haveWater: false });
	});

	it('ignores a stale tab after an undo and a new tap', () => {
		const { id, sam } = night();
		tap(id, sam.id, 'drink');
		const tabA = getDrinks(id, sam.id).last; // tab A still shows the drink
		undoDrink(id, sam.id, tabA); // tab B undoes it…
		tap(id, sam.id, 'water'); // …and taps a water
		undoDrink(id, sam.id, tabA);
		logDrink(id, sam.id, 'drink', tabA);
		expect(counts(id, sam.id)).toEqual({ drinks: 0, waters: 1, haveWater: false });
	});

	it('never shows row ids, whose gaps would count other people’s taps', () => {
		const { id, host, sam } = night();
		tap(id, sam.id, 'drink');
		const first = getDrinks(id, sam.id).last;
		tap(id, host.id, 'drink');
		tap(id, sam.id, 'water');
		expect(first).toMatch(/^[0-9a-f]{24}$/);
		expect(getDrinks(id, sam.id).last).not.toBe(first);
		const rows = exportData(sam.id).drink_log as Record<string, unknown>[];
		expect(rows.map((r) => Object.keys(r).sort())).toEqual([
			['at', 'event_id', 'kind'],
			['at', 'event_id', 'kind']
		]);
	});

	it('deletes taps after a week, and when you delete your account', () => {
		const { id, host, sam } = night();
		tap(id, sam.id, 'drink');
		tap(id, sam.id, 'drink');
		tap(id, host.id, 'water');
		db.prepare("UPDATE drink_log SET at = datetime('now', '-8 days') WHERE id = (SELECT MIN(id) FROM drink_log WHERE user_id = ?)").run(sam.id);
		purgeDrinks();
		expect(counts(id, sam.id).drinks).toBe(1);
		deleteAccount(sam.id);
		expect(db.prepare('SELECT COUNT(*) AS n FROM drink_log WHERE user_id = ?').get(sam.id)).toEqual({ n: 0 });
		expect(counts(id, host.id).waters).toBe(1);
	});

	it('keeps each person’s count to themselves, on each night', () => {
		const { id, host, sam } = night();
		const other = night();
		joinByToken(getEvent(other.id)!.invite_token, sam.id);
		setRsvp(other.id, sam.id, 'yes');
		tap(id, sam.id, 'drink');
		tap(id, host.id, 'water');
		tap(other.id, sam.id, 'drink');
		tap(other.id, sam.id, 'drink');
		expect(counts(id, sam.id)).toEqual({ drinks: 1, waters: 0, haveWater: false });
		expect(counts(id, host.id)).toEqual({ drinks: 0, waters: 1, haveWater: false });
		expect(counts(other.id, sam.id)).toEqual({ drinks: 2, waters: 0, haveWater: false });
	});

	it('undoes only your own last tap, once', () => {
		const { id, host, sam } = night();
		tap(id, sam.id, 'drink');
		const first = getDrinks(id, sam.id).last;
		tap(id, sam.id, 'water');
		const last = getDrinks(id, sam.id).last;
		undoDrink(id, sam.id, first); // not the last tap any more
		undoDrink(id, host.id, last); // someone else's
		expect(counts(id, sam.id)).toEqual({ drinks: 1, waters: 1, haveWater: false });
		undoDrink(id, sam.id, last);
		undoDrink(id, sam.id, last);
		expect(counts(id, sam.id)).toEqual({ drinks: 1, waters: 0, haveWater: false });
		// Still works after you stop going.
		setRsvp(id, sam.id, 'no');
		undoDrink(id, sam.id, first);
		expect(counts(id, sam.id)).toEqual({ drinks: 0, waters: 0, haveWater: false });
		expect(() => undoDrink(id, user('Stranger').id, first)).toThrow('not invited');
	});

	it('is only for people going', () => {
		const { id } = night();
		const maybe = user('Maybe');
		joinByToken(getEvent(id)!.invite_token, maybe.id);
		setRsvp(id, maybe.id, 'maybe');
		expect(() => tap(id, maybe.id, 'drink')).toThrow('RSVP “going”');
		expect(() => tap(id, user('Stranger').id, 'drink')).toThrow('not invited');
		expect(() => tap(id, getEvent(id)!.host_id, 'shot')).toThrow('Choose a drink or a water');
	});
});
