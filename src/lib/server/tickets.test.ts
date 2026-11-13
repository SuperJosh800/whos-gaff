import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { getTickets, NUDGE_GAP_MS, nudgeTickets, setHaveTicket, setTickets } from './tickets.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@tickets.test`, name, 'correct-horse-9') as User;
const notes = (u: User) =>
	(db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY id').all(u.id) as { message: string }[]).map((r) => r.message);
const names = (people: { name: string }[]) => people.map((p) => p.name);
const LINK = 'https://www.skiddle.com/e/123';

function club() {
	const host = user('Host');
	const [a, b, maybe] = [user('A'), user('B'), user('Maybe')];
	const id = createEvent(host.id, { title: 'Sub Club', mode: 'fixed', startsAt: '2099-06-20T23:00' });
	for (const g of [a, b, maybe]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, a.id, 'yes');
	setRsvp(id, b.id, 'yes');
	setRsvp(id, maybe.id, 'maybe');
	return { id, host, a, b, maybe };
}

describe('tickets', () => {
	it('only the host sets them up, with an https link and a real price, and people going hear once', () => {
		const { id, host, a, maybe } = club();
		expect(() => setTickets(id, a.id, { url: LINK, price: '12', note: '' })).toThrow('Only the host');
		expect(() => setTickets(id, host.id, { url: 'javascript:alert(1)', price: '', note: '' })).toThrow('https://');
		expect(() => setTickets(id, host.id, { url: 'http://tix.example', price: '', note: '' })).toThrow('https://');
		expect(() => setTickets(id, host.id, { url: LINK, price: 'twelve', note: '' })).toThrow('like 12.50');
		setTickets(id, host.id, { url: LINK, price: '£12.5', note: 'Last entry 11:30' });
		setTickets(id, host.id, { url: LINK, price: '14', note: 'Last entry 11:30' }); // price went up
		expect(getTickets(id, a.id)).toMatchObject({ url: LINK, price_pence: 1400, note: 'Last entry 11:30' });
		expect(notes(a)).toEqual(['Tickets for Sub Club are up (£12.50). Grab yours.']);
		expect(notes(maybe)).toEqual([]);
		expect(notes(host)).toEqual([]);
	});

	it('lists who has one and who still needs one among people going, including the host', () => {
		const { id, host, a, b, maybe } = club();
		expect(() => setHaveTicket(id, a.id, true)).toThrow('hasn’t added tickets');
		setTickets(id, host.id, { url: LINK, price: '', note: '' });
		setHaveTicket(id, a.id, true);
		setHaveTicket(id, a.id, true); // a double tap changes nothing
		expect(() => setHaveTicket(id, maybe.id, true)).toThrow('RSVP “going”');
		let t = getTickets(id, b.id)!;
		expect(names(t.have)).toEqual(['A']);
		expect(names(t.need)).toEqual(['Host', 'B']);
		expect(t.mine).toBe(false);
		// Someone who stops going drops off both lists, and comes back with their ticket.
		setRsvp(id, a.id, 'no');
		expect(names(getTickets(id, b.id)!.have)).toEqual([]);
		setRsvp(id, a.id, 'yes');
		expect(getTickets(id, a.id)!.mine).toBe(true);
		setHaveTicket(id, a.id, false);
		t = getTickets(id, a.id)!;
		expect(names(t.need)).toEqual(['Host', 'A', 'B']);
	});

	it('nudges only guests still needing one, at most once an hour', () => {
		const { id, host, a, b, maybe } = club();
		setTickets(id, host.id, { url: LINK, price: '10', note: '' });
		setHaveTicket(id, a.id, true);
		const before = notes(b).length;
		expect(() => nudgeTickets(id, a.id, 1000)).toThrow('Only the host');
		expect(nudgeTickets(id, host.id, 1000)).toBe(1);
		expect(notes(b).slice(before)).toEqual(['You still need a ticket for Sub Club.']);
		expect(notes(a).filter((m) => m.includes('still need'))).toEqual([]);
		expect(notes(maybe)).toEqual([]);
		expect(getTickets(id, host.id, 1000 + NUDGE_GAP_MS - 1)!.canNudge).toBe(false);
		expect(() => nudgeTickets(id, host.id, 1000 + NUDGE_GAP_MS - 1)).toThrow('last hour');
		setHaveTicket(id, b.id, true);
		expect(() => nudgeTickets(id, host.id, 1000 + NUDGE_GAP_MS)).toThrow('Everyone going');
	});

	it('clearing every box removes them, and accounts export and delete their tickets', () => {
		const { id, host, a } = club();
		setTickets(id, host.id, { url: LINK, price: '', note: '' });
		setHaveTicket(id, a.id, true);
		expect(exportData(a.id)).toMatchObject({ ticket_holders: [{ event_id: id, user_id: a.id }] });
		deleteAccount(a.id);
		expect(names(getTickets(id, host.id)!.have)).toEqual([]);
		setTickets(id, host.id, { url: ' ', price: '', note: '' });
		expect(getTickets(id, host.id)).toBeNull();
	});
});
