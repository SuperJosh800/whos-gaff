import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { cancelBet, COINS, getBets, payouts, placeStake, proposeBet, settleBet, wallet } from './bets.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@bets.test`, name, 'correct-horse-9') as User;
const BEFORE = '2099-06-20T20:59';
const DURING = '2099-06-20T23:00';

/** Host, Sam, Alex and Kim going; Maybe isn't. */
function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const [sam, alex, kim, maybe] = ['Sam', 'Alex', 'Kim', 'Maybe'].map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		setRsvp(id, p.id, name === 'Maybe' ? 'maybe' : 'yes');
		return p;
	});
	return { id, host, sam, alex, kim, maybe };
}
const betId = (id: number, u: User, text: string) => getBets(id, u.id, BEFORE).bets.find((b) => b.text === text)!.id;
const notes = (u: User) => listNotifications(u.id, 50).filter((x) => /Bet settled/.test(x.message)).map((x) => x.message);

describe('bets', () => {
	it('splits the losers’ coins between the winners by stake, with spare coins to the biggest stake', () => {
		const stakes = [
			{ user_id: 1, side: 'yes' as const, coins: 10 },
			{ user_id: 2, side: 'yes' as const, coins: 20 },
			{ user_id: 3, side: 'no' as const, coins: 25 }
		];
		// 25 split 10:20 is 8.33 and 16.67: 8 and 16, and the spare coin goes to the 20.
		expect(Object.fromEntries(payouts(stakes, 'yes'))).toEqual({ 1: 8, 2: 17, 3: -25 });
		expect(Object.fromEntries(payouts(stakes, 'no'))).toEqual({ 1: -10, 2: -20, 3: 30 });
		expect(Object.fromEntries(payouts(stakes, 'off'))).toEqual({ 1: 0, 2: 0, 3: 0 });
		expect(Object.fromEntries(payouts(stakes.slice(0, 2), 'no'))).toEqual({ 1: 0, 2: 0 });
		// Equal stakes: the spare coin goes to the lowest user id.
		expect(Object.fromEntries(payouts([{ user_id: 5, side: 'no', coins: 1 }, { user_id: 4, side: 'no', coins: 1 }, { user_id: 6, side: 'yes', coins: 3 }], 'no'))).toEqual({ 4: 2, 5: 1, 6: -3 });
	});

	it('takes stakes from people going, from 100 coins a night, and pays out when settled', () => {
		const { id, host, sam, alex, kim, maybe } = night();
		proposeBet(id, sam.id, '  Alex   is first home ');
		const bet = betId(id, sam, 'Alex is first home');
		expect(() => placeStake(id, maybe.id, bet, 'yes', 10)).toThrow('RSVP “going”');
		placeStake(id, sam.id, bet, 'yes', 30);
		placeStake(id, alex.id, bet, 'no', 50);
		placeStake(id, alex.id, bet, 'no', 20);
		placeStake(id, kim.id, bet, 'yes', 10);
		expect(wallet(id, alex.id)).toBe(COINS - 20);
		expect(() => placeStake(id, sam.id, bet, 'yes', 101)).toThrow('only got 100');
		expect(() => placeStake(id, sam.id, bet, 'maybe', 10)).toThrow('yes or no');
		expect(() => placeStake(id, sam.id, bet, 'yes', 2.5)).toThrow('whole number');
		expect(getBets(id, host.id, BEFORE)).toMatchObject({ bets: [{ yes: 40, no: 20, canSettle: false, canCancel: true, mine: null }], coins: [] });
		expect(() => settleBet(id, sam.id, bet, 'yes', BEFORE)).toThrow('once the night has started');
		expect(() => settleBet(id, alex.id, bet, 'yes', DURING)).toThrow('Only whoever made the bet or the host');
		settleBet(id, sam.id, bet, 'yes', DURING);
		// 20 split 30:10 gives Sam 15 and Kim 5.
		expect([sam, alex, kim].map((u) => wallet(id, u.id))).toEqual([115, 80, 105]);
		expect(notes(alex)).toEqual(['Bet settled: “Alex is first home”: yes. You lost 20 coins. (Night)']);
		expect(notes(kim)).toEqual(['Bet settled: “Alex is first home”: yes. You won 5 coins. (Night)']);
		expect(notes(sam)).toEqual([]);
		expect(getBets(id, kim.id, DURING)).toMatchObject({
			bets: [{ outcome: 'yes', mine: { side: 'yes', coins: 10, result: 5 }, canSettle: false, canCancel: false }],
			coins: [
				{ name: 'Sam', coins: 115 },
				{ name: 'Kim', coins: 105 },
				{ name: 'Alex', coins: 80 }
			]
		});
		expect(() => placeStake(id, alex.id, bet, 'yes', 10)).toThrow('been settled');
		expect(() => settleBet(id, sam.id, bet, 'no', DURING)).toThrow('been settled');
		// Winnings can be bet again.
		proposeBet(id, host.id, 'Taxi before 2');
		placeStake(id, sam.id, betId(id, sam, 'Taxi before 2'), 'no', 115);
		expect(wallet(id, sam.id)).toBe(0);
	});

	it('gives everyone their coins back when a bet’s off, called off, or nobody took the other side', () => {
		const { id, host, sam, alex, kim } = night();
		for (const text of ['Off', 'Called off', 'One-sided']) proposeBet(id, sam.id, text);
		for (const text of ['Off', 'Called off', 'One-sided']) placeStake(id, alex.id, betId(id, sam, text), 'yes', 20);
		placeStake(id, kim.id, betId(id, sam, 'Off'), 'no', 20);
		settleBet(id, host.id, betId(id, sam, 'Off'), 'off', DURING);
		expect(() => cancelBet(id, kim.id, betId(id, sam, 'Called off'))).toThrow('Only whoever made the bet or the host');
		cancelBet(id, sam.id, betId(id, sam, 'Called off'));
		settleBet(id, sam.id, betId(id, sam, 'One-sided'), 'no', DURING);
		expect([alex, kim].map((u) => wallet(id, u.id))).toEqual([100, 100]);
		expect(notes(kim)).toEqual(['Bet settled: “Off”: it’s off. You got your coins back. (Night)']);
		expect(() => placeStake(id, alex.id, 999999, 'yes', 1)).toThrow('called off');
	});

	it('limits open bets, keeps them to their own night, and takes a stake back with 0 coins', () => {
		const { id, host, sam } = night();
		expect(() => proposeBet(id, sam.id, ' ')).toThrow('What’s the bet');
		for (let i = 0; i < 5; i++) proposeBet(id, sam.id, `Bet ${i}`);
		expect(() => proposeBet(id, sam.id, 'Sixth')).toThrow('5 bets open');
		proposeBet(id, host.id, 'Host can still');
		placeStake(id, sam.id, betId(id, sam, 'Host can still'), 'no', 40);
		placeStake(id, sam.id, betId(id, sam, 'Host can still'), 'no', 0);
		expect(wallet(id, sam.id)).toBe(100);
		expect(getBets(id, sam.id, BEFORE).bets.find((b) => b.text === 'Host can still')!.mine).toBeNull();
		const other = night();
		expect(() => placeStake(other.id, other.sam.id, betId(id, sam, 'Bet 0'), 'yes', 1)).toThrow('called off');
		expect(() => settleBet(other.id, other.host.id, betId(id, sam, 'Bet 0'), 'yes', DURING)).toThrow('called off');
		expect(() => getBets(id, user('Stranger').id)).toThrow('not invited');
	});

	it('removes open bets and stakes with your account, but keeps settled ones so the coins add up', () => {
		const { id, sam, alex, kim } = night();
		proposeBet(id, sam.id, 'Settled');
		proposeBet(id, sam.id, 'Open');
		proposeBet(id, kim.id, 'Kim’s');
		placeStake(id, alex.id, betId(id, sam, 'Settled'), 'no', 10);
		placeStake(id, kim.id, betId(id, sam, 'Settled'), 'yes', 10);
		settleBet(id, sam.id, betId(id, sam, 'Settled'), 'yes', DURING);
		placeStake(id, alex.id, betId(id, sam, 'Open'), 'yes', 10);
		placeStake(id, sam.id, betId(id, sam, 'Kim’s'), 'yes', 10);
		expect(exportData(sam.id)).toMatchObject({ bets: [{ text: 'Settled' }, { text: 'Open' }], bet_stakes: [{ coins: 10 }] });
		deleteAccount(sam.id);
		expect(getBets(id, alex.id, DURING).bets.map((b) => [b.text, b.proposer, b.yes])).toEqual([
			['Kim’s', 'Kim', 0],
			['Settled', 'Deleted user', 10]
		]);
		expect(wallet(id, alex.id)).toBe(90);
		expect(wallet(id, kim.id)).toBe(110);
	});
});
