// The game running at an event (Games tab). Everyone on the event plays from their own phone and sees
// the same card live, except secret cards: only the person they name sees the real text.
import { randomInt } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember } from './events.ts';
import { DEFAULT_COVER, fillNames, GAMES, namesNeeded, SOFT_NOTE, type Card } from '../activities.ts';
import { customGameForEvent } from './customGames.ts';

/** What a running game needs, copied when it starts so later edits to a custom game can't break it. */
type Meta = { name: string; emoji: string; rules: string; softRules: string; scored: boolean; custom: boolean };
type Row = { game: string; meta: string; cards: string; deck: string; position: number; picks: string; reveal: string | null; soft: number };
type Reveal = { name: string; mission: string; outcome: 'done' | 'bailed' | 'caught' };
type Person = { id: number; name: string };

function shuffle(length: number) {
	const deck = Array.from({ length }, (_, i) => i);
	for (let i = deck.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

/** People cards can name: the host and everyone going, or everyone on the event if fewer than two are going. */
export function players(eventId: number) {
	const going = db
		.prepare(
			`SELECT u.id, u.name FROM event_members m JOIN events e ON e.id = m.event_id JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id) ORDER BY u.name`
		)
		.all(eventId) as Person[];
	if (going.length > 1) return going;
	return db
		.prepare(`SELECT u.id, u.name FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = ? ORDER BY u.name`)
		.all(eventId) as Person[];
}

/**
 * Picks the people a card names, all different. The first pick avoids whoever went first last time,
 * so the same person isn't picked twice in a row when there's a choice.
 */
function pickPeople(eventId: number, card: Card, previousFirst: number | null, scored: boolean) {
	const wanted = Math.max(namesNeeded(card.text), namesNeeded(card.cover ?? ''), scored || card.secret ? 1 : 0);
	const pool = players(eventId);
	const picks: number[] = [];
	for (let i = 0; i < wanted && pool.length; i++) {
		let choices = pool.filter((p) => !picks.includes(p.id));
		if (i === 0 && choices.length > 1) choices = choices.filter((p) => p.id !== previousFirst);
		if (!choices.length) break;
		picks.push(choices[randomInt(choices.length)].id);
	}
	return picks;
}

function loadRow(eventId: number) {
	return db
		.prepare('SELECT game, meta, cards, deck, position, picks, reveal, soft FROM event_activity WHERE event_id = ?')
		.get(eventId) as Row | undefined;
}

function names(ids: number[]) {
	return ids.map((id) => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'someone');
}

/** The current card as one person should see it. Never includes another person's secret. */
export function getActivity(eventId: number, viewerId: number) {
	const row = loadRow(eventId);
	if (!row) return null;
	const meta = JSON.parse(row.meta) as Meta;
	const cards = JSON.parse(row.cards) as Card[];
	const deck = JSON.parse(row.deck) as number[];
	const card = cards[deck[row.position % deck.length]];
	const pickIds = JSON.parse(row.picks) as number[];
	const picked = names(pickIds);
	const player = pickIds.length ? { id: pickIds[0], name: picked[0] } : null;
	const secret = !!card.secret;
	const mine = !!player && player.id === viewerId;
	const text = secret && !mine ? (card.cover ?? DEFAULT_COVER) : card.text;
	return {
		game: row.game,
		name: meta.name,
		emoji: meta.emoji,
		rules: row.soft ? meta.softRules : meta.rules,
		scored: meta.scored,
		custom: meta.custom,
		card: fillNames(text, picked),
		/** Whether this card is a secret, and so whether the viewer is looking at the real thing or the cover. */
		secret,
		mine,
		/** On a secret card, the player is shown the fake task the others see, to use as cover. */
		cover: secret && mine ? fillNames(card.cover ?? DEFAULT_COVER, picked) : null,
		points: card.points ?? (meta.scored ? 1 : null),
		position: row.position,
		number: (row.position % deck.length) + 1,
		total: deck.length,
		player,
		soft: !!row.soft,
		reveal: row.reveal ? (JSON.parse(row.reveal) as Reveal) : null
	};
}

export type Activity = NonNullable<ReturnType<typeof getActivity>>;

/** Starts a game for everyone in the event, replacing any game already running. */
export function startGame(eventId: number, userId: number, gameId: string, soft: boolean) {
	requireMember(eventId, userId);
	let meta: Meta;
	let cards: Card[];
	const builtIn = GAMES[gameId];
	if (builtIn) {
		meta = {
			name: builtIn.name,
			emoji: builtIn.emoji,
			rules: builtIn.rules,
			softRules: builtIn.softRules ?? `${builtIn.rules} ${SOFT_NOTE}`,
			scored: !!builtIn.scored,
			custom: false
		};
		cards = builtIn.cards;
	} else {
		const custom = /^custom:(\d+)$/.exec(gameId);
		const game = custom ? customGameForEvent(eventId, Number(custom[1])) : null;
		if (!game) throw new EventError('Pick a game.');
		const rules = game.rules || 'Do what the card says. Refuse and take a sip.';
		meta = { name: game.name, emoji: game.emoji, rules, softRules: `${rules} ${SOFT_NOTE}`, scored: game.scored, custom: true };
		cards = game.cards;
	}
	const deck = shuffle(cards.length);
	const picks = pickPeople(eventId, cards[deck[0]], null, meta.scored);
	db.prepare(
		`INSERT INTO event_activity (event_id, game, meta, cards, deck, position, picks, reveal, soft, updated_at)
		 VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, datetime('now'))
		 ON CONFLICT (event_id) DO UPDATE SET game = excluded.game, meta = excluded.meta, cards = excluded.cards,
		 deck = excluded.deck, position = 0, picks = excluded.picks, reveal = NULL, soft = excluded.soft,
		 updated_at = excluded.updated_at`
	).run(eventId, gameId, JSON.stringify(meta), JSON.stringify(cards), JSON.stringify(deck), JSON.stringify(picks), soft ? 1 : 0);
	publish(eventId);
}

/**
 * Moves to the next card. `seen` is the position the person was looking at, so two people
 * tapping at once only move on one card. The deck reshuffles after the last card.
 */
function advance(eventId: number, row: Row, seen: number, reveal: Reveal | null) {
	if (row.position !== seen) return false;
	const meta = JSON.parse(row.meta) as Meta;
	const cards = JSON.parse(row.cards) as Card[];
	const deck = JSON.parse(row.deck) as number[];
	const next = row.position + 1;
	const newDeck = next % deck.length === 0 ? shuffle(deck.length) : deck;
	const previousFirst = (JSON.parse(row.picks) as number[])[0] ?? null;
	const picks = pickPeople(eventId, cards[newDeck[next % newDeck.length]], previousFirst, meta.scored);
	db.prepare(
		`UPDATE event_activity SET position = ?, deck = ?, picks = ?, reveal = ?, updated_at = datetime('now') WHERE event_id = ?`
	).run(next, JSON.stringify(newDeck), JSON.stringify(picks), reveal ? JSON.stringify(reveal) : row.reveal, eventId);
	return true;
}

function requireRow(eventId: number) {
	const row = loadRow(eventId);
	if (!row) throw new EventError('No game is running.');
	return row;
}

/** Next card, or skip the current one (a skipped challenge scores nothing). */
export function nextCard(eventId: number, userId: number, seen: number) {
	requireMember(eventId, userId);
	const changed = tx(() => advance(eventId, requireRow(eventId), seen, null));
	if (changed) publish(eventId);
}

export type Outcome = 'done' | 'bailed' | 'caught';

/**
 * Settles the current scored card, then deals the next one.
 * On a secret card only the player can say they did it or bailed, and only someone else can catch them.
 */
export function finishChallenge(eventId: number, userId: number, seen: number, outcome: Outcome) {
	requireMember(eventId, userId);
	const changed = tx(() => {
		const row = requireRow(eventId);
		const current = getActivity(eventId, userId)!;
		if (!current.scored) throw new EventError('This game doesn’t keep score.');
		if (row.position !== seen) return false;
		if (current.secret) {
			if (outcome === 'caught' && current.mine) throw new EventError('You can’t catch yourself!');
			if (outcome !== 'caught' && !current.mine) throw new EventError('Only the player can say how their mission went.');
		}
		let reveal: Reveal | null = null;
		if (current.player) {
			// Look at the card as the player sees it, so the real mission is what's recorded.
			const real = getActivity(eventId, current.player.id)!;
			db.prepare('INSERT INTO challenge_results (event_id, user_id, challenge, points, done) VALUES (?, ?, ?, ?, ?)').run(
				eventId,
				current.player.id,
				real.card,
				outcome === 'done' ? (real.points ?? 0) : 0,
				outcome === 'done' ? 1 : 0
			);
			if (real.secret) reveal = { name: current.player.name, mission: real.card, outcome };
		}
		return advance(eventId, row, seen, reveal);
	});
	if (changed) publish(eventId);
}

export function endGame(eventId: number, userId: number) {
	requireMember(eventId, userId);
	db.prepare('DELETE FROM event_activity WHERE event_id = ?').run(eventId);
	publish(eventId);
}

/** Points for the night, highest first. */
export function challengeScores(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name, SUM(c.points) AS points, SUM(c.done) AS done, SUM(1 - c.done) AS bailed
			 FROM challenge_results c JOIN users u ON u.id = c.user_id
			 WHERE c.event_id = ? GROUP BY u.id ORDER BY points DESC, done DESC, u.name`
		)
		.all(eventId) as { id: number; name: string; points: number; done: number; bailed: number }[];
}
