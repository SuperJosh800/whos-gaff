// Turn-based games with their own moves (Games tab): Higher or lower, Ride the bus and Paranoia.
// Each takes a state (`Play`), the players in turn order and a move, and returns the next state.
// The server stores the state; `viewPlay` turns it into what one person may see.
//
// Whose turn it is is stored as a person (`up`), not a seat number, so people joining or leaving
// never hand someone else's turn, cards or secret question to another player. Call `settle` whenever
// the players change.

export type Kind = 'hilo' | 'bus' | 'paranoia';

export type PlayingCard = { rank: string; suit: string };
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const PLAYING_CARDS: PlayingCard[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
/** Aces are high. */
export const value = (c: PlayingCard) => RANKS.indexOf(c.rank) + 2;
export const isRed = (c: PlayingCard) => c.suit === '♥' || c.suit === '♦';

type Result = { by: number; text: string; sips: number; right: boolean };
/** `up` is whose turn it is; `seat` is where they sat, so if they leave the next person along goes. */
type Turn = { up: number | null; seat: number; deck: number[]; at: number };

export type Play =
	| (Turn & { kind: 'hilo'; streak: number; last: Result | null })
	| (Turn & { kind: 'bus'; hand: number[]; last: Result | null })
	| (Turn & { kind: 'paranoia'; answer: number | null; last: { asker: number; answer: number; question: number | null } | null });

export type Move =
	| { type: 'guess'; guess: string }
	| { type: 'pass' }
	| { type: 'answer'; who: number }
	| { type: 'reveal'; drink: boolean };

export class MoveError extends Error {}

type Person = { id: number; name: string };
type Shuffle = (length: number) => number[];

export function newPlay(kind: Kind, decks: number, shuffle: Shuffle, players: Person[]): Play {
	const turn = { up: players[0]?.id ?? null, seat: 0, deck: shuffle(decks) };
	// Higher or lower starts with a card face up.
	if (kind === 'hilo') return { ...turn, kind, at: 1, streak: 0, last: null };
	if (kind === 'bus') return { ...turn, kind, at: 0, hand: [], last: null };
	return { ...turn, kind, at: 0, answer: null, last: null };
}

/** Passes the turn to the next player after whoever is up (or after their seat, if they've left). */
function passTurn<P extends Play>(play: P, players: Person[]): P {
	if (!players.length) return { ...play, up: null, seat: 0 };
	const i = players.findIndex((p) => p.id === play.up);
	const seat = i >= 0 ? (i + 1) % players.length : play.seat % players.length;
	return { ...play, up: players[seat].id, seat };
}

/**
 * Puts the game right after people join or leave. If whoever was up has left, the next person
 * along goes, starting fresh: their run or hand is cleared, and in Paranoia the question the leaver
 * saw is thrown away. A named person who left counts as not wanting to know.
 */
export function settle(play: Play, players: Person[], shuffle: Shuffle): Play {
	if (!players.length) return { ...play, up: null };
	let next = play;
	const i = players.findIndex((p) => p.id === play.up);
	if (i < 0 && play.up === null) {
		// Nobody was up yet (a new game): the first player starts.
		next = { ...play, up: players[0].id, seat: 0 };
	} else if (i < 0) {
		const seat = play.seat % players.length;
		next = { ...play, up: players[seat].id, seat };
		if (next.kind === 'hilo') next = { ...next, streak: 0 };
		if (next.kind === 'bus') next = { ...next, hand: [] };
		if (next.kind === 'paranoia') next = freshQuestion({ ...next, answer: null }, shuffle);
	} else if (i !== play.seat) {
		next = { ...play, seat: i };
	}
	if (next.kind === 'paranoia') {
		const named = next.answer;
		if (named !== null && !players.some((p) => p.id === named)) next = finishQuestion(next, players, shuffle, false);
	}
	return next;
}

/** Whoever the game is waiting on: the player whose turn it is, or in Paranoia the person named. */
export function waitingOn(play: Play, players: Person[]) {
	const id = play.kind === 'paranoia' && play.answer !== null ? play.answer : play.up;
	return players.find((p) => p.id === id) ?? null;
}

/**
 * The next card off the deck. When it runs out the deck is reshuffled, leaving out `keep` (cards still
 * on the table): they're moved to the front of the new deck so they can't be dealt again straight away.
 */
function draw(play: { deck: number[]; at: number }, shuffle: Shuffle, keep: number[] = []) {
	let { deck, at } = play;
	if (at >= deck.length) {
		deck = shuffle(deck.length);
		deck = [...keep, ...deck.filter((i) => !keep.includes(i))];
		at = keep.length;
	}
	return { card: deck[at], deck, at: at + 1 };
}

const BUS_STEPS = [
	{ prompt: 'Red or black?', options: ['red', 'black'] },
	{ prompt: 'Higher or lower than your first card?', options: ['higher', 'lower'] },
	{ prompt: 'Inside or outside your first two cards?', options: ['inside', 'outside'] },
	{ prompt: 'Which suit?', options: SUITS }
];

type Paranoia = Extract<Play, { kind: 'paranoia' }>;

/** Moves Paranoia on to a question nobody has seen, reshuffling when they run out. */
function freshQuestion(play: Paranoia, shuffle: Shuffle): Paranoia {
	const at = play.at + 1;
	return at < play.deck.length ? { ...play, at } : { ...play, deck: shuffle(play.deck.length), at: 0 };
}

/** Ends a Paranoia turn: the question is used up, and the next person asks. */
function finishQuestion(play: Paranoia, players: Person[], shuffle: Shuffle, drink: boolean): Paranoia {
	const last = play.answer !== null && play.up !== null ? { asker: play.up, answer: play.answer, question: drink ? play.deck[play.at] : null } : play.last;
	return freshQuestion(passTurn({ ...play, answer: null, last }, players), shuffle);
}

/** Plays a move for `userId`, or throws a MoveError explaining why they can't. */
export function playMove(play: Play, players: Person[], userId: number, move: Move, shuffle: Shuffle): Play {
	const up = waitingOn(play, players);
	if (!up || up.id !== userId) throw new MoveError(play.kind === 'paranoia' && play.answer !== null ? 'It’s not you they named.' : 'It’s not your turn.');
	const name = up.name;

	if (play.kind === 'hilo') {
		const table = play.deck[play.at - 1];
		if (move.type === 'pass') {
			if (!play.streak) throw new MoveError('Get one right before you pass it on.');
			return { ...passTurn(play, players), streak: 0, last: { by: userId, text: `${name} passed it on after ${play.streak} right`, sips: 0, right: true } };
		}
		if (move.type !== 'guess' || !['higher', 'lower'].includes(move.guess)) throw new MoveError('Guess higher or lower.');
		const next = draw(play, shuffle, [table]);
		const [from, to] = [PLAYING_CARDS[table], PLAYING_CARDS[next.card]];
		const right = move.guess === 'higher' ? value(to) > value(from) : value(to) < value(from);
		const said = `${name} said ${move.guess} than ${from.rank}${from.suit}: ${to.rank}${to.suit}`;
		if (right) return { ...play, deck: next.deck, at: next.at, streak: play.streak + 1, last: { by: userId, text: said, sips: 0, right } };
		// Wrong (a tie counts as wrong): a sip for every card in the run, and the turn passes.
		return { ...passTurn(play, players), deck: next.deck, at: next.at, streak: 0, last: { by: userId, text: said, sips: play.streak + 1, right } };
	}

	if (play.kind === 'bus') {
		const step = play.hand.length;
		if (move.type !== 'guess' || !BUS_STEPS[step].options.includes(move.guess)) throw new MoveError(BUS_STEPS[step].prompt);
		const next = draw(play, shuffle, play.hand);
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
		const dealt = { deck: next.deck, at: next.at };
		if (!right) return { ...passTurn(play, players), ...dealt, hand: [], last: { by: userId, text: said, sips: step + 1, right } };
		if (step === 3) return { ...passTurn(play, players), ...dealt, hand: [], last: { by: userId, text: `${said}. Off the bus! Hand out 4 sips`, sips: 0, right } };
		return { ...play, ...dealt, hand: [...play.hand, next.card], last: { by: userId, text: said, sips: 0, right } };
	}

	// Paranoia: the asker answers their secret question with a name; the person named can drink to see it.
	if (play.answer === null) {
		if (move.type !== 'answer' || move.who === userId || !players.some((p) => p.id === move.who)) throw new MoveError('Pick someone else playing.');
		return { ...play, answer: move.who };
	}
	if (move.type !== 'reveal') throw new MoveError('Drink to find out, or leave it.');
	return finishQuestion(play, players, shuffle, move.drink);
}

/**
 * Moves the game on without the person it's waiting for (the group voted to skip them): their turn
 * passes, or in Paranoia a named person who doesn't answer has chosen not to know.
 */
export function skip(play: Play, players: Person[], shuffle: Shuffle): Play {
	if (play.kind === 'paranoia') return finishQuestion(play, players, shuffle, false);
	if (play.kind === 'hilo') return { ...passTurn(play, players), streak: 0 };
	return { ...passTurn(play, players), hand: [] };
}

/** What one person sees. Paranoia's question only reaches the asker until the person named drinks. */
export function viewPlay(play: Play, players: Person[], viewerId: number, questions: string[]) {
	const up = waitingOn(play, players);
	const name = (id: number) => players.find((p) => p.id === id)?.name ?? 'Someone';
	const base = { up, yours: !!up && up.id === viewerId };
	if (play.kind === 'hilo') {
		return { ...base, kind: play.kind, table: PLAYING_CARDS[play.deck[play.at - 1]], streak: play.streak, left: play.deck.length - play.at, last: play.last };
	}
	if (play.kind === 'bus') {
		const step = play.hand.length;
		return { ...base, kind: play.kind, hand: play.hand.map((i) => PLAYING_CARDS[i]), step: step + 1, prompt: BUS_STEPS[step].prompt, options: BUS_STEPS[step].options, last: play.last };
	}
	const asker = players.find((p) => p.id === play.up) ?? null;
	return {
		...base,
		kind: play.kind,
		asker,
		/** The current question, only for whoever's asking. */
		question: asker && asker.id === viewerId ? questions[play.deck[play.at]] : null,
		/** Paranoia needs someone else to name. */
		alone: players.length < 2,
		answer: play.answer !== null ? { id: play.answer, name: name(play.answer) } : null,
		last: play.last
			? { asker: name(play.last.asker), answer: name(play.last.answer), question: play.last.question === null ? null : questions[play.last.question] }
			: null
	};
}

export type PlayView = ReturnType<typeof viewPlay>;
