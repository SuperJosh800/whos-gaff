import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { getKitty } from './money.ts';
import { cancelTakeaway, getTakeaway, placeOrder, removeItem, setItem, setOrderer, startTakeaway } from './takeaway.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@takeaway.test`, name, 'correct-horse-9') as User;
const AT = Date.parse('2099-06-20T23:00:00Z');

/** Host, Sam and Alex going, Maybe not. */
function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const [sam, alex, maybe] = ['Sam', 'Alex', 'Maybe'].map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		return p;
	});
	setRsvp(id, sam.id, 'yes');
	setRsvp(id, alex.id, 'yes');
	setRsvp(id, maybe.id, 'maybe');
	return { id, host, sam, alex, maybe };
}
const notes = (userId: number, match: RegExp) => listNotifications(userId, 50).filter((x) => match.test(x.message)).map((x) => x.message);
const orderId = (id: number, userId: number) => getTakeaway(id, userId).order!.id;
/** What each person owes (negative) or is owed, from the kitty's settle-up list. */
function owes(id: number) {
	const net = new Map<string, number>();
	for (const t of getKitty(id).transfers) {
		net.set(t.fromName, (net.get(t.fromName) ?? 0) - t.amount);
		net.set(t.toName, (net.get(t.toName) ?? 0) + t.amount);
	}
	return Object.fromEntries(net);
}

describe('takeaway order', () => {
	it('tells everyone else going, collects orders, and puts each share in the kitty', () => {
		const { id, host, sam, alex, maybe } = night();
		startTakeaway(id, sam.id, '  Pizza   Palace ', AT);
		for (const p of [host, alex]) expect(notes(p.id, /takeaway/)).toEqual(['Sam’s getting a takeaway from Pizza Palace. Add what you want. (Night)']);
		expect(notes(sam.id, /takeaway/)).toEqual([]);
		expect(notes(maybe.id, /takeaway/)).toEqual([]);
		const t = orderId(id, sam.id);
		setItem(id, sam.id, t, 'Margherita', '9');
		setItem(id, alex.id, t, 'Pepperoni', '10.50');
		setItem(id, alex.id, t, 'Hawaiian', '11');
		setItem(id, host.id, t, 'Chips', '');
		expect(() => setItem(id, maybe.id, t, 'Garlic bread', '')).toThrow('RSVP “going”');
		expect(() => setItem(id, host.id, t, 'Chips', 'loads')).toThrow('price like');
		expect(getTakeaway(id, alex.id).order).toMatchObject({
			place: 'Pizza Palace',
			by: 'Sam',
			priced: 2000,
			items: [
				{ name: 'Sam', item: 'Margherita', price_pence: 900 },
				{ name: 'Alex', item: 'Hawaiian', price_pence: 1100 },
				{ name: 'Host', item: 'Chips', price_pence: null }
			]
		});
		expect(() => placeOrder(id, alex.id, t, '30', AT)).toThrow('Only the person ordering');
		setOrderer(id, alex.id, t, true);
		expect(() => setOrderer(id, sam.id, t, true)).toThrow('already ordering');
		expect(() => placeOrder(id, alex.id, t, '19.99', AT)).toThrow('less than the prices people put in (£20.00)');
		// £20 of priced items, so £5.01 of chips and delivery split 3 ways: 167p each.
		placeOrder(id, alex.id, t, '25.01', AT);
		expect(owes(id)).toEqual({ Sam: -(900 + 167), Host: -167, Alex: 900 + 167 + 167 });
		expect(getKitty(id).total).toBe(2501);
		expect(notes(sam.id, /ordered/)).toEqual(['Alex ordered from Pizza Palace. Your share, £10.67, is in the kitty. (Night)']);
		expect(notes(host.id, /ordered/)).toEqual(['Alex ordered from Pizza Palace. Your share, £1.67, is in the kitty. (Night)']);
		expect(notes(alex.id, /ordered/)).toEqual([]);
		expect(getTakeaway(id, sam.id)).toMatchObject({ order: { total_pence: 2501, orderer: 'Alex', canCancel: false }, canStart: true });
		expect(getTakeaway(id, sam.id).order!.items.map((i) => i.share)).toEqual([1067, 1267, 167]);
		expect(() => setItem(id, sam.id, t, 'Calzone', '')).toThrow('already been ordered');
		expect(() => placeOrder(id, alex.id, t, '25.01', AT)).toThrow('already been ordered');
	});

	it('splits the whole bill evenly when nobody put a price in, and leaves the orderer out of their own costs', () => {
		const { id, host, sam, alex } = night();
		startTakeaway(id, host.id, 'Chippy', AT);
		const t = orderId(id, host.id);
		for (const p of [host, sam, alex]) setItem(id, p.id, t, 'Fish supper', '');
		setOrderer(id, sam.id, t, true);
		placeOrder(id, sam.id, t, '30.01', AT);
		expect(getKitty(id).expenses).toMatchObject([{ description: 'Chippy', amount_pence: 3001, payer: 'Sam' }]);
		// The spare penny goes to the first person to sign up, in the kitty and in what they're told.
		expect(owes(id)).toEqual({ Host: -1001, Alex: -1000, Sam: 2001 });
		expect(getTakeaway(id, host.id).order!.items.map((i) => i.share)).toEqual([1001, 1000, 1000]);
		expect(notes(host.id, /ordered/)).toEqual(['Sam ordered from Chippy. Your share, £10.01, is in the kitty. (Night)']);
	});

	it('runs one at a time, lets people take orders out and change who orders, and can be called off', () => {
		const { id, host, sam, alex, maybe } = night();
		expect(() => startTakeaway(id, maybe.id, 'Chippy', AT)).toThrow('RSVP “going”');
		expect(() => startTakeaway(id, user('Stranger').id, 'Chippy', AT)).toThrow('not invited');
		expect(() => startTakeaway(id, sam.id, '  ', AT)).toThrow('Where from');
		expect(getTakeaway(id, maybe.id).canStart).toBe(false);
		startTakeaway(id, sam.id, 'Chippy', AT);
		expect(getTakeaway(id, host.id).canStart).toBe(false);
		expect(() => startTakeaway(id, host.id, 'Kebab', AT)).toThrow('already a takeaway');
		const t = orderId(id, sam.id);
		setItem(id, alex.id, t, 'Chips', '3');
		removeItem(id, alex.id, t);
		setOrderer(id, alex.id, t, true);
		expect(() => placeOrder(id, alex.id, t, '3', AT)).toThrow('Nobody’s added anything');
		setOrderer(id, sam.id, t, false);
		expect(getTakeaway(id, host.id).order!.orderer).toBe('Alex');
		setOrderer(id, alex.id, t, false);
		expect(getTakeaway(id, host.id).order!.orderer).toBeNull();
		expect(() => cancelTakeaway(id, alex.id, t)).toThrow('Only whoever started it');
		expect(getTakeaway(id, alex.id).order!.canCancel).toBe(false);
		expect(getTakeaway(id, host.id).order!.canCancel).toBe(true);
		cancelTakeaway(id, host.id, t);
		expect(getTakeaway(id, sam.id)).toEqual({ order: null, canStart: true });
		expect(() => setItem(id, sam.id, t, 'Chips', '')).toThrow('called off');
		const other = night();
		startTakeaway(other.id, other.sam.id, 'Kebab', AT);
		expect(() => setItem(id, sam.id, orderId(other.id, other.sam.id), 'Doner', '')).toThrow('called off');
	});

	it('lets each person start 3 an hour', () => {
		const { id, host, sam } = night();
		for (let i = 0; i < 3; i++) {
			startTakeaway(id, sam.id, 'Chippy', AT + i);
			cancelTakeaway(id, sam.id, orderId(id, sam.id));
		}
		expect(() => startTakeaway(id, sam.id, 'Chippy', AT + 3)).toThrow('3 this hour');
		startTakeaway(id, host.id, 'Chippy', AT + 3);
		cancelTakeaway(id, host.id, orderId(id, host.id));
		startTakeaway(id, sam.id, 'Chippy', AT + 60 * 60_000);
	});

	it('removes your orders when you delete your account, but keeps placed orders and their kitty costs', () => {
		const { id, host, sam, alex } = night();
		startTakeaway(id, sam.id, 'Chippy', AT);
		const t = orderId(id, sam.id);
		setItem(id, host.id, t, 'Fish', '7');
		setItem(id, alex.id, t, 'Chips', '3');
		setOrderer(id, alex.id, t, true);
		placeOrder(id, alex.id, t, '10', AT);
		startTakeaway(id, alex.id, 'Kebab', AT + 1);
		const k = orderId(id, alex.id);
		setItem(id, alex.id, k, 'Doner', '');
		setOrderer(id, alex.id, k, true);
		deleteAccount(alex.id);
		expect(getTakeaway(id, host.id)).toMatchObject({ order: { place: 'Chippy', orderer: 'Deleted user', total_pence: 1000 }, canStart: true });
		expect(getKitty(id).expenses).toMatchObject([
			{ description: 'Chippy: Fish', amount_pence: 700, payer: 'Deleted user' },
			{ description: 'Chippy: Chips', amount_pence: 300, payer: 'Deleted user' }
		]);
		startTakeaway(id, sam.id, 'Curry', AT + 2);
		setItem(id, sam.id, orderId(id, sam.id), 'Korma', '');
		setOrderer(id, host.id, orderId(id, sam.id), true);
		deleteAccount(host.id);
		expect(getTakeaway(id, sam.id).order).toMatchObject({ place: 'Curry', orderer: null });
	});
});
