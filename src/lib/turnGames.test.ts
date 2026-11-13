import { describe, expect, it } from 'vitest';
import { newPlay, playMove, PLAYING_CARDS, skip, viewPlay, type Play } from './turnGames.ts';

const ann = { id: 1, name: 'Ann' };
const bo = { id: 2, name: 'Bo' };
const cy = { id: 3, name: 'Cy' };
const players = [ann, bo, cy];
/** The deck index of a card such as '7♥'. */
const c = (name: string) => PLAYING_CARDS.findIndex((p) => `${p.rank}${p.suit}` === name);
/** A shuffle that deals these cards in order (the rest after them). */
const stacked = (...names: string[]) => (length: number) => {
	const top = names.map(c);
	return [...top, ...Array.from({ length }, (_, i) => i).filter((i) => !top.includes(i))];
};
/** Higher or lower's face-up card. */
const tableCard = (p: Play) => {
	const v = viewPlay(p, players, 1, []);
	return v.kind === 'hilo' ? v.table : null;
};
const noShuffle = () => {
	throw new Error('should not reshuffle');
};

describe('Higher or lower', () => {
	const start = (...cards: string[]) => newPlay('hilo', 52, stacked(...cards));

	it('starts with a card up, lets you keep going while right, and charges the whole run when wrong', () => {
		let p = start('7♥', '9♠', 'K♦', '2♣');
		expect(tableCard(p)).toEqual({ rank: '7', suit: '♥' });
		expect(() => playMove(p, players, 2, { type: 'guess', guess: 'higher' }, noShuffle)).toThrow('not your turn');
		expect(() => playMove(p, players, 1, { type: 'pass' }, noShuffle)).toThrow('Get one right');
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // 9
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // K
		expect(p).toMatchObject({ turn: 0, streak: 2 });
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // 2: wrong
		expect(p).toMatchObject({ turn: 1, streak: 0, last: { sips: 3, right: false } });
		expect(viewPlay(p, players, 2, [])).toMatchObject({ yours: true, table: { rank: '2', suit: '♣' } });
	});

	it('counts the same value as wrong, aces as high, and lets you pass on a run for free', () => {
		let p = start('Q♠', 'A♥', 'A♣', '5♦');
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, noShuffle); // A beats Q
		p = playMove(p, players, 1, { type: 'pass' }, noShuffle);
		expect(p).toMatchObject({ turn: 1, streak: 0, last: { sips: 0 } });
		p = playMove(p, players, 2, { type: 'guess', guess: 'lower' }, noShuffle); // A then A: same, wrong
		expect(p).toMatchObject({ turn: 2, last: { sips: 1, right: false } });
		p = playMove(p, players, 3, { type: 'guess', guess: 'lower' }, noShuffle); // 5 is lower than A
		expect(p).toMatchObject({ turn: 2, streak: 1 });
	});

	it('reshuffles when the deck runs out, keeping the card on the table out of the next draw', () => {
		const full = newPlay('hilo', 52, stacked('5♠'));
		// The last card of the deck is on the table; the reshuffle would deal it first.
		let p: Play = { ...full, deck: [...full.deck.slice(1), full.deck[0]], at: 52 };
		expect(tableCard(p)).toEqual({ rank: '5', suit: '♠' });
		let shuffled = 0;
		p = playMove(p, players, 1, { type: 'guess', guess: 'higher' }, (n) => (shuffled++, stacked('5♠', '9♥')(n)));
		expect(shuffled).toBe(1);
		expect(p).toMatchObject({ at: 2, streak: 1 });
		expect(tableCard(p)).toEqual({ rank: '9', suit: '♥' });
	});
});

describe('Ride the bus', () => {
	const start = (...cards: string[]) => newPlay('bus', 52, stacked(...cards));
	const guess = (p: Play, id: number, g: string) => playMove(p, players, id, { type: 'guess', guess: g }, noShuffle);

	it('needs all four right to get off, and a miss costs as many sips as the step', () => {
		let p = start('5♥', '9♠', '7♦', '7♣', 'J♣', '3♥');
		expect(viewPlay(p, players, 1, [])).toMatchObject({ step: 1, prompt: 'Red or black?' });
		p = guess(p, 1, 'red'); // 5♥ red
		p = guess(p, 1, 'higher'); // 9 > 5
		expect(() => guess(p, 1, 'higher')).toThrow('Inside or outside');
		p = guess(p, 1, 'inside'); // 7 between 5 and 9
		p = guess(p, 1, '♣'); // 7♣
		expect(p).toMatchObject({ turn: 1, hand: [], last: { right: true, sips: 0 } });
		expect(p.last && 'text' in p.last && p.last.text).toMatch(/Off the bus/);
		p = guess(p, 2, 'black'); // J♣ black
		p = guess(p, 2, 'higher'); // 3 isn't higher than J: step 2 wrong
		expect(p).toMatchObject({ turn: 2, hand: [], last: { right: false, sips: 2 } });
	});

	it('counts matching either card as wrong for inside or outside', () => {
		let p = start('4♥', '10♠', '10♦');
		p = guess(p, 1, 'red');
		p = guess(p, 1, 'higher');
		p = guess(p, 1, 'outside');
		expect(p).toMatchObject({ turn: 1, last: { right: false, sips: 3 } });
	});
});

describe('Paranoia', () => {
	const questions = ['Who snores?', 'Who cries at films?', 'Who is late?'];
	const start = () => newPlay('paranoia', 3, () => [1, 0, 2]);
	const questionFor = (p: Play, viewer: number) => {
		const v = viewPlay(p, players, viewer, questions);
		return v.kind === 'paranoia' ? v.question : undefined;
	};

	it('shows the question only to the asker, and to the person named only if they drink', () => {
		let p = start();
		expect(questionFor(p, 1)).toBe('Who cries at films?');
		expect(questionFor(p, 2)).toBeNull();
		expect(() => playMove(p, players, 1, { type: 'answer', who: 1 }, noShuffle)).toThrow('someone else');
		expect(() => playMove(p, players, 1, { type: 'answer', who: 9 }, noShuffle)).toThrow('someone else');
		p = playMove(p, players, 1, { type: 'answer', who: 3 }, noShuffle);
		expect(viewPlay(p, players, 3, questions)).toMatchObject({ yours: true, question: null, answer: { name: 'Cy' } });
		expect(viewPlay(p, players, 2, questions)).toMatchObject({ yours: false, question: null });
		expect(() => playMove(p, players, 1, { type: 'reveal', drink: true }, noShuffle)).toThrow('not you they named');
		p = playMove(p, players, 3, { type: 'reveal', drink: true }, noShuffle);
		expect(viewPlay(p, players, 2, questions).last).toEqual({ asker: 'Ann', answer: 'Cy', question: 'Who cries at films?' });
		// Bo asks next, with the next question.
		expect(viewPlay(p, players, 2, questions)).toMatchObject({ yours: true, question: 'Who snores?' });

		p = playMove(p, players, 2, { type: 'answer', who: 1 }, noShuffle);
		p = playMove(p, players, 1, { type: 'reveal', drink: false }, noShuffle);
		expect(viewPlay(p, players, 3, questions).last).toEqual({ asker: 'Bo', answer: 'Ann', question: null });
	});

	it('when skipped, moves on without revealing the question', () => {
		let p = start();
		p = skip(p, players, noShuffle);
		expect(viewPlay(p, players, 2, questions)).toMatchObject({ yours: true, question: 'Who snores?', last: null });
		p = playMove(p, players, 2, { type: 'answer', who: 3 }, noShuffle);
		p = skip(p, players, noShuffle);
		expect(viewPlay(p, players, 1, questions).last).toEqual({ asker: 'Bo', answer: 'Cy', question: null });
		expect(viewPlay(p, players, 3, questions)).toMatchObject({ yours: true, question: 'Who is late?' });
	});
});
