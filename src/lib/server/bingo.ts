// Night bingo (Night tab). Everyone going gets a random 3×3 card of things that happen on a night out.
// Once the night starts, anyone can mark a square when it happens, and it fills in on every card
// with that square. The first to complete a row, column or diagonal gets bingo.
import { randomInt } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember } from './events.ts';
import { isOver } from './after.ts';
import { goingPeople } from './money.ts';
import { notify } from './notifications.ts';
import { nowLocal } from '../time.ts';

// Keys are stored on cards: add new ones freely, but never remove or rename one.
export const MOMENTS: Record<string, string> = {
	'lost-phone': 'Someone loses their phone',
	chippy: 'Chippy or kebab at the end',
	bouncer: 'Bouncer turns someone away',
	tears: 'Someone cries',
	ex: 'Someone spots an ex',
	shots: 'Shots nobody asked for',
	'my-song': '“This is my song!”',
	spill: 'A drink gets spilled',
	stranger: 'A stranger joins the group',
	vanish: 'Someone vanishes for half an hour',
	'lost-jacket': 'Someone loses a jacket',
	declined: 'Card declined',
	'street-singing': 'Singing in the street',
	'falls-over': 'Someone falls over',
	asleep: 'Someone falls asleep',
	borrow: 'Someone borrows money',
	'smoking-area': 'Deep chat in the smoking area',
	'last-orders': 'Still out at last orders',
	shoes: 'Shoes come off',
	'bump-into': 'Bump into someone you know',
	'never-again': '“I’m never drinking again”',
	late: 'Leave pres an hour late',
	soaked: 'Get soaked in the rain',
	'taxi-queue': 'Taxi queue over 20 minutes',
	'wrong-name': 'Someone gets called the wrong name',
	'dance-floor': 'Someone takes over the dance floor'
};

const SIZE = 3;
// Every row, column and both diagonals, as indexes into a card's 9 squares.
const LINES = [
	...[0, 1, 2].map((r) => [0, 1, 2].map((c) => r * SIZE + c)),
	...[0, 1, 2].map((c) => [0, 1, 2].map((r) => r * SIZE + c)),
	[0, 4, 8],
	[2, 4, 6]
];

const label = (moment: string) => MOMENTS[moment] ?? 'Something happened';

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!goingPeople(eventId).some((p) => p.id === userId)) throw new EventError('RSVP “going” to play bingo.');
	return event;
}

/**
 * Gives someone a card of 9 different squares, picked at random. A card dealt during the night only
 * gets squares that haven't happened yet, so nobody joins with a line already done.
 */
export function dealCard(eventId: number, userId: number) {
	requireGoing(eventId, userId);
	tx(() => {
		if (db.prepare('SELECT 1 FROM bingo_cards WHERE event_id = ? AND user_id = ?').get(eventId, userId)) {
			throw new EventError('You’ve already got a card.');
		}
		const happened = new Set(marks(eventId).map((m) => m.moment));
		const pool = Object.keys(MOMENTS).filter((m) => !happened.has(m));
		if (pool.length < SIZE * SIZE) throw new EventError('Too much has happened tonight for a new card. Next time!');
		for (let i = pool.length - 1; i > 0; i--) {
			const j = randomInt(i + 1);
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		db.prepare('INSERT INTO bingo_cards (event_id, user_id, squares) VALUES (?, ?, ?)').run(eventId, userId, JSON.stringify(pool.slice(0, SIZE * SIZE)));
	});
	publish(eventId);
}

type Card = { user_id: number; name: string; squares: string[] };
type Mark = { id: number; moment: string; marked_by: number | null; name: string | null };
type Bingo = { user_id: number; name: string; at: number };

function cards(eventId: number): Card[] {
	const going = new Set(goingPeople(eventId).map((p) => p.id));
	const rows = db
		.prepare('SELECT c.user_id, u.name, c.squares FROM bingo_cards c JOIN users u ON u.id = c.user_id WHERE c.event_id = ? ORDER BY c.user_id')
		.all(eventId) as { user_id: number; name: string; squares: string }[];
	return rows.filter((c) => going.has(c.user_id)).map((c) => ({ ...c, squares: JSON.parse(c.squares) as string[] }));
}

function marks(eventId: number) {
	return db
		.prepare(
			`SELECT m.id, m.moment, m.marked_by, u.name FROM bingo_marks m LEFT JOIN users u ON u.id = m.marked_by
			 WHERE m.event_id = ? ORDER BY m.id`
		)
		.all(eventId) as Mark[];
}

/**
 * Everyone with a full line, in the order they got it. A line is finished by its last-marked square
 * (`at` is that mark's place in the order), and a card's bingo is its earliest finished line.
 */
function bingoOrder(all: Card[], marked: Mark[]) {
	const order = new Map(marked.map((m, i) => [m.moment, i]));
	const result: Bingo[] = [];
	for (const c of all) {
		let at = Infinity;
		for (const line of LINES) {
			const when = line.map((i) => order.get(c.squares[i]));
			if (when.every((x) => x !== undefined)) at = Math.min(at, Math.max(...(when as number[])));
		}
		if (at !== Infinity) result.push({ user_id: c.user_id, name: c.name, at });
	}
	return result.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
}

/**
 * Marks a square as happened for everyone (from your own card), or unmarks one (whoever marked it,
 * or the host, any square). Says which it wants, so a double tap or two people tapping at once
 * can't undo each other.
 */
export function setMoment(eventId: number, userId: number, moment: string, mark: boolean, now = nowLocal()) {
	const event = requireGoing(eventId, userId);
	if (!isOver(event, now)) throw new EventError('Bingo starts when the night does.');
	const fresh = tx(() => {
		const existing = db.prepare('SELECT marked_by FROM bingo_marks WHERE event_id = ? AND moment = ?').get(eventId, moment) as
			| { marked_by: number | null }
			| undefined;
		if (!mark) {
			if (!existing) return [];
			if (existing.marked_by !== userId && event.host_id !== userId) throw new EventError('Only whoever marked it, or the host, can unmark it.');
			db.prepare('DELETE FROM bingo_marks WHERE event_id = ? AND moment = ?').run(eventId, moment);
			return [];
		}
		const card = db.prepare('SELECT squares FROM bingo_cards WHERE event_id = ? AND user_id = ?').get(eventId, userId) as { squares: string } | undefined;
		if (!card || !(JSON.parse(card.squares) as string[]).includes(moment)) throw new EventError('That square isn’t on your card.');
		if (existing) return [];
		db.prepare('INSERT INTO bingo_marks (event_id, moment, marked_by) VALUES (?, ?, ?)').run(eventId, moment, userId);
		// Announce lines this square finished, once per person, so undoing and marking again can't
		// spam everyone, and someone who comes back to "going" isn't announced for an old line.
		const all = marks(eventId);
		const winners: Bingo[] = [];
		for (const w of bingoOrder(cards(eventId), all)) {
			if (w.at !== all.length - 1) continue;
			const { changes } = db.prepare('UPDATE bingo_cards SET announced = 1 WHERE event_id = ? AND user_id = ? AND announced = 0').run(eventId, w.user_id);
			if (changes) winners.push(w);
		}
		return winners;
	});
	if (fresh.length) {
		const names = fresh.map((w) => w.name).join(' and ');
		for (const p of goingPeople(eventId)) {
			notify(p.id, eventId, fresh.some((w) => w.user_id === p.id) ? 'Bingo! You got a line.' : `${names} got bingo!`, '/night#bingo');
		}
	}
	publish(eventId);
}

export function getBingo(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	const all = cards(eventId);
	const marked = marks(eventId);
	const byMoment = new Map(marked.map((m) => [m.moment, m]));
	const mine = all.find((c) => c.user_id === userId);
	// People who got bingo on the same square share a place: [['Ana', 'Ben'], ['Cat']].
	const places: string[][] = [];
	let last = -1;
	for (const w of bingoOrder(all, marked)) {
		if (w.at === last) places[places.length - 1].push(w.name);
		else places.push([w.name]);
		last = w.at;
	}
	return {
		going: goingPeople(eventId).some((p) => p.id === userId),
		card: mine
			? mine.squares.map((moment) => {
					const m = byMoment.get(moment);
					return { moment, label: label(moment), marked: !!m, by: m ? (m.name ?? 'Deleted user') : null, canUnmark: !!m && (m.marked_by === userId || event.host_id === userId) };
				})
			: null,
		players: all.length,
		called: marked.map((m) => ({ moment: m.moment, label: label(m.moment), by: m.name ?? 'Deleted user', canUnmark: m.marked_by === userId || event.host_id === userId })),
		winners: places
	};
}
