import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { challengeScores, endGame, finishChallenge, getActivity, nextCard, startGame } from './activities.ts';
import { GAMES } from '../activities.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@games.test`, name, 'correct-horse-9') as User;

function party() {
	const host = user('Host');
	const guest = user('Guest');
	const outsider = user('Outsider');
	const id = createEvent(host.id, { title: 'Games night', mode: 'fixed', startsAt: '2099-05-01T20:00' });
	joinByToken(getEvent(id)!.invite_token, guest.id);
	setRsvp(id, guest.id, 'yes');
	return { id, host, guest, outsider };
}

describe('games', () => {
	it('only lets people on the event start a game', () => {
		const { id, host, outsider } = party();
		expect(() => startGame(id, outsider.id, 'never', false)).toThrow(/not invited/);
		expect(() => startGame(id, host.id, 'darts', false)).toThrow(/Pick a game/);
		startGame(id, host.id, 'never', true);
		const a = getActivity(id)!;
		expect(a).toMatchObject({ game: 'never', soft: true, position: 0, number: 1, total: GAMES.never.cards.length });
		expect(GAMES.never.cards).toContain(a.card);
	});

	it('moves on once when two people tap next on the same card, and reshuffles at the end', () => {
		const { id, host, guest } = party();
		startGame(id, host.id, 'categories', false);
		nextCard(id, host.id, 0);
		nextCard(id, guest.id, 0);
		expect(getActivity(id)!.position).toBe(1);
		const total = GAMES.categories.cards.length;
		startGame(id, host.id, 'categories', false);
		const seen = new Set<string>();
		for (let i = 0; i < total; i++) {
			seen.add(getActivity(id)!.card);
			if (i < total - 1) nextCard(id, host.id, i);
		}
		// Every card comes up once before any repeats.
		expect(seen.size).toBe(total);
		nextCard(id, host.id, total - 1);
		expect(getActivity(id)!.number).toBe(1);
	});

	it('scores challenges for whoever was picked, then picks someone else', () => {
		const { id, host, guest } = party();
		startGame(id, guest.id, 'challenges', false);
		const first = getActivity(id)!;
		expect([host.id, guest.id]).toContain(first.target!.id);
		finishChallenge(id, host.id, 0, true);
		const second = getActivity(id)!;
		expect(second.target!.id).not.toBe(first.target!.id);
		finishChallenge(id, host.id, 1, false);
		finishChallenge(id, host.id, 1, true); // stale tap: ignored
		const scores = challengeScores(id);
		expect(scores.find((s) => s.id === first.target!.id)).toMatchObject({ points: first.points, done: 1, bailed: 0 });
		expect(scores.find((s) => s.id === second.target!.id)).toMatchObject({ points: 0, done: 0, bailed: 1 });
	});

	it('ends the game for everyone', () => {
		const { id, host } = party();
		startGame(id, host.id, 'rather', false);
		endGame(id, host.id);
		expect(getActivity(id)).toBeNull();
		expect(() => nextCard(id, host.id, 0)).toThrow(/No game/);
	});
});
