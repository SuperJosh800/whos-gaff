// Bets (Games tab): anyone going proposes a yes/no bet ("Sam's first home"), and everyone going stakes
// pretend coins on a side, from 100 each a night. Betting closes when the night starts; after that, whoever
// proposed a bet or the host settles it, and the winners split the losers' coins by what they staked.
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireMember } from './events.ts';
import { canSeeAddress } from './gaff.ts';
import { isOver } from './after.ts';
import { nowLocal } from '../time.ts';

/** Everyone starts each night with this many coins. */
export const COINS = 100;
/** Bets open at once on a night. */
const OPEN_BETS = 20;
const BETS_EACH = 5;

export type Side = 'yes' | 'no';
export type Outcome = Side | 'off';
type Stake = { user_id: number; side: Side; coins: number };

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('RSVP “going” to bet.');
	return event;
}

function requireOpen(eventId: number, betId: number) {
	const bet = db.prepare('SELECT id, proposer_id, text, outcome FROM bets WHERE id = ? AND event_id = ?').get(betId, eventId) as
		| { id: number; proposer_id: number; text: string; outcome: Outcome | null }
		| undefined;
	if (!bet) throw new EventError('That bet’s been called off.');
	if (bet.outcome) throw new EventError('That bet’s been settled.');
	return bet;
}

/** Coins someone has to bet with tonight: 100, plus what they've won or lost, less what's riding on open bets. */
export function wallet(eventId: number, userId: number) {
	const { won, riding } = db
		.prepare(
			`SELECT COALESCE(SUM(s.result), 0) AS won, COALESCE(SUM(CASE WHEN b.outcome IS NULL THEN s.coins END), 0) AS riding
			 FROM bet_stakes s JOIN bets b ON b.id = s.bet_id WHERE b.event_id = ? AND s.user_id = ?`
		)
		.get(eventId, userId) as { won: number; riding: number };
	return COINS + won - riding;
}

function requireBettingOpen(event: Parameters<typeof isOver>[0], now: string) {
	if (isOver(event, now)) throw new EventError('Betting closed when the night started.');
}

export function proposeBet(eventId: number, userId: number, text: string, now = nowLocal()) {
	requireBettingOpen(requireGoing(eventId, userId), now);
	text = text.replace(/\s+/g, ' ').trim().slice(0, 100);
	if (!text) throw new EventError('What’s the bet?');
	const { open, mine } = db
		.prepare('SELECT COUNT(*) AS open, COALESCE(SUM(proposer_id = ?), 0) AS mine FROM bets WHERE event_id = ? AND outcome IS NULL')
		.get(userId, eventId) as { open: number; mine: number };
	if (mine >= BETS_EACH) throw new EventError(`You’ve got ${BETS_EACH} bets open. Settle one first.`);
	if (open >= OPEN_BETS) throw new EventError('That’s plenty of bets for one night. Settle some first.');
	db.prepare('INSERT INTO bets (event_id, proposer_id, text) VALUES (?, ?, ?)').run(eventId, userId, text);
	publish(eventId);
}

/** Puts coins on a side, or changes your stake, until the night starts. 0 coins takes your stake back. */
export function placeStake(eventId: number, userId: number, betId: number, side: string, coins: number, now = nowLocal()) {
	requireBettingOpen(requireGoing(eventId, userId), now);
	requireOpen(eventId, betId);
	if (side !== 'yes' && side !== 'no') throw new EventError('Pick yes or no.');
	if (!Number.isInteger(coins) || coins < 0) throw new EventError('Bet a whole number of coins.');
	if (!coins) {
		db.prepare('DELETE FROM bet_stakes WHERE bet_id = ? AND user_id = ?').run(betId, userId);
	} else {
		const current = (db.prepare('SELECT coins FROM bet_stakes WHERE bet_id = ? AND user_id = ?').get(betId, userId) as { coins: number } | undefined)?.coins ?? 0;
		const available = wallet(eventId, userId) + current;
		if (coins > available) throw new EventError(`You’ve only got ${available} coins to bet.`);
		db.prepare(
			`INSERT INTO bet_stakes (bet_id, user_id, side, coins) VALUES (?, ?, ?, ?)
			 ON CONFLICT (bet_id, user_id) DO UPDATE SET side = excluded.side, coins = excluded.coins`
		).run(betId, userId, side, coins);
	}
	publish(eventId);
}

/**
 * What each stake wins or loses. Winners get a share of the losers' coins in proportion to their stake
 * (rounded down, with the spare coins going to the biggest stakes first). If nobody backed one of the
 * sides, or the bet's off, nobody wins or loses anything.
 */
export function payouts(stakes: Stake[], outcome: Outcome) {
	const winners = stakes.filter((s) => s.side === outcome);
	const losers = stakes.filter((s) => s.side !== outcome);
	const result = new Map(stakes.map((s) => [s.user_id, 0]));
	if (outcome === 'off' || !winners.length || !losers.length) return result;
	const pot = losers.reduce((sum, s) => sum + s.coins, 0);
	const backed = winners.reduce((sum, s) => sum + s.coins, 0);
	for (const s of losers) result.set(s.user_id, -s.coins);
	for (const s of winners) result.set(s.user_id, Math.floor((pot * s.coins) / backed));
	let spare = pot - winners.reduce((sum, s) => sum + result.get(s.user_id)!, 0);
	for (const s of [...winners].sort((a, b) => b.coins - a.coins || a.user_id - b.user_id)) {
		if (!spare) break;
		result.set(s.user_id, result.get(s.user_id)! + 1);
		spare--;
	}
	return result;
}

/** Settles a bet once the night has started: whoever proposed it or the host says yes, no, or it's off. */
export function settleBet(eventId: number, userId: number, betId: number, outcome: string, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	const bet = requireOpen(eventId, betId);
	if (bet.proposer_id !== userId && event.host_id !== userId) throw new EventError('Only whoever made the bet or the host can settle it.');
	if (!isOver(event, now)) throw new EventError('Bets are settled once the night has started.');
	if (outcome !== 'yes' && outcome !== 'no' && outcome !== 'off') throw new EventError('Say how it went.');
	const stakes = db.prepare('SELECT user_id, side, coins FROM bet_stakes WHERE bet_id = ?').all(betId) as Stake[];
	const result = payouts(stakes, outcome);
	tx(() => {
		db.prepare('UPDATE bets SET outcome = ?, settled_by = ? WHERE id = ?').run(outcome, userId, betId);
		const set = db.prepare('UPDATE bet_stakes SET result = ? WHERE bet_id = ? AND user_id = ?');
		for (const [id, coins] of result) set.run(coins, betId, id);
	});
	const said = outcome === 'off' ? 'it’s off' : outcome;
	const plural = (n: number) => `${n} ${n === 1 ? 'coin' : 'coins'}`;
	for (const [id, coins] of result) {
		if (id === userId) continue;
		const how = coins > 0 ? `You won ${plural(coins)}.` : coins < 0 ? `You lost ${plural(-coins)}.` : 'You got your coins back.';
		notify(id, eventId, `“${bet.text}” was settled ${said}. ${how} (${event.title})`, '/games#bets');
	}
	publish(eventId);
}

/** Calls off a bet before it's settled; everyone's coins go back. Whoever made it or the host can. */
export function cancelBet(eventId: number, userId: number, betId: number) {
	const event = requireMember(eventId, userId);
	const bet = requireOpen(eventId, betId);
	if (bet.proposer_id !== userId && event.host_id !== userId) throw new EventError('Only whoever made the bet or the host can call it off.');
	db.prepare('DELETE FROM bets WHERE id = ?').run(betId);
	publish(eventId);
}

/** The night's bets as someone sees them, their coins, and everyone's coins so far. */
export function getBets(eventId: number, viewerId: number, now = nowLocal()) {
	const event = requireMember(eventId, viewerId);
	const bets = db
		.prepare(
			`SELECT b.id, b.text, b.proposer_id, u.name AS proposer, b.outcome,
				COALESCE(SUM(CASE WHEN s.side = 'yes' THEN s.coins END), 0) AS yes,
				COALESCE(SUM(CASE WHEN s.side = 'no' THEN s.coins END), 0) AS no
			 FROM bets b JOIN users u ON u.id = b.proposer_id LEFT JOIN bet_stakes s ON s.bet_id = b.id
			 WHERE b.event_id = ? GROUP BY b.id ORDER BY b.outcome IS NOT NULL, b.id DESC`
		)
		.all(eventId) as { id: number; text: string; proposer_id: number; proposer: string; outcome: Outcome | null; yes: number; no: number }[];
	const mine = new Map(
		(
			db
				.prepare('SELECT s.bet_id, s.side, s.coins, s.result FROM bet_stakes s JOIN bets b ON b.id = s.bet_id WHERE b.event_id = ? AND s.user_id = ?')
				.all(eventId, viewerId) as { bet_id: number; side: Side; coins: number; result: number | null }[]
		).map((s) => [s.bet_id, s])
	);
	const coins = db
		.prepare(
			`SELECT u.id, u.name, ? + COALESCE(SUM(s.result), 0) AS coins FROM bet_stakes s JOIN bets b ON b.id = s.bet_id JOIN users u ON u.id = s.user_id
			 WHERE b.event_id = ? GROUP BY u.id HAVING COUNT(b.outcome) > 0 ORDER BY coins DESC, u.name`
		)
		.all(COINS, eventId) as { id: number; name: string; coins: number }[];
	const going = canSeeAddress(event, viewerId);
	const started = isOver(event, now);
	return {
		bets: bets.map((b) => {
			const runs = b.proposer_id === viewerId || event.host_id === viewerId;
			// A settled bet nobody took the other side of gave everyone their coins back.
			const refunded = b.outcome === 'off' || (!!b.outcome && (!b.yes || !b.no));
			return { ...b, refunded, mine: mine.get(b.id) ?? null, canSettle: !b.outcome && runs && started, canCancel: !b.outcome && runs };
		}),
		wallet: going ? wallet(eventId, viewerId) : null,
		coins,
		started,
		canPropose: going && !started
	};
}
