import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { addExpense, balances, getKitty, getRounds, parsePounds, payLink, recordRound, recordSettlement, settleUp } from './money.ts';
import { homeSafeCutoff } from './night.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@money.test`, name, 'correct-horse-9') as User;

function night() {
	const host = user('Host');
	const [a, b] = [user('A'), user('B')];
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	for (const g of [a, b]) {
		joinByToken(getEvent(id)!.invite_token, g.id);
		setRsvp(id, g.id, 'yes');
	}
	return { id, host, a, b };
}

describe('splitting costs', () => {
	it('parses pound amounts', () => {
		expect(['12.5', '£3', '12.05', '0', '1.234', 'abc', '-2'].map(parsePounds)).toEqual([
			1250, 300, 1205, null, null, null, null
		]);
	});

	it('splits unevenly divisible costs without losing a penny and settles with the fewest transfers', () => {
		const [A, B, C] = [1, 2, 3];
		const expenses = [
			{ paid_by: A, amount_pence: 1000, shares: [A, B, C] }, // 334 / 333 / 333
			{ paid_by: B, amount_pence: 900, shares: [B, C] } // 450 / 450
		];
		const balance = balances(expenses, []);
		expect(Object.fromEntries(balance)).toEqual({ 1: 666, 2: 117, 3: -783 });
		expect(settleUp(balance)).toEqual([
			{ from: C, to: A, amount: 666 },
			{ from: C, to: B, amount: 117 }
		]);
		// After C pays A, only the debt to B is left.
		expect(settleUp(balances(expenses, [{ from: C, to: A, amount: 666 }]))).toEqual([{ from: C, to: B, amount: 117 }]);
	});

	it('records a payment and adds the amount to Monzo.me links', () => {
		const { id, host, a, b } = night();
		addExpense(id, host.id, 'Taxi', '18.00', [host.id, a.id, b.id]);
		expect(getKitty(id).transfers.map((t) => [t.fromName, t.toName, t.amount])).toEqual([
			['A', 'Host', 600],
			['B', 'Host', 600]
		]);
		expect(() => recordSettlement(id, b.id, a.id, host.id)).toThrow('Only the people involved');
		recordSettlement(id, a.id, a.id, host.id);
		expect(getKitty(id).transfers.map((t) => t.fromName)).toEqual(['B']);
		expect(payLink('https://monzo.me/joshb', 600)).toBe('https://monzo.me/joshb/6.00');
		expect(payLink('https://paypal.me/josh', 600)).toBe('https://paypal.me/josh');
	});
});

describe('rounds', () => {
	it('goes round everyone going in turn and records skipped rounds', () => {
		const { id, host, a, b } = night();
		expect(getRounds(id).next?.id).toBe(host.id);
		recordRound(id, a.id, host.id, false);
		expect(() => recordRound(id, a.id, host.id, false)).toThrow('already updated');
		recordRound(id, b.id, a.id, true);
		recordRound(id, b.id, b.id, false);
		const rounds = getRounds(id);
		expect(rounds.next?.id).toBe(host.id);
		expect(rounds.tally.map((t) => [t.name, t.bought, t.skipped])).toEqual([
			['Host', 1, 0],
			['A', 0, 1],
			['B', 1, 0]
		]);
	});
});

describe('home safe', () => {
	it('expects people home by the first 3am after the night starts', () => {
		expect(homeSafeCutoff('2026-11-14T20:00')).toBe('2026-11-15T03:00');
		expect(homeSafeCutoff('2026-11-15T01:30')).toBe('2026-11-15T03:00');
		expect(homeSafeCutoff('2026-11-14T03:00')).toBe('2026-11-15T03:00');
		expect(homeSafeCutoff('2026-11-30T22:00')).toBe('2026-12-01T03:00');
	});
});
