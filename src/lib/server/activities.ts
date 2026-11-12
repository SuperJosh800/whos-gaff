// The game running at an event (Games tab): everyone in the event sees the same card, live.
import { randomInt } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember } from './events.ts';
import { GAMES, isGameId, type GameId } from '../activities.ts';

type Row = { game: GameId; deck: string; position: number; target_id: number | null; soft: number };

function shuffle(length: number) {
	const deck = Array.from({ length }, (_, i) => i);
	for (let i = deck.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

/** People who can be picked for a challenge: the host and everyone going, or everyone in the event if nobody has RSVP'd. */
export function players(eventId: number) {
	const going = db
		.prepare(
			`SELECT u.id, u.name FROM event_members m JOIN events e ON e.id = m.event_id JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id) ORDER BY u.name`
		)
		.all(eventId) as { id: number; name: string }[];
	if (going.length > 1) return going;
	return db
		.prepare(`SELECT u.id, u.name FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = ? ORDER BY u.name`)
		.all(eventId) as { id: number; name: string }[];
}

/** Picks someone for the next challenge, avoiding whoever just had one when there's a choice. */
function pickTarget(eventId: number, previous: number | null) {
	const pool = players(eventId);
	const choices = pool.length > 1 ? pool.filter((p) => p.id !== previous) : pool;
	return choices.length ? choices[randomInt(choices.length)].id : null;
}

export function getActivity(eventId: number) {
	const row = db.prepare('SELECT game, deck, position, target_id, soft FROM event_activity WHERE event_id = ?').get(eventId) as
		| Row
		| undefined;
	if (!row) return null;
	const game = GAMES[row.game];
	const deck = JSON.parse(row.deck) as number[];
	const index = deck[row.position % deck.length];
	const target = row.target_id
		? (db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.target_id) as { id: number; name: string })
		: null;
	return {
		game: row.game,
		card: game.cards[index],
		points: game.points?.[index] ?? null,
		position: row.position,
		// Which card this is in the current pass through the deck, counting from 1.
		number: (row.position % deck.length) + 1,
		total: deck.length,
		target,
		soft: !!row.soft
	};
}

/** Starts a game for everyone in the event, replacing any game already running. */
export function startGame(eventId: number, userId: number, game: string, soft: boolean) {
	requireMember(eventId, userId);
	if (!isGameId(game)) throw new EventError('Pick a game.');
	const deck = shuffle(GAMES[game].cards.length);
	const target = game === 'challenges' ? pickTarget(eventId, null) : null;
	db.prepare(
		`INSERT INTO event_activity (event_id, game, deck, position, target_id, soft, updated_at)
		 VALUES (?, ?, ?, 0, ?, ?, datetime('now'))
		 ON CONFLICT (event_id) DO UPDATE SET game = excluded.game, deck = excluded.deck, position = 0,
		 target_id = excluded.target_id, soft = excluded.soft, updated_at = excluded.updated_at`
	).run(eventId, game, JSON.stringify(deck), target, soft ? 1 : 0);
	publish(eventId);
}

/**
 * Moves to the next card. `seen` is the position the person was looking at, so two people
 * tapping "next" at once only skip one card. The deck reshuffles after the last card.
 */
function advance(eventId: number, seen: number) {
	const row = db.prepare('SELECT game, deck, position, target_id FROM event_activity WHERE event_id = ?').get(eventId) as
		| Row
		| undefined;
	if (!row) throw new EventError('No game is running.');
	if (row.position !== seen) return false;
	const deck = JSON.parse(row.deck) as number[];
	const next = row.position + 1;
	const newDeck = next % deck.length === 0 ? shuffle(deck.length) : deck;
	const target = row.game === 'challenges' ? pickTarget(eventId, row.target_id) : null;
	db.prepare('UPDATE event_activity SET position = ?, deck = ?, target_id = ?, updated_at = datetime(\'now\') WHERE event_id = ?').run(
		next,
		JSON.stringify(newDeck),
		target,
		eventId
	);
	return true;
}

export function nextCard(eventId: number, userId: number, seen: number) {
	requireMember(eventId, userId);
	if (advance(eventId, seen)) publish(eventId);
}

/** Records whether the picked person completed or bailed on the current challenge, then deals the next one. */
export function finishChallenge(eventId: number, userId: number, seen: number, done: boolean) {
	requireMember(eventId, userId);
	const changed = tx(() => {
		const current = getActivity(eventId);
		if (!current || current.game !== 'challenges') throw new EventError('No challenge is running.');
		if (current.position !== seen) return false;
		if (current.target) {
			db.prepare('INSERT INTO challenge_results (event_id, user_id, challenge, points, done) VALUES (?, ?, ?, ?, ?)').run(
				eventId,
				current.target.id,
				current.card,
				done ? (current.points ?? 0) : 0,
				done ? 1 : 0
			);
		}
		return advance(eventId, seen);
	});
	if (changed) publish(eventId);
}

export function endGame(eventId: number, userId: number) {
	requireMember(eventId, userId);
	db.prepare('DELETE FROM event_activity WHERE event_id = ?').run(eventId);
	publish(eventId);
}

/** Challenge points for the night, highest first. */
export function challengeScores(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name, SUM(c.points) AS points, SUM(c.done) AS done, SUM(1 - c.done) AS bailed
			 FROM challenge_results c JOIN users u ON u.id = c.user_id
			 WHERE c.event_id = ? GROUP BY u.id ORDER BY points DESC, done DESC, u.name`
		)
		.all(eventId) as { id: number; name: string; points: number; done: number; bailed: number }[];
}
