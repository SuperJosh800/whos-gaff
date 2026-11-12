// The game at an event (Games tab). Someone picks a game and it opens in a lobby; everyone going is told
// and can join. Once someone starts it, players see the same card live on their own phones, except secret
// cards: only the person they name sees the real text. Cards only name people who joined.
import { randomInt } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember } from './events.ts';
import { notify } from './notifications.ts';
import { DEFAULT_COVER, fillNames, GAMES, namesNeeded, SOFT_NOTE, type Card } from '../activities.ts';
import { customGameForEvent } from './customGames.ts';

/** What a running game needs, copied when it starts so later edits to a custom game can't break it. */
type Meta = { name: string; emoji: string; rules: string; softRules: string; scored: boolean; custom: boolean };
type Row = {
	game: string;
	meta: string;
	cards: string;
	deck: string;
	position: number;
	picks: string;
	reveal: string | null;
	soft: number;
	started: number;
	next_votes: string;
};
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

/** The people at the night: the host and everyone going, or everyone on the event if fewer than two are going. */
function goingPeople(eventId: number) {
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
	const joined = gamePlayers(eventId);
	// A game started before lobbies existed has no players listed, so it deals to everyone going.
	const pool = joined.length ? joined : goingPeople(eventId);
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
		.prepare('SELECT game, meta, cards, deck, position, picks, reveal, soft, started, next_votes FROM event_activity WHERE event_id = ?')
		.get(eventId) as Row | undefined;
}

/** Votes needed to move to the next card: half the players, rounded up. */
function votesNeeded(eventId: number) {
	const joined = gamePlayers(eventId).length;
	return Math.max(1, Math.ceil((joined || goingPeople(eventId).length) / 2));
}

/** Who has joined the game, in the order they joined. */
function gamePlayers(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name FROM game_players g JOIN users u ON u.id = g.user_id
			 WHERE g.event_id = ? ORDER BY g.joined_at, g.rowid`
		)
		.all(eventId) as Person[];
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
	const joined = gamePlayers(eventId);
	const votes = JSON.parse(row.next_votes) as number[];
	return {
		game: row.game,
		/** False while the game is in its lobby, waiting for people to join. */
		started: !!row.started,
		players: joined,
		joined: joined.some((p) => p.id === viewerId),
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
		/** "Next card" needs half the players: how many have tapped it, how many it needs, and whether you have. */
		votes: { count: votes.length, needed: votesNeeded(eventId), mine: votes.includes(viewerId) },
		soft: !!row.soft,
		reveal: row.reveal ? (JSON.parse(row.reveal) as Reveal) : null
	};
}

export type Activity = NonNullable<ReturnType<typeof getActivity>>;

/**
 * Picks the game. With no game on, it opens a lobby: the person who picked it joins, and everyone
 * going is told so they can join too. Picking again swaps the game and keeps whoever has joined;
 * a game already being played carries on with the new cards.
 */
export function openGame(eventId: number, userId: number, gameId: string, soft: boolean) {
	const event = requireMember(eventId, userId);
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
	const isNew = tx(() => {
		const existing = loadRow(eventId);
		if (existing && !isPlayer(eventId, userId)) throw new EventError('Join the game to change it.');
		const deck = shuffle(cards.length);
		const started = existing?.started ?? 0;
		const picks = started ? pickPeople(eventId, cards[deck[0]], null, meta.scored) : [];
		db.prepare(
			`INSERT INTO event_activity (event_id, game, meta, cards, deck, position, picks, reveal, soft, started, updated_at)
			 VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, 0, datetime('now'))
			 ON CONFLICT (event_id) DO UPDATE SET game = excluded.game, meta = excluded.meta, cards = excluded.cards,
			 deck = excluded.deck, position = 0, picks = excluded.picks, reveal = NULL, soft = excluded.soft,
			 next_votes = '[]', updated_at = excluded.updated_at`
		).run(eventId, gameId, JSON.stringify(meta), JSON.stringify(cards), JSON.stringify(deck), JSON.stringify(picks), soft ? 1 : 0);
		db.prepare('INSERT OR IGNORE INTO game_players (event_id, user_id) VALUES (?, ?)').run(eventId, userId);
		return !existing;
	});
	if (isNew) {
		const opener = gamePlayers(eventId)[0]?.name ?? 'Someone';
		for (const p of goingPeople(eventId)) {
			if (p.id !== userId) notify(p.id, eventId, `${opener} wants to play ${meta.name} at ${event.title}. Join in!`);
		}
	}
	publish(eventId);
}

function isPlayer(eventId: number, userId: number) {
	return !!db.prepare('SELECT 1 FROM game_players WHERE event_id = ? AND user_id = ?').get(eventId, userId);
}

/** Only people who joined play the game; a game started before lobbies existed lets anyone on the event play. */
function requirePlayer(eventId: number, userId: number) {
	if (gamePlayers(eventId).length && !isPlayer(eventId, userId)) throw new EventError('Join the game first.');
}

export function joinGame(eventId: number, userId: number) {
	requireMember(eventId, userId);
	requireRow(eventId);
	db.prepare('INSERT OR IGNORE INTO game_players (event_id, user_id) VALUES (?, ?)').run(eventId, userId);
	publish(eventId);
}

/**
 * Leaves the game, taking back any vote for the next card; with fewer players, the votes already
 * in may now be enough. When the last player leaves, the game ends.
 */
export function leaveGame(eventId: number, userId: number) {
	requireMember(eventId, userId);
	tx(() => {
		db.prepare('DELETE FROM game_players WHERE event_id = ? AND user_id = ?').run(eventId, userId);
		if (!gamePlayers(eventId).length) {
			db.prepare('DELETE FROM event_activity WHERE event_id = ?').run(eventId);
			return;
		}
		const row = loadRow(eventId);
		if (row?.started) countVotes(eventId, row, (JSON.parse(row.next_votes) as number[]).filter((id) => id !== userId));
	});
	publish(eventId);
}

/** Starts the game in the lobby for everyone who joined, and deals the first card. */
export function beginGame(eventId: number, userId: number) {
	requireMember(eventId, userId);
	const changed = tx(() => {
		const row = requireRow(eventId);
		if (row.started) return false;
		if (!isPlayer(eventId, userId)) throw new EventError('Join the game first.');
		if (gamePlayers(eventId).length < 2) throw new EventError('Wait for at least one more person to join.');
		const meta = JSON.parse(row.meta) as Meta;
		const cards = JSON.parse(row.cards) as Card[];
		const deck = JSON.parse(row.deck) as number[];
		const picks = pickPeople(eventId, cards[deck[0]], null, meta.scored);
		db.prepare(`UPDATE event_activity SET started = 1, picks = ?, updated_at = datetime('now') WHERE event_id = ?`).run(
			JSON.stringify(picks),
			eventId
		);
		return true;
	});
	if (changed) publish(eventId);
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
		`UPDATE event_activity SET position = ?, deck = ?, picks = ?, reveal = ?, next_votes = '[]', updated_at = datetime('now')
		 WHERE event_id = ?`
	).run(next, JSON.stringify(newDeck), JSON.stringify(picks), reveal ? JSON.stringify(reveal) : row.reveal, eventId);
	return true;
}

/** Moves on if the votes reach half the players, otherwise saves them. */
function countVotes(eventId: number, row: Row, votes: number[]) {
	if (votes.length >= votesNeeded(eventId)) return advance(eventId, row, row.position, null);
	db.prepare('UPDATE event_activity SET next_votes = ? WHERE event_id = ?').run(JSON.stringify(votes), eventId);
	return true;
}

function requireRow(eventId: number) {
	const row = loadRow(eventId);
	if (!row) throw new EventError('No game is running.');
	return row;
}

/** A game that has left the lobby, and a viewer who is playing it. */
function requirePlaying(eventId: number, userId: number) {
	const row = requireRow(eventId);
	if (!row.started) throw new EventError('The game hasn’t started yet.');
	requirePlayer(eventId, userId);
	return row;
}

/**
 * Votes for the next card, or to skip the current one (a skipped challenge scores nothing); tapping
 * again takes the vote back. The card moves on once at least half the players have voted. `seen` is
 * the card the person was looking at, so a tap on a card that has already gone is ignored.
 */
export function nextCard(eventId: number, userId: number, seen: number) {
	requireMember(eventId, userId);
	const changed = tx(() => {
		const row = requirePlaying(eventId, userId);
		if (row.position !== seen) return false;
		const votes = JSON.parse(row.next_votes) as number[];
		return countVotes(eventId, row, votes.includes(userId) ? votes.filter((id) => id !== userId) : [...votes, userId]);
	});
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
		const row = requirePlaying(eventId, userId);
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
	const event = requireMember(eventId, userId);
	if (event.host_id !== userId) requirePlayer(eventId, userId);
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

/**
 * Games to show someone across the app: lobbies at nights they're going to that they haven't joined,
 * and games they're playing.
 */
export function gameInvites(userId: number) {
	return (
		db
			.prepare(
				`SELECT a.event_id, e.title, a.meta, a.started,
				   EXISTS (SELECT 1 FROM game_players g WHERE g.event_id = a.event_id AND g.user_id = m.user_id) AS joined,
				   (SELECT COUNT(*) FROM game_players g WHERE g.event_id = a.event_id) AS count
				 FROM event_activity a
				 JOIN events e ON e.id = a.event_id
				 JOIN event_members m ON m.event_id = a.event_id AND m.user_id = ?
				 LEFT JOIN rsvps r ON r.event_id = a.event_id AND r.user_id = m.user_id
				 WHERE joined OR (a.started = 0 AND (r.response = 'yes' OR e.host_id = m.user_id))
				 ORDER BY a.updated_at DESC`
			)
			.all(userId) as { event_id: number; title: string; meta: string; started: number; joined: number; count: number }[]
	).map(({ meta, ...g }) => ({ ...g, name: (JSON.parse(meta) as Meta).name, started: !!g.started, joined: !!g.joined }));
}
