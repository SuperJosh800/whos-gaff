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
export const LINES = [
	...[0, 1, 2].map((r) => [0, 1, 2].map((c) => r * SIZE + c)),
	...[0, 1, 2].map((c) => [0, 1, 2].map((r) => r * SIZE + c)),
	[0, 4, 8],
	[2, 4, 6]
];

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!goingPeople(eventId).some((p) => p.id === userId)) throw new EventError('RSVP “going” to play bingo.');
	return event;
}

/** Gives someone a card of 9 different squares, picked at random. */
export function dealCard(eventId: number, userId: number) {
	requireGoing(eventId, userId);
	const pool = Object.keys(MOMENTS);
	for (let i = pool.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	const { changes } = db
		.prepare('INSERT OR IGNORE INTO bingo_cards (event_id, user_id, squares) VALUES (?, ?, ?)')
		.run(eventId, userId, JSON.stringify(pool.slice(0, SIZE * SIZE)));
	if (!changes) throw new EventError('You’ve already got a card.');
	publish(eventId);
}

type Card = { user_id: number; name: string; squares: string[] };
type Mark = { id: number; moment: string; marked_by: number | null; name: string | null };

function cards(eventId: number) {
	const going = new Set(goingPeople(eventId).map((p) => p.id));
	return (
		db
			.prepare('SELECT c.user_id, u.name, c.squares FROM bingo_cards c JOIN users u ON u.id = c.user_id WHERE c.event_id = ? ORDER BY c.user_id')
			.all(eventId) as { user_id: number; name: string; squares: string }[]
	)
		.filter((c) => going.has(c.user_id))
		.map((c) => ({ ...c, squares: JSON.parse(c.squares) as string[] })) as Card[];
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
 * Everyone with a full line, in the order they got it: a line is complete at its last-marked square,
 * so a card's bingo is the earliest of those.
 */
export function bingoOrder(all: Card[], marked: Mark[]) {
	const order = new Map(marked.map((m, i) => [m.moment, i]));
	return all
		.map((c) => {
			const done = LINES.map((line) => line.map((i) => order.get(c.squares[i]))).filter((at) => at.every((x) => x !== undefined));
			return { user_id: c.user_id, name: c.name, at: done.length ? Math.min(...done.map((at) => Math.max(...(at as number[])))) : null };
		})
		.filter((w): w is { user_id: number; name: string; at: number } => w.at !== null)
		.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
}

/** Marks a square as happened for everyone, or unmarks it (only whoever marked it, or the host). */
export function toggleMoment(eventId: number, userId: number, moment: string, now = nowLocal()) {
	const event = requireGoing(eventId, userId);
	if (!isOver(event, now)) throw new EventError('Bingo starts when the night does.');
	if (!(moment in MOMENTS)) throw new EventError('Unknown square.');
	const fresh = tx(() => {
		const card = db.prepare('SELECT squares FROM bingo_cards WHERE event_id = ? AND user_id = ?').get(eventId, userId) as { squares: string } | undefined;
		if (!card || !(JSON.parse(card.squares) as string[]).includes(moment)) throw new EventError('That square isn’t on your card.');
		const existing = db.prepare('SELECT marked_by FROM bingo_marks WHERE event_id = ? AND moment = ?').get(eventId, moment) as
			| { marked_by: number | null }
			| undefined;
		if (existing) {
			if (existing.marked_by !== userId && event.host_id !== userId) throw new EventError('Only whoever marked it, or the host, can unmark it.');
			db.prepare('DELETE FROM bingo_marks WHERE event_id = ? AND moment = ?').run(eventId, moment);
			return [];
		}
		db.prepare('INSERT INTO bingo_marks (event_id, moment, marked_by) VALUES (?, ?, ?)').run(eventId, moment, userId);
		// Announce each person's bingo once, so unmarking and marking again can't spam everyone.
		return bingoOrder(cards(eventId), marks(eventId)).filter(
			(w) => db.prepare('UPDATE bingo_cards SET announced = 1 WHERE event_id = ? AND user_id = ? AND announced = 0').run(eventId, w.user_id).changes
		);
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
	requireMember(eventId, userId);
	const all = cards(eventId);
	const marked = marks(eventId);
	const byMoment = new Map(marked.map((m) => [m.moment, m]));
	const mine = all.find((c) => c.user_id === userId);
	return {
		going: goingPeople(eventId).some((p) => p.id === userId),
		card: mine
			? mine.squares.map((moment) => {
					const m = byMoment.get(moment);
					return { moment, label: MOMENTS[moment], marked: !!m, by: m ? (m.name ?? 'Deleted user') : null, mine: m?.marked_by === userId };
				})
			: null,
		players: all.length,
		called: marked.map((m) => ({ label: MOMENTS[m.moment], by: m.name ?? 'Deleted user' })),
		winners: bingoOrder(all, marked).map((w) => w.name)
	};
}
