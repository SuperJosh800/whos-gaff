import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { dealCard, getBingo, MOMENTS, setMoment } from './bingo.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@bingo.test`, name, 'correct-horse-9') as User;
const BEFORE = '2099-06-20T20:00';
const DURING = '2099-06-20T23:00';
const KEYS = Object.keys(MOMENTS);

function night() {
	const host = user('Host');
	const [a, b, maybe] = [user('Ana'), user('Ben'), user('Maybe')];
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	for (const g of [a, b, maybe]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, a.id, 'yes');
	setRsvp(id, b.id, 'yes');
	return { id, host, a, b, maybe };
}

/** Gives someone a known card: the moments at these indexes, in order. */
function card(id: number, userId: number, squares = [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
	dealCard(id, userId);
	db.prepare('UPDATE bingo_cards SET squares = ? WHERE event_id = ? AND user_id = ?').run(JSON.stringify(squares.map((i) => KEYS[i])), id, userId);
}
const shift = (by: number) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => i + by);
const mark = (id: number, userId: number, square: number) => setMoment(id, userId, KEYS[square], true, DURING);
const unmark = (id: number, userId: number, square: number) => setMoment(id, userId, KEYS[square], false, DURING);
const marked = (id: number) => (db.prepare('SELECT moment FROM bingo_marks WHERE event_id = ? ORDER BY id').all(id) as { moment: string }[]).map((m) => KEYS.indexOf(m.moment));
const bingoNotes = (userId: number) => listNotifications(userId, 50).filter((x) => /bingo/i.test(x.message)).map((x) => x.message);

describe('night bingo', () => {
	it('deals one random card of 9 different squares to each person going', () => {
		const { id, host, a, b, maybe } = night();
		for (const p of [host, a, b]) dealCard(id, p.id);
		const squares = [host, a, b].map((p) => getBingo(id, p.id).card!.map((s) => s.moment));
		for (const sq of squares) {
			expect(new Set(sq).size).toBe(9);
			expect(sq.every((s) => s in MOMENTS)).toBe(true);
		}
		// Three cards dealt in the same order from 26 moments by chance: about 1 in 10^24.
		expect(new Set(squares.map((sq) => sq.join())).size).toBeGreaterThan(1);
		expect(() => dealCard(id, a.id)).toThrow('already got a card');
		expect(() => dealCard(id, maybe.id)).toThrow('RSVP');
	});

	it('only deals squares that haven’t happened yet to someone who joins during the night', () => {
		const { id, host, a, b } = night();
		card(id, a.id, shift(0));
		card(id, host.id, shift(9));
		for (const sq of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) mark(id, sq < 9 ? a.id : host.id, sq);
		dealCard(id, b.id);
		const bens = getBingo(id, b.id).card!.map((s) => KEYS.indexOf(s.moment));
		expect(bens.every((i) => i > 11)).toBe(true);
		expect(getBingo(id, b.id).winners).toEqual([['Ana'], ['Host']]);
		for (const sq of [12, 13, 14, 15, 16, 17]) mark(id, host.id, sq);
		const late = user('Late');
		joinByToken(getEvent(id)!.invite_token, late.id);
		setRsvp(id, late.id, 'yes');
		expect(() => dealCard(id, late.id)).toThrow('Too much has happened');
	});

	it('marks squares only once the night starts, only from your own card, and fills them in on everyone’s card', () => {
		const { id, a, b, maybe } = night();
		card(id, a.id);
		card(id, b.id, shift(4)); // shares squares 4–8 with Ana
		expect(() => setMoment(id, a.id, KEYS[0], true, BEFORE)).toThrow('when the night does');
		expect(() => mark(id, a.id, 12)).toThrow('isn’t on your card');
		expect(() => mark(id, maybe.id, 0)).toThrow('RSVP');
		mark(id, a.id, 5);
		const bens = getBingo(id, b.id).card!;
		expect(bens[1]).toMatchObject({ moment: KEYS[5], marked: true, by: 'Ana', canUnmark: false });
		expect(bens.filter((s) => s.marked)).toHaveLength(1);
		setRsvp(id, a.id, 'no');
		expect(() => mark(id, a.id, 0)).toThrow('RSVP');
	});

	it('ignores a repeated tap, so double taps and two people tapping at once don’t undo each other', () => {
		const { id, host, a, b } = night();
		for (const p of [host, a, b]) card(id, p.id);
		mark(id, a.id, 0);
		mark(id, a.id, 0);
		mark(id, host.id, 0);
		mark(id, b.id, 0);
		expect(marked(id)).toEqual([0]);
		expect(getBingo(id, b.id).card![0].by).toBe('Ana');
		unmark(id, a.id, 0);
		unmark(id, a.id, 0);
		expect(marked(id)).toEqual([]);
	});

	it('lets whoever marked a square, or the host, unmark it, even when it isn’t on the host’s card', () => {
		const { id, host, a, b } = night();
		card(id, a.id);
		card(id, b.id);
		mark(id, a.id, 0);
		mark(id, a.id, 1);
		expect(() => unmark(id, b.id, 0)).toThrow('Only whoever marked it');
		unmark(id, a.id, 1);
		unmark(id, host.id, 0); // the host has no card at all
		expect(marked(id)).toEqual([]);
		expect(getBingo(id, host.id).called).toEqual([]);
	});

	it('gives bingo for a row, column or diagonal, in the order the lines were finished', () => {
		const { id, host, a, b } = night();
		card(id, a.id); // squares 0 1 2 / 3 4 5 / 6 7 8
		card(id, host.id, shift(9)); // nothing in common
		card(id, b.id, [3, 4, 9, 20, 21, 22, 23, 24, 25]); // Ben's top row is 3, 4 and 9
		for (const sq of [0, 1, 3, 4]) mark(id, a.id, sq);
		expect(getBingo(id, a.id).winners).toEqual([]);
		mark(id, b.id, 9); // Ben's top row
		mark(id, a.id, 2); // Ana's top row, later
		expect(getBingo(id, a.id).winners).toEqual([['Ben'], ['Ana']]);

		unmark(id, a.id, 2); // Ana has no line now
		expect(getBingo(id, a.id).winners).toEqual([['Ben']]);
		mark(id, a.id, 8); // diagonal 0 4 8
		mark(id, a.id, 7); // middle column 1 4 7, after the diagonal
		expect(getBingo(id, a.id).winners).toEqual([['Ben'], ['Ana']]);
		unmark(id, b.id, 9); // Ben's line goes: now Ana is first
		expect(getBingo(id, a.id).winners).toEqual([['Ana']]);
		mark(id, b.id, 9); // Ben's line is back, but after Ana's diagonal now
		mark(id, a.id, 6); // Ana's third line comes after Ben's; her bingo still counts from the diagonal
		expect(getBingo(id, a.id).winners).toEqual([['Ana'], ['Ben']]);
	});

	it('puts people whose lines finish on the same square in the same place', () => {
		const { id, host, a, b } = night();
		card(id, a.id);
		card(id, b.id, [0, 1, 2, 9, 10, 11, 12, 13, 14]);
		card(id, host.id, shift(9));
		mark(id, a.id, 0);
		mark(id, a.id, 1);
		mark(id, host.id, 9);
		mark(id, host.id, 10);
		mark(id, a.id, 2);
		mark(id, host.id, 11);
		expect(getBingo(id, a.id).winners).toEqual([['Ana', 'Ben'], ['Host']]);
	});

	it('tells everyone going about each new bingo once, and not again if a square is unmarked and marked again', () => {
		const { id, host, a, b, maybe } = night();
		card(id, a.id);
		card(id, b.id, shift(9)); // no squares in common
		for (const s of [0, 1]) mark(id, a.id, s);
		expect(bingoNotes(host.id)).toEqual([]);
		mark(id, a.id, 2);
		expect(bingoNotes(a.id)).toEqual(['Bingo! You got a line.']);
		expect(bingoNotes(b.id)).toEqual(['Ana got bingo!']);
		expect(bingoNotes(host.id)).toEqual(['Ana got bingo!']);
		expect(bingoNotes(maybe.id)).toEqual([]);
		unmark(id, a.id, 2);
		mark(id, a.id, 2);
		expect(bingoNotes(b.id)).toEqual(['Ana got bingo!']);
		for (const s of [9, 10, 11]) mark(id, b.id, s);
		expect(bingoNotes(host.id)).toEqual(['Ben got bingo!', 'Ana got bingo!']);
	});

	it('doesn’t announce an old line for someone who comes back to going', () => {
		const { id, host, a, b } = night();
		card(id, a.id);
		card(id, b.id);
		setRsvp(id, b.id, 'no');
		for (const s of [0, 1, 2]) mark(id, a.id, s);
		setRsvp(id, b.id, 'yes');
		mark(id, a.id, 8);
		expect(bingoNotes(host.id)).toEqual(['Ana got bingo!']);
		expect(getBingo(id, host.id).winners).toEqual([['Ana', 'Ben']]);
	});

	it('leaves out cards of people who stop going, and keeps squares marked by deleted accounts without a name', () => {
		const { id, a, b } = night();
		card(id, a.id);
		card(id, b.id);
		mark(id, b.id, 0);
		mark(id, a.id, 1);
		mark(id, a.id, 2);
		expect(getBingo(id, b.id).winners).toEqual([['Ana', 'Ben']]);
		setRsvp(id, b.id, 'no');
		expect(getBingo(id, a.id)).toMatchObject({ players: 1, winners: [['Ana']] });
		deleteAccount(b.id);
		expect(getBingo(id, a.id).card![0]).toMatchObject({ marked: true, by: 'Deleted user' });
		expect(db.prepare('SELECT COUNT(*) AS n FROM bingo_cards WHERE user_id = ?').get(b.id)).toEqual({ n: 0 });
	});
});
