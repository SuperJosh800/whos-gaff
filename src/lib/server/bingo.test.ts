import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { dealCard, getBingo, MOMENTS, toggleMoment } from './bingo.ts';
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

/** Gives someone a known card: squares 0–8 of the moment list, shifted by `offset`. */
function card(id: number, userId: number, offset = 0) {
	dealCard(id, userId);
	db.prepare('UPDATE bingo_cards SET squares = ? WHERE event_id = ? AND user_id = ?').run(JSON.stringify(KEYS.slice(offset, offset + 9)), id, userId);
}
const mark = (id: number, userId: number, square: number) => toggleMoment(id, userId, KEYS[square], DURING);
const bingoNotes = (userId: number) => listNotifications(userId, 50).filter((x) => /bingo/i.test(x.message)).map((x) => x.message);

describe('night bingo', () => {
	it('deals one card of 9 different squares to each person going', () => {
		const { id, a, maybe } = night();
		dealCard(id, a.id);
		const squares = getBingo(id, a.id).card!.map((s) => s.moment);
		expect(new Set(squares).size).toBe(9);
		expect(squares.every((s) => s in MOMENTS)).toBe(true);
		expect(() => dealCard(id, a.id)).toThrow('already got a card');
		expect(() => dealCard(id, maybe.id)).toThrow('RSVP');
	});

	it('marks squares only once the night starts, only from your own card, and fills them in on everyone’s card', () => {
		const { id, a, b } = night();
		card(id, a.id);
		card(id, b.id, 4); // shares squares 4–8 with Ana
		expect(() => toggleMoment(id, a.id, KEYS[0], BEFORE)).toThrow('when the night does');
		expect(() => mark(id, a.id, 12)).toThrow('isn’t on your card');
		mark(id, a.id, 5);
		const bens = getBingo(id, b.id).card!;
		expect(bens[1]).toMatchObject({ moment: KEYS[5], marked: true, by: 'Ana', mine: false });
		expect(bens.filter((s) => s.marked)).toHaveLength(1);
	});

	it('lets only whoever marked a square, or the host, unmark it', () => {
		const { id, host, a, b } = night();
		for (const p of [host, a, b]) card(id, p.id);
		mark(id, a.id, 0);
		expect(() => mark(id, b.id, 0)).toThrow('Only whoever marked it');
		mark(id, host.id, 0);
		expect(getBingo(id, a.id).card![0].marked).toBe(false);
		mark(id, b.id, 0);
		mark(id, b.id, 0);
		expect(getBingo(id, a.id).card![0].marked).toBe(false);
	});

	it('gives bingo for a row, column or diagonal, in the order the lines were finished', () => {
		const { id, host, a, b } = night();
		card(id, a.id); // squares 0 1 2 / 3 4 5 / 6 7 8
		card(id, host.id, 9); // nothing in common
		dealCard(id, b.id);
		// Ben's top row is 3, 4 and 9; the rest of his card is nobody else's.
		db.prepare('UPDATE bingo_cards SET squares = ? WHERE event_id = ? AND user_id = ?').run(
			JSON.stringify([3, 4, 9, 20, 21, 22, 23, 24, 25].map((i) => KEYS[i])),
			id,
			b.id
		);
		for (const sq of [0, 1, 3, 4]) mark(id, a.id, sq);
		expect(getBingo(id, a.id).winners).toEqual([]);
		mark(id, b.id, 9); // Ben's top row
		mark(id, a.id, 2); // Ana's top row, later
		expect(getBingo(id, a.id).winners).toEqual(['Ben', 'Ana']);

		mark(id, a.id, 2); // undo Ana's row: she has no line
		expect(getBingo(id, a.id).winners).toEqual(['Ben']);
		mark(id, a.id, 8); // diagonal 0 4 8
		mark(id, a.id, 7); // middle column 1 4 7, after the diagonal
		expect(getBingo(id, a.id).winners).toEqual(['Ben', 'Ana']);
		mark(id, b.id, 9); // Ben's line goes: now Ana is first
		expect(getBingo(id, a.id).winners).toEqual(['Ana']);
		mark(id, b.id, 9); // Ben's line is back, but after Ana's diagonal now
		mark(id, a.id, 6); // Ana's third line comes after Ben's; her bingo still counts from the diagonal
		expect(getBingo(id, a.id).winners).toEqual(['Ana', 'Ben']);
	});

	it('tells everyone going about each person’s bingo once, even if a square is unmarked and marked again', () => {
		const { id, host, a, b, maybe } = night();
		card(id, a.id);
		card(id, b.id, 9); // no squares in common
		for (const s of [0, 1]) mark(id, a.id, s);
		expect(bingoNotes(host.id)).toEqual([]);
		mark(id, a.id, 2);
		expect(bingoNotes(a.id)).toEqual(['Bingo! You got a line.']);
		expect(bingoNotes(b.id)).toEqual(['Ana got bingo!']);
		expect(bingoNotes(host.id)).toEqual(['Ana got bingo!']);
		expect(bingoNotes(maybe.id)).toEqual([]);
		mark(id, a.id, 2);
		mark(id, a.id, 2);
		expect(bingoNotes(b.id)).toEqual(['Ana got bingo!']);
	});

	it('leaves out cards of people who stop going, and keeps squares marked by deleted accounts without a name', () => {
		const { id, a, b } = night();
		card(id, a.id);
		card(id, b.id);
		mark(id, b.id, 0);
		mark(id, a.id, 1);
		mark(id, a.id, 2);
		expect(getBingo(id, b.id).winners).toEqual(['Ana', 'Ben']);
		setRsvp(id, b.id, 'no');
		expect(getBingo(id, a.id)).toMatchObject({ players: 1, winners: ['Ana'] });
		deleteAccount(b.id);
		expect(getBingo(id, a.id).card![0]).toMatchObject({ marked: true, by: 'Deleted user' });
		expect(db.prepare('SELECT COUNT(*) AS n FROM bingo_cards WHERE user_id = ?').get(b.id)).toEqual({ n: 0 });
	});
});
