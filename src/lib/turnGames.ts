// Turn-based games with their own moves (Games tab): Higher or lower, Ride the bus and Paranoia.
// Each takes a state (`Play`), the players in turn order and a move, and returns the next state.
// The server stores the state; `viewPlay` turns it into what one person may see.

export type Kind = 'hilo' | 'bus' | 'paranoia';
export const KINDS: Kind[] = ['hilo', 'bus', 'paranoia'];

export type PlayingCard = { rank: string; suit: string };
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const PLAYING_CARDS: PlayingCard[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
/** Aces are high. */
export const value = (c: PlayingCard) => RANKS.indexOf(c.rank) + 2;
export const isRed = (c: PlayingCard) => c.suit === '♥' || c.suit === '♦';

type Result = { by: number; text: string; sips: number; right: boolean };

export type Play =
	| { kind: 'hilo'; turn: number; deck: number[]; at: number; streak: number; last: Result | null }
	| { kind: 'bus'; turn: number; deck: number[]; at: number; hand: number[]; last: Result | null }
	| { kind: 'paranoia'; turn: number; deck: number[]; at: number; answer: number | null; last: { asker: number; answer: number; question: number | null } | null };

export type Move =
	| { type: 'guess'; guess: string }
	| { type: 'pass' }
	| { type: 'answer'; who: number }
	| { type: 'reveal'; drink: boolean };

export class MoveError extends Error {}

type Person = { id: number; name: string };
type Shuffle = (length: number) => number[];

export function newPlay(kind: Kind, decks: number, shuffle: Shuffle): Play {
	const deck = shuffle(decks);
	// Higher or lower starts with a card face up.
	if (kind === 'hilo') return { kind, turn: 0, deck, at: 1, streak: 0, last: null };
	if (kind === 'bus') return { kind, turn: 0, deck, at: 0, hand: [], last: null };
	return { kind, turn: 0, deck, at: 0, answer: null, last: null };
}

/** Whoever the game is waiting on: the player whose turn it is, or in Paranoia the person named. */
export function waitingOn(play: Play, players: Person[]) {
	if (!players.length) return null;
	const up = players[play.turn % players.length];
	if (play.kind === 'paranoia' && play.answer !== null) return players.find((p) => p.id === play.answer) ?? up;
	return up;
}

/**
 * The next card off the deck. When it runs out the deck is reshuffled; `keep` (a card still on the
 * table) is moved to the front of the new deck so it can't be dealt again straight away.
 */
function draw(play: { deck: number[]; at: number }, shuffle: Shuffle, keep: number | null = null) {
	let { deck, at } = play;
	if (at >= deck.length) {
		deck = shuffle(deck.length);
		at = 0;
		if (keep !== null) {
			deck = [keep, ...deck.filter((i) => i !== keep)];
			at = 1;
		}
	}
	return { card: deck[at], deck, at: at + 1 };
}

const BUS_STEPS = [
	{ prompt: 'Red or black?', options: ['red', 'black'] },
	{ prompt: 'Higher or lower than your first card?', options: ['higher', 'lower'] },
	{ prompt: 'Inside or outside your first two cards?', options: ['inside', 'outside'] },
	{ prompt: 'Which suit?', options: SUITS }
];

/** Plays a move for `userId`, or throws a MoveError explaining why they can't. */
export function playMove(play: Play, players: Person[], userId: number, move: Move, shuffle: Shuffle): Play {
	const up = waitingOn(play, players);
	if (!up || up.id !== userId) throw new MoveError(play.kind === 'paranoia' && play.answer !== null ? 'It’s not you they named.' : 'It’s not your turn.');
	const name = up.name;

	if (play.kind === 'hilo') {
		// The card on the table is the last one drawn.
		if (move.type === 'pass') {
			if (!play.streak) throw new MoveError('Get one right before you pass it on.');
			return { ...play, turn: play.turn + 1, streak: 0, last: { by: userId, text: `${name} passed it on after ${play.streak} right`, sips: 0, right: true } };
		}
		if (move.type !== 'guess' || !['higher', 'lower'].includes(move.guess)) throw new MoveError('Guess higher or lower.');
		const next = draw(play, shuffle, play.deck[play.at - 1]);
		const [from, to] = [PLAYING_CARDS[play.deck[play.at - 1]], PLAYING_CARDS[next.card]];
		const right = move.guess === 'higher' ? value(to) > value(from) : value(to) < value(from);
		const said = `${name} said ${move.guess} than ${from.rank}${from.suit}: ${to.rank}${to.suit}`;
		if (right) return { ...play, deck: next.deck, at: next.at, streak: play.streak + 1, last: { by: userId, text: said, sips: 0, right } };
		// Wrong (a tie counts as wrong): a sip for every card in the run, and the turn passes.
		const sips = play.streak + 1;
		return { ...play, deck: next.deck, at: next.at, turn: play.turn + 1, streak: 0, last: { by: userId, text: said, sips, right } };
	}

	if (play.kind === 'bus') {
		const step = play.hand.length;
		if (move.type !== 'guess' || !BUS_STEPS[step].options.includes(move.guess)) throw new MoveError(BUS_STEPS[step].prompt);
		const next = draw(play, shuffle);
		const card = PLAYING_CARDS[next.card];
		const hand = play.hand.map((i) => PLAYING_CARDS[i]);
		let right: boolean;
		if (step === 0) right = (move.guess === 'red') === isRed(card);
		else if (step === 1) right = move.guess === 'higher' ? value(card) > value(hand[0]) : value(card) < value(hand[0]);
		else if (step === 2) {
			const [lo, hi] = [Math.min(value(hand[0]), value(hand[1])), Math.max(value(hand[0]), value(hand[1]))];
			// Matching either card counts as wrong.
			right = move.guess === 'inside' ? value(card) > lo && value(card) < hi : value(card) < lo || value(card) > hi;
		} else right = move.guess === card.suit;
		const said = `${name} said ${move.guess}: ${card.rank}${card.suit}`;
		if (!right) {
			return { ...play, deck: next.deck, at: next.at, turn: play.turn + 1, hand: [], last: { by: userId, text: said, sips: step + 1, right } };
		}
		if (step === 3) {
			return { ...play, deck: next.deck, at: next.at, turn: play.turn + 1, hand: [], last: { by: userId, text: `${said}. Off the bus! Hand out 4 sips`, sips: 0, right } };
		}
		return { ...play, deck: next.deck, at: next.at, hand: [...play.hand, next.card], last: { by: userId, text: said, sips: 0, right } };
	}

	// Paranoia: the asker answers their secret question with a name; the person named can drink to see it.
	if (play.answer === null) {
		if (move.type !== 'answer' || move.who === userId || !players.some((p) => p.id === move.who)) throw new MoveError('Pick someone else playing.');
		return { ...play, answer: move.who };
	}
	if (move.type !== 'reveal') throw new MoveError('Drink to find out, or leave it.');
	const asker = players[play.turn % players.length];
	return {
		...play,
		turn: play.turn + 1,
		at: play.at + 1,
		answer: null,
		last: { asker: asker.id, answer: play.answer, question: move.drink ? play.deck[play.at % play.deck.length] : null }
	};
}

/**
 * Moves the game on without the person it's waiting for (the group voted to skip them): their turn
 * passes, or in Paranoia a named person who doesn't answer has chosen not to know.
 */
export function skip(play: Play, players: Person[], shuffle: Shuffle): Play {
	if (play.kind === 'paranoia') {
		if (play.answer !== null) return playMove(play, players, play.answer, { type: 'reveal', drink: false }, shuffle);
		return { ...play, turn: play.turn + 1, at: play.at + 1 };
	}
	if (play.kind === 'hilo') return { ...play, turn: play.turn + 1, streak: 0 };
	return { ...play, turn: play.turn + 1, hand: [] };
}

/** What one person sees. Paranoia's question only reaches the asker until the person named drinks. */
export function viewPlay(play: Play, players: Person[], viewerId: number, questions: string[]) {
	const up = waitingOn(play, players);
	const name = (id: number) => players.find((p) => p.id === id)?.name ?? 'Someone';
	const base = { up, yours: !!up && up.id === viewerId };
	if (play.kind === 'hilo') {
		return {
			...base,
			kind: play.kind,
			table: PLAYING_CARDS[play.deck[play.at - 1]],
			streak: play.streak,
			left: play.deck.length - play.at,
			last: play.last
		};
	}
	if (play.kind === 'bus') {
		const step = play.hand.length;
		return { ...base, kind: play.kind, hand: play.hand.map((i) => PLAYING_CARDS[i]), step: step + 1, prompt: BUS_STEPS[step].prompt, options: BUS_STEPS[step].options, last: play.last };
	}
	const asker = players.length ? players[play.turn % players.length] : null;
	const question = questions[play.deck[play.at % play.deck.length]];
	return {
		...base,
		kind: play.kind,
		asker,
		/** The current question, only for whoever's asking. */
		question: asker && asker.id === viewerId ? question : null,
		answer: play.answer !== null ? { id: play.answer, name: name(play.answer) } : null,
		last: play.last
			? {
					asker: name(play.last.asker),
					answer: name(play.last.answer),
					question: play.last.question === null ? null : questions[play.last.question]
				}
			: null
	};
}

export type PlayView = ReturnType<typeof viewPlay>;
