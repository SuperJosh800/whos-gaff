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
		expect(() => setTickets(id, host.id, { url: '', price: '10', note: '' })).toThrow('https://');
		expect(() => setTickets(id, host.id, { url: `${LINK}?${'x'.repeat(500)}`, price: '', note: '' })).toThrow('too long');
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
		setHaveTicket(id, host.id, true); // the host counts as going without an RSVP
		expect(() => setHaveTicket(id, maybe.id, true)).toThrow('RSVP “going”');
		expect(getTickets(id, maybe.id)).toMatchObject({ url: LINK, going: false, mine: false });
		let t = getTickets(id, b.id)!;
		expect(names(t.have)).toEqual(['Host', 'A']);
		expect(names(t.need)).toEqual(['B']);
		expect(t.mine).toBe(false);
		setHaveTicket(id, host.id, false);
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

	it('keeps strangers and undated polls out', () => {
		const { id, host } = club();
		const stranger = user('Stranger');
		setTickets(id, host.id, { url: LINK, price: '', note: '' });
		expect(() => getTickets(id, stranger.id)).toThrow('not invited');
		expect(() => setHaveTicket(id, stranger.id, true)).toThrow('not invited');
		const poll = createEvent(host.id, { title: 'Poll', mode: 'poll', options: ['2099-07-01T20:00', '2099-07-02T20:00'] });
		expect(() => setTickets(poll, host.id, { url: LINK, price: '', note: '' })).toThrow('once the date is set');
	});

	it('clearing and re-adding doesn’t re-announce, reset the nudge limit, or keep old marks', () => {
		const { id, host, a, b } = club();
		setTickets(id, host.id, { url: LINK, price: '', note: '' });
		setHaveTicket(id, a.id, true);
		nudgeTickets(id, host.id, 1000);
		const before = notes(b).length;
		setTickets(id, host.id, { url: '', price: '', note: '' });
		expect(getTickets(id, a.id)).toBeNull();
		expect(() => setHaveTicket(id, a.id, true)).toThrow('hasn’t added tickets');
		setTickets(id, host.id, { url: 'https://dice.fm/other-night', price: '', note: '' });
		expect(notes(b).length).toBe(before);
		expect(getTickets(id, a.id, 2000)).toMatchObject({ mine: false, canNudge: false });
		expect(() => nudgeTickets(id, host.id, 2000)).toThrow('last hour');
	});

	it('accounts export and delete their tickets', () => {
		const { id, host, a } = club();
		setTickets(id, host.id, { url: LINK, price: '', note: '' });
		setHaveTicket(id, a.id, true);
		expect(exportData(a.id)).toMatchObject({ ticket_holders: [{ event_id: id, user_id: a.id }] });
		deleteAccount(a.id);
		expect(names(getTickets(id, host.id)!.have)).toEqual([]);
	});
});
