import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import {
	beginGame,
	challengeScores,
	drawCard,
	endGame,
	finishChallenge,
	gameInvites,
	getActivity,
	joinGame,
	leaveGame,
	nextCard,
	openGame
} from './activities.ts';
import { listNotifications } from './notifications.ts';
import { cardsToText, deleteCustomGame, getCustomGame, listGamesForEvent, parseCards, saveCustomGame } from './customGames.ts';
import { fillNames, GAMES, namesNeeded } from '../activities.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@games.test`, name, 'correct-horse-9') as User;

/** Opens a game, has everyone going join it, and starts it: the old one-step start. */
function startGame(eventId: number, userId: number, gameId: string, soft: boolean) {
	openGame(eventId, userId, gameId, soft);
	if (getActivity(eventId, userId)!.started) return;
	for (const p of goingIds(eventId)) joinGame(eventId, p);
	beginGame(eventId, userId);
}

/** Moves past card `seen` by having players vote until half have. */
function skipCard(eventId: number, seen: number) {
	for (const p of gamePlayerIds(eventId)) {
		if (getActivity(eventId, p)!.position !== seen) return;
		nextCard(eventId, p, seen);
	}
}

function gamePlayerIds(eventId: number) {
	return (db.prepare('SELECT user_id FROM game_players WHERE event_id = ? ORDER BY rowid').all(eventId) as { user_id: number }[]).map(
		(r) => r.user_id
	);
}

function goingIds(eventId: number) {
	return (
		db
			.prepare(
				`SELECT m.user_id FROM event_members m JOIN events e ON e.id = m.event_id
				 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
				 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id)`
			)
			.all(eventId) as { user_id: number }[]
	).map((r) => r.user_id);
}

function party(guests = 2) {
	const host = user('Host');
	const people = Array.from({ length: guests }, (_, i) => user(`Guest${i}`));
	const outsider = user('Outsider');
	const id = createEvent(host.id, { title: 'Games night', mode: 'fixed', startsAt: '2099-05-01T20:00' });
	for (const p of people) {
		joinByToken(getEvent(id)!.invite_token, p.id);
		setRsvp(id, p.id, 'yes');
	}
	return { id, host, people, everyone: [host, ...people], outsider };
}

/** Forces the current card to one of our choosing, so tests don't depend on the shuffle. */
function setCard(eventId: number, card: object, picks: number[]) {
	db.prepare('UPDATE event_activity SET cards = ?, deck = ?, position = 0, picks = ? WHERE event_id = ?').run(
		JSON.stringify([card, { text: 'Another card' }]),
		JSON.stringify([0, 1]),
		JSON.stringify(picks),
		eventId
	);
}

describe('names on cards', () => {
	it('finds and fills {1}, {2} and {3}', () => {
		expect(namesNeeded('{1} buys {2} a drink')).toBe(2);
		expect(namesNeeded('Everyone drinks')).toBe(0);
		expect(fillNames('{1} buys {2} a drink', ['Sam', 'Jo'])).toBe('Sam buys Jo a drink');
		expect(fillNames('{1} and {3}', ['Sam'])).toBe('Sam and someone');
	});

	it('names different people from the event on each card', () => {
		const { id, host, everyone } = party(3);
		startGame(id, host.id, 'pub-roulette', false);
		for (let i = 0; i < 10; i++) {
			db.prepare('UPDATE event_activity SET cards = ?, deck = ?, position = 0 WHERE event_id = ?').run(
				JSON.stringify([{ text: 'Warm up' }, { text: '{1}|{2}' }]),
				JSON.stringify([0, 1]),
				id
			);
			skipCard(id, 0);
			const [a, b] = getActivity(id, host.id)!.card.split('|');
			expect(everyone.map((p) => p.name)).toEqual(expect.arrayContaining([a, b]));
			expect(a).not.toBe(b);
		}
	});
});

describe('games', () => {
	it('only lets people on the event start a game', () => {
		const { id, host, outsider } = party();
		expect(() => startGame(id, outsider.id, 'never', false)).toThrow(/not invited/);
		expect(() => startGame(id, host.id, 'darts', false)).toThrow(/Pick a game/);
		startGame(id, host.id, 'rather', true);
		const a = getActivity(id, host.id)!;
		expect(a).toMatchObject({ game: 'rather', name: 'Would you rather', soft: true, position: 0, number: 1, turn: null });
		expect(a.rules).toMatch(/convince/);
	});

	it('moves to the next card once half the players vote, and reshuffles at the end', () => {
		const { id, host, people } = party(4); // 5 players: 3 votes needed
		const [a, b, c, d] = people;
		startGame(id, host.id, 'categories', false);
		nextCard(id, host.id, 0);
		nextCard(id, a.id, 0);
		expect(getActivity(id, b.id)).toMatchObject({ position: 0, votes: { count: 2, needed: 3, mine: false } });
		expect(getActivity(id, a.id)!.votes.mine).toBe(true);
		nextCard(id, a.id, 0); // tapping again takes the vote back
		expect(getActivity(id, a.id)!.votes).toEqual({ count: 1, needed: 3, mine: false });
		nextCard(id, b.id, 0);
		nextCard(id, c.id, 0);
		expect(getActivity(id, d.id)).toMatchObject({ position: 1, votes: { count: 0, needed: 3, mine: false } });
		nextCard(id, d.id, 0); // a late tap on the card that's gone counts for nothing
		expect(getActivity(id, d.id)).toMatchObject({ position: 1, votes: { count: 0 } });

		// With 4 players, 2 votes are enough (half, rounded up).
		leaveGame(id, d.id);
		nextCard(id, host.id, 1);
		expect(getActivity(id, host.id)!.position).toBe(1);
		nextCard(id, b.id, 1);
		expect(getActivity(id, host.id)!.position).toBe(2);

		// Someone leaving can tip the vote over: 1 of 3 isn't half, 1 of 2 is.
		leaveGame(id, c.id);
		nextCard(id, host.id, 2);
		expect(getActivity(id, host.id)!.position).toBe(2);
		leaveGame(id, a.id);
		expect(getActivity(id, host.id)!.position).toBe(3);

		const total = GAMES.categories.cards.length;
		startGame(id, host.id, 'categories', false);
		expect(getActivity(id, host.id)!.votes.count).toBe(0);
		const seen = new Set<string>();
		for (let i = 0; i < total; i++) {
			seen.add(getActivity(id, host.id)!.card);
			if (i < total - 1) skipCard(id, i);
		}
		expect(seen.size).toBe(total); // every card once before any repeats
		skipCard(id, total - 1);
		expect(getActivity(id, host.id)!.number).toBe(1);
	});

	it('scores challenges for whoever was picked, then picks someone else', () => {
		const { id, host } = party();
		startGame(id, host.id, 'challenges', false);
		const first = getActivity(id, host.id)!;
		finishChallenge(id, host.id, 0, 'done');
		const second = getActivity(id, host.id)!;
		expect(second.player!.id).not.toBe(first.player!.id);
		finishChallenge(id, host.id, 1, 'bailed');
		finishChallenge(id, host.id, 1, 'done'); // stale tap: ignored
		const scores = challengeScores(id);
		expect(scores.find((s) => s.id === first.player!.id)).toMatchObject({ points: first.points, done: 1 });
		expect(scores.find((s) => s.id === second.player!.id)).toMatchObject({ points: 0, bailed: 1 });
	});

	it('ends the game for everyone', () => {
		const { id, host } = party();
		startGame(id, host.id, 'rather', false);
		endGame(id, host.id);
		expect(getActivity(id, host.id)).toBeNull();
		expect(() => nextCard(id, host.id, 0)).toThrow(/No game/);
	});
});

describe('ring of fire', () => {
	it('goes round the players in the order they joined, and only whoever’s turn it is can draw', () => {
		const { id, host, people } = party(2);
		const [a, b] = people;
		openGame(id, a.id, 'ring-of-fire', false);
		joinGame(id, host.id);
		joinGame(id, b.id);
		beginGame(id, b.id);

		const start = getActivity(id, host.id)!.turn!;
		expect(start).toMatchObject({ up: { id: a.id }, yours: false, card: null, left: 52, kings: 0 });
		expect(getActivity(id, a.id)!.turn!.yours).toBe(true);
		expect(() => drawCard(id, host.id, 0)).toThrow(/not your turn/);

		drawCard(id, a.id, 0);
		drawCard(id, a.id, 0); // a double tap draws once
		const after = getActivity(id, b.id)!.turn!;
		expect(after).toMatchObject({ up: { id: host.id }, drewIt: { id: a.id }, left: 51 });
		expect(after.card).toEqual({ rank: expect.stringMatching(/^(A|[2-9]|10|J|Q|K)$/), suit: expect.stringMatching(/^[♠♥♦♣]$/), text: expect.any(String) });
		drawCard(id, host.id, 1);
		drawCard(id, b.id, 2);
		expect(getActivity(id, b.id)!.turn!.up!.id).toBe(a.id); // back round to the first player
	});

	it('counts the kings drawn and deals a full deck before reshuffling', () => {
		const { id, host, people } = party(1);
		startGame(id, host.id, 'ring-of-fire', false);
		const order = [host.id, people[0].id];
		const seen = new Set<string>();
		for (let i = 0; i < 52; i++) {
			const up = getActivity(id, host.id)!.turn!.up!.id;
			expect(up).toBe(order[i % 2]);
			drawCard(id, up, i);
			const t = getActivity(id, host.id)!.turn!;
			seen.add(`${t.card!.rank}${t.card!.suit}`);
		}
		const end = getActivity(id, host.id)!.turn!;
		expect(seen.size).toBe(52);
		expect(end).toMatchObject({ left: 0, kings: 4 });
		drawCard(id, end.up!.id, 52);
		expect(getActivity(id, host.id)!.turn).toMatchObject({ left: 51 });
	});

	it('lets half the players skip someone who isn’t taking their turn', () => {
		const { id, host, people } = party(3); // 4 players: 2 votes skip
		startGame(id, host.id, 'ring-of-fire', false);
		const up = getActivity(id, host.id)!.turn!.up!.id;
		const others = [host, ...people].map((p) => p.id).filter((p) => p !== up);
		nextCard(id, others[0], 0);
		expect(getActivity(id, host.id)!.turn!.up!.id).toBe(up);
		nextCard(id, others[1], 0);
		expect(getActivity(id, host.id)!.turn).toMatchObject({ drewIt: { id: up }, left: 51 });
	});
});

describe('game lobby', () => {
	it('opens a lobby, tells everyone going, and only deals cards to people who joined', () => {
		const { id, host, people, outsider } = party(3);
		const [sam, jo, alex] = people;
		openGame(id, sam.id, 'pub-roulette', false);
		const lobby = getActivity(id, host.id)!;
		expect(lobby).toMatchObject({ started: false, joined: false, players: [{ id: sam.id }] });
		expect(listNotifications(host.id)[0].message).toBe(`${sam.name} wants to play Pub roulette at Games night. Join in!`);
		expect(listNotifications(sam.id).some((n) => /wants to play/.test(n.message))).toBe(false);
		expect(listNotifications(outsider.id)).toEqual([]);
		expect(gameInvites(jo.id)).toEqual([expect.objectContaining({ event_id: id, joined: false, started: false, count: 1 })]);

		expect(() => nextCard(id, sam.id, 0)).toThrow(/hasn’t started/);
		expect(() => beginGame(id, sam.id)).toThrow(/one more person/);
		joinGame(id, jo.id);
		expect(() => beginGame(id, alex.id)).toThrow(/Join the game/);
		beginGame(id, jo.id);
		beginGame(id, sam.id); // a second tap on start changes nothing
		expect(getActivity(id, sam.id)!.position).toBe(0);

		for (let i = 0; i < 20; i++) {
			db.prepare('UPDATE event_activity SET cards = ?, deck = ?, position = 0 WHERE event_id = ?').run(
				JSON.stringify([{ text: 'Warm up' }, { text: '{1}|{2}' }]),
				JSON.stringify([0, 1]),
				id
			);
			skipCard(id, 0);
			const named = getActivity(id, sam.id)!.card.split('|');
			expect([sam.name, jo.name]).toEqual(expect.arrayContaining(named));
		}
		expect(() => nextCard(id, alex.id, 1)).toThrow(/Join the game/);
		expect(gameInvites(alex.id)).toEqual([]); // a game already on isn't pushed at people who didn't join
	});

	it('swaps the game in the lobby without losing players, and ends when the last player leaves', () => {
		const { id, people } = party(2);
		const [sam, jo] = people;
		openGame(id, sam.id, 'pub-roulette', false);
		joinGame(id, jo.id);
		openGame(id, jo.id, 'categories', true);
		expect(getActivity(id, sam.id)).toMatchObject({ game: 'categories', soft: true, started: false, players: [{ id: sam.id }, { id: jo.id }] });
		leaveGame(id, sam.id);
		expect(getActivity(id, jo.id)!.players).toEqual([{ id: jo.id, name: jo.name }]);
		leaveGame(id, jo.id);
		expect(getActivity(id, jo.id)).toBeNull();
	});
});

describe('secret cards in custom games', () => {
	function mission() {
		const p = party();
		startGame(p.id, p.host.id, 'challenges', false);
		const [player, other] = p.people;
		setCard(p.id, { text: '{1}: get {2} to say banana', secret: true, cover: '{1}: take a sip.', points: 3 }, [player.id, other.id]);
		return { ...p, player, other };
	}

	it('shows the real mission only to the player and the fake task to everyone else', () => {
		const { id, host, player, other } = mission();
		const mine = getActivity(id, player.id)!;
		expect(mine).toMatchObject({ secret: true, mine: true, card: `${player.name}: get ${other.name} to say banana` });
		expect(mine.cover).toBe(`${player.name}: take a sip.`);
		for (const viewer of [host, other]) {
			const theirs = getActivity(id, viewer.id)!;
			expect(theirs).toMatchObject({ secret: true, mine: false, card: `${player.name}: take a sip.`, cover: null });
			expect(JSON.stringify(theirs)).not.toContain('banana');
		}
	});

	it('lets only others catch the player, and reveals the mission to everyone after', () => {
		const { id, host, player } = mission();
		expect(() => finishChallenge(id, player.id, 0, 'caught')).toThrow(/catch yourself/);
		expect(() => finishChallenge(id, host.id, 0, 'done')).toThrow(/Only the player/);
		finishChallenge(id, host.id, 0, 'caught');
		const after = getActivity(id, host.id)!;
		expect(after.reveal).toMatchObject({ name: player.name, outcome: 'caught' });
		expect(after.reveal!.mission).toContain('banana');
		expect(challengeScores(id).find((s) => s.id === player.id)).toMatchObject({ points: 0, bailed: 1 });
	});

	it('scores the real mission when the player pulls it off', () => {
		const { id, player } = mission();
		finishChallenge(id, player.id, 0, 'done');
		expect(challengeScores(id).find((s) => s.id === player.id)).toMatchObject({ points: 3, done: 1 });
		const row = db.prepare('SELECT challenge FROM challenge_results WHERE event_id = ?').get(id) as { challenge: string };
		expect(row.challenge).toContain('banana');
	});
});

describe('custom games', () => {
	const cards = '{1}, finish your drink.\n\n{1} buys {2} a shot\nsecret: get {2} to stand up | {1}: say cheers\nsecret: hum a tune';

	it('reads one card per line, with secret missions and fake tasks', () => {
		expect(parseCards(cards, true)).toEqual([
			{ text: '{1}, finish your drink.', points: 1 },
			{ text: '{1} buys {2} a shot', points: 1 },
			{ text: '{1}: get {2} to stand up', secret: true, cover: '{1}: say cheers', points: 2 },
			{ text: '{1}: hum a tune', secret: true, cover: '{1}: take a sip of your drink.', points: 2 }
		]);
		expect(parseCards(cardsToText(parseCards(cards, false)), false)).toEqual(parseCards(cards, false));
	});

	it('checks the game before saving and only lets the owner change it', () => {
		const owner = user('Maker');
		const other = user('Nosy');
		const base = { name: 'Pres power hour', emoji: '🍻', setting: 'gaff', rules: '', scored: false, cards };
		expect(() => saveCustomGame(owner.id, { ...base, name: ' ' })).toThrow(/name/);
		expect(() => saveCustomGame(owner.id, { ...base, setting: 'moon' })).toThrow(/where/);
		expect(() => saveCustomGame(owner.id, { ...base, cards: 'one\ntwo' })).toThrow(/at least 3/);
		expect(() => saveCustomGame(owner.id, { ...base, cards: `${'x'.repeat(201)}\nb\nc` })).toThrow(/under/);
		const gameId = saveCustomGame(owner.id, base);
		expect(() => saveCustomGame(other.id, base, gameId)).toThrow(/not found/);
		expect(() => deleteCustomGame(other.id, gameId)).toThrow(/not found/);
		saveCustomGame(owner.id, { ...base, name: 'Renamed' }, gameId);
		expect(getCustomGame(gameId)!.name).toBe('Renamed');
	});

	it('can be played at events its owner is on, and keeps going if the owner edits it', () => {
		const { id, host, people } = party();
		const lonely = createEvent(user('Elsewhere').id, { title: 'Other', mode: 'fixed', startsAt: '2099-05-01T20:00' });
		const gameId = saveCustomGame(people[0].id, { name: 'Our game', emoji: '🔥', setting: 'pub', rules: 'Do it.', scored: true, cards });
		expect(listGamesForEvent(id).map((g) => g.id)).toContain(gameId);
		expect(listGamesForEvent(lonely).map((g) => g.id)).not.toContain(gameId);
		expect(() => startGame(lonely, getEvent(lonely)!.host_id, `custom:${gameId}`, false)).toThrow(/Pick a game/);

		startGame(id, host.id, `custom:${gameId}`, false);
		expect(getActivity(id, host.id)).toMatchObject({ name: 'Our game', emoji: '🔥', scored: true, custom: true, total: 4 });
		deleteCustomGame(people[0].id, gameId);
		skipCard(id, 0);
		expect(getActivity(id, host.id)!.name).toBe('Our game');
	});
});
