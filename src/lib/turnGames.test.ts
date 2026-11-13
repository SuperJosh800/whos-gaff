import { describe, expect, it } from 'vitest';
import { newPlay, playMove, PLAYING_CARDS, settle, skip, viewPlay, type Play } from './turnGames.ts';

const ann = { id: 1, name: 'Ann' };
const bo = { id: 2, name: 'Bo' };
const cy = { id: 3, name: 'Cy' };
const di = { id: 4, name: 'Di' };
const players = [ann, bo, cy];
/** The deck index of a card such as '7♥'. */
const c = (name: string) => PLAYING_CARDS.findIndex((p) => `${p.rank}${p.suit}` === name);
/** A shuffle that deals these cards in order (the rest after them). */
const stacked = (...names: string[]) => (length: number) => {
	const top = names.map(c);
	return [...top, ...Array.from({ length }, (_, i) => i).filter((i) => !top.includes(i))];
};
const noShuffle = () => {
	throw new Error('should not reshuffle');
};
const view = (p: Play, viewer = 1, who = players, questions: string[] = []) => viewPlay(p, who, viewer, questions);
const tableCard = (p: Play) => {
	const v = view(p);
	return v.kind === 'hilo' ? v.table : null;
};

describe('Higher or lower', () => {
	const start = (...cards: string[]) => newPlay('hilo', 52, stacked(...cards), players);

	it('starts with a card up, lets you keep going while right, and charges the whole run when wrong', () => {
		let p = start('7♥', '9♠', 'K♦', '2♣');
		expect(tableCard(p)).toEqual({ rank: '7', suit: '♥' });
		expect(() => playMove(p, players, 2, { type: 'guess', guess: 'higher' }, noShuffle)).toThrow('not your turn');
		expect(() => playMove(p, players, 1, { type: 'pass' }, noShuffle)).toThrow('Get one right');
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // 9
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // K
		expect(p).toMatchObject({ up: 1, streak: 2 });
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // 2: wrong
		expect(p).toMatchObject({ up: 2, streak: 0, last: { sips: 3, right: false } });
		expect(view(p, 2)).toMatchObject({ yours: true, table: { rank: '2', suit: '♣' } });
	});

	it('counts the same value as wrong, aces as high, and lets you pass on a run for free', () => {
		let p = start('Q♠', 'A♥', 'A♣', '5♦');
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // A beats Q
		p = playMove(p, players, 1, { type: 'pass' }, noShuffle);
		expect(p).toMatchObject({ up: 2, streak: 0, last: { sips: 0 } });
		p = playMove(p, players, 2, { type: 'guess', guess: 'lower' }, noShuffle); // A then A: same, wrong
		expect(p).toMatchObject({ up: 3, last: { sips: 1, right: false } });
		p = playMove(p, players, 3, { type: 'guess', guess: 'lower' }, noShuffle); // 5 is lower than A
		expect(p).toMatchObject({ up: 3, streak: 1 });
	});

	it('reshuffles when the deck runs out, keeping the card on the table out of the next draw', () => {
		const full = start('5♠');
		// The last card of the deck is on the table, and the new deck would deal it first.
		let p: Play = { ...full, deck: [...full.deck.slice(1), full.deck[0]], at: 52 };
		expect(tableCard(p)).toEqual({ rank: '5', suit: '♠' });
		let shuffled = 0;
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, (n) => (shuffled++, stacked('5♠', '9♥')(n)));
		expect(shuffled).toBe(1);
		expect(p).toMatchObject({ at: 2, streak: 1 });
		expect(tableCard(p)).toEqual({ rank: '9', suit: '♥' });
		// Also when the face-up card would come up later in the new deck, not first.
		const nine = c('9♥');
		p = { ...p, deck: [...p.deck.filter((x) => x !== nine), nine], at: 52 };
		expect(tableCard(p)).toEqual({ rank: '9', suit: '♥' });
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, (n) => stacked('J♠', '9♥', '3♣')(n));
		expect(p.deck[0]).toBe(nine);
		expect(p.deck.filter((x) => x === nine)).toHaveLength(1);
		expect(tableCard(p)).toEqual({ rank: 'J', suit: '♠' });
	});

	it('keeps the turn with the same person when someone joins, and starts the next person fresh when the player up leaves', () => {
		let p = start('5♥', '9♠', 'K♦');
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle);
		p = playMove(p, players, 1, { type: 'pass' }, noShuffle); // Bo is up
		p = playMove(p, players, 2, { type: 'guess', guess: 'higher' }, noShuffle); // Bo has a run of 1
		const joined = [di, ...players]; // Di's seat comes before everyone
		p = settle(p, joined, noShuffle);
		expect(p).toMatchObject({ up: 2, streak: 1 });
		expect(() => playMove(p, joined, 4, { type: 'pass' }, noShuffle)).toThrow('not your turn');
		// Bo leaves mid-run: the next person along goes, without Bo's run.
		const left = [di, ann, cy];
		p = settle(p, left, noShuffle);
		expect(p).toMatchObject({ up: 3, streak: 0 });
		expect(() => playMove(p, left, 3, { type: 'pass' }, noShuffle)).toThrow('Get one right');
	});
});

describe('Ride the bus', () => {
	const start = (...cards: string[]) => newPlay('bus', 52, stacked(...cards), players);
	const guess = (p: Play, id: number, g: string, shuffle = noShuffle as (n: number) => number[]) => playMove(p, players, id, { type: 'guess', guess: g }, shuffle);

	it('needs all four right to get off, and a miss costs as many sips as the step', () => {
		let p = start('5♥', '9♠', '7♦', '7♣', 'J♣', '3♥');
		expect(view(p)).toMatchObject({ step: 1, prompt: 'Red or black?' });
		p = guess(p, 1, 'red'); // 5♥ red
		p = guess(p, 1, 'higher'); // 9 > 5
		expect(() => guess(p, 1, 'higher')).toThrow('Inside or outside');
		p = guess(p, 1, 'inside'); // 7 between 5 and 9
		p = guess(p, 1, '♣'); // 7♣
		expect(p).toMatchObject({ up: 2, hand: [], last: { right: true, sips: 0 } });
		expect(p.last && 'text' in p.last && p.last.text).toMatch(/Off the bus/);
		p = guess(p, 2, 'black'); // J♣ black
		p = guess(p, 2, 'higher'); // 3 isn't higher than J: step 2 wrong
		expect(p).toMatchObject({ up: 3, hand: [], last: { right: false, sips: 2 } });
	});

	it('counts matching either card as wrong for inside or outside', () => {
		let p = start('4♥', '10♠', '10♦');
		p = guess(p, 1, 'red');
		p = guess(p, 1, 'higher');
		p = guess(p, 1, 'outside');
		expect(p).toMatchObject({ up: 2, last: { right: false, sips: 3 } });
	});

	it('never redeals a card already in your row when the deck reshuffles', () => {
		let p = start('7♦', '9♠');
		p = guess(p, 1, 'red');
		p = guess(p, 1, 'higher');
		p = { ...p, at: 52 };
		// The new deck would deal 7♦ next; it's in the row, so 2♣ comes instead.
		p = guess(p, 1, 'outside', stacked('7♦', '9♠', '2♣'));
		expect(p).toMatchObject({ hand: [c('7♦'), c('9♠'), c('2♣')], last: { right: true } });
	});

	it('clears the row when the player is skipped', () => {
		let p = start('7♦', '9♠');
		p = guess(p, 1, 'red');
		p = skip(p, players, noShuffle);
		expect(p).toMatchObject({ up: 2, hand: [] });
	});
});

describe('Paranoia', () => {
	const questions = ['Who snores?', 'Who cries at films?', 'Who is late?'];
	const start = (who = players) => newPlay('paranoia', 3, () => [1, 0, 2], who);
	const question = (p: Play, viewer: number, who = players) => {
		const v = view(p, viewer, who, questions);
		return v.kind === 'paranoia' ? v.question : undefined;
	};
	const last = (p: Play, who = players) => {
		const v = view(p, 1, who, questions);
		return v.kind === 'paranoia' ? v.last : undefined;
	};

	it('shows the question only to the asker, and to the person named only if they drink', () => {
		let p = start();
		expect(question(p, 1)).toBe('Who cries at films?');
		expect(question(p, 2)).toBeNull();
		expect(() => playMove(p, players, 1, { type: 'answer', who: 1 }, noShuffle)).toThrow('someone else');
		expect(() => playMove(p, players, 1, { type: 'answer', who: 9 }, noShuffle)).toThrow('someone else');
		p = playMove(p, players, 1, { type: 'answer', who: 3 }, noShuffle);
		expect(view(p, 3, players, questions)).toMatchObject({ yours: true, question: null, answer: { name: 'Cy' } });
		expect(question(p, 2)).toBeNull();
		expect(() => playMove(p, players, 1, { type: 'reveal', drink: true }, noShuffle)).toThrow('not you they named');
		p = playMove(p, players, 3, { type: 'reveal', drink: true }, noShuffle);
		expect(last(p)).toEqual({ asker: 'Ann', answer: 'Cy', question: 'Who cries at films?' });
		expect(question(p, 2)).toBe('Who snores?'); // Bo asks next, with the next question

		p = playMove(p, players, 2, { type: 'answer', who: 1 }, noShuffle);
		p = playMove(p, players, 1, { type: 'reveal', drink: false }, noShuffle);
		expect(last(p)).toEqual({ asker: 'Bo', answer: 'Ann', question: null });
	});

	it('reshuffles once every question has been asked, so a revealed one isn’t known when it comes round', () => {
		let p = start();
		for (const [asker, named] of [[1, 2], [2, 3], [3, 1]]) {
			p = playMove(p, players, asker, { type: 'answer', who: named }, noShuffle);
			p = playMove(p, players, named, { type: 'reveal', drink: true }, () => [2, 1, 0]);
		}
		expect(p).toMatchObject({ deck: [2, 1, 0], at: 0, up: 1 });
		expect(question(p, 1)).toBe('Who is late?');
	});

	it('when skipped, moves on without revealing the question', () => {
		let p = start();
		p = skip(p, players, noShuffle);
		expect(view(p, 2, players, questions)).toMatchObject({ yours: true, question: 'Who snores?', last: null });
		p = playMove(p, players, 2, { type: 'answer', who: 3 }, noShuffle);
		p = skip(p, players, noShuffle);
		expect(last(p)).toEqual({ asker: 'Bo', answer: 'Cy', question: null });
		expect(view(p, 3, players, questions)).toMatchObject({ yours: true, question: 'Who is late?' });
	});

	it('never shows a question to anyone but its asker when people join or leave', () => {
		let p = start();
		const seen = question(p, 1)!;
		// Someone joins in front: Ann still asks the same question, and only she sees it.
		const joined = [di, ...players];
		p = settle(p, joined, noShuffle);
		expect(question(p, 1, joined)).toBe(seen);
		for (const id of [2, 3, 4]) expect(question(p, id, joined)).toBeNull();
		// Ann names Cy, then leaves: Bo asks next with a new question, and Ann's is never shown.
		p = playMove(p, joined, 1, { type: 'answer', who: 3 }, noShuffle);
		const left = [di, bo, cy];
		p = settle(p, left, noShuffle);
		expect(question(p, 2, left)).not.toBe(seen);
		expect(question(p, 2, left)).toBe('Who snores?');
		for (const id of [3, 4]) expect(question(p, id, left)).toBeNull();
		expect(last(p, left)).toBeNull();
	});

	it('moves on when the person named leaves, as if they didn’t want to know', () => {
		let p = start([ann, bo, cy, di]);
		p = playMove(p, [ann, bo, cy, di], 1, { type: 'answer', who: 4 }, noShuffle);
		p = settle(p, players, noShuffle);
		expect(p).toMatchObject({ up: 2, answer: null });
		expect(last(p)).toEqual({ asker: 'Ann', answer: 'Someone', question: null });
		expect(question(p, 2)).toBe('Who snores?');
	});

	it('says when there’s nobody else to name', () => {
		const p = start([ann]);
		expect(view(p, 1, [ann], questions)).toMatchObject({ alone: true, yours: true });
	});
});
