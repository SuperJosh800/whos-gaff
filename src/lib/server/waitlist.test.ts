import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, listWaitlist, setGuestLimit, setRsvp } from './events.ts';
import { goingPeople } from './money.ts';
import { deleteAccount, exportData } from './account.ts';
import { makeRepeats, setRepeat } from './repeats.ts';
import { listDashboardEvents } from './dashboard.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@waitlist.test`, name, 'correct-horse-9') as User;
const notes = (u: User) =>
	(db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY id').all(u.id) as { message: string }[]).map((r) => r.message);
const going = (id: number) => goingPeople(id).map((p) => p.name);
const queue = (id: number) => listWaitlist(id).map((p) => p.name);
const SPOT = 'A spot opened up at Gaff. You’re going!';

/** A gaff with room for the host and two guests. */
function gaff() {
	const host = user('Host');
	const [a, b, c, d] = [user('A'), user('B'), user('C'), user('D')];
	const id = createEvent(host.id, { title: 'Gaff', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	for (const g of [a, b, c, d]) joinByToken(getEvent(id)!.invite_token, g.id);
	setGuestLimit(id, host.id, 3);
	return { id, host, a, b, c, d };
}

describe('guest limit and waitlist', () => {
	it('only the host sets a limit, from 2 (counting the host) to 500', () => {
		const { id, host, a } = gaff();
		expect(() => setGuestLimit(id, a.id, 10)).toThrow('Only the host');
		for (const bad of [1, 0, 501, 2.5, NaN]) expect(() => setGuestLimit(id, host.id, bad)).toThrow('between 2 and 500');
		setGuestLimit(id, host.id, null);
		expect(getEvent(id)!.guest_limit).toBeNull();
	});

	it('counts the host, and puts anyone past the limit on the waitlist in order', () => {
		const { id, host, a, b, c, d } = gaff();
		expect(setRsvp(id, a.id, 'yes')).toBe('set');
		expect(setRsvp(id, b.id, 'yes')).toBe('set');
		expect(setRsvp(id, c.id, 'yes')).toBe('waitlisted');
		expect(setRsvp(id, d.id, 'yes')).toBe('waitlisted');
		expect(setRsvp(id, c.id, 'yes')).toBe('waitlisted'); // asking again keeps their place
		expect(going(id)).toEqual(['Host', 'A', 'B']);
		expect(queue(id)).toEqual(['C', 'D']);
		// Saying yes again when you're already going isn't blocked by the limit, and nor is the host.
		expect(setRsvp(id, a.id, 'yes')).toBe('set');
		expect(setRsvp(id, host.id, 'yes')).toBe('set');
		expect(going(id)).toEqual(['Host', 'A', 'B']);
		expect(queue(id)).toEqual(['C', 'D']);
	});

	it('keeps a waitlisted person’s earlier answer, and the dashboard shows them waiting, not to-do', () => {
		const { id, a, b, c, d } = gaff();
		setRsvp(id, a.id, 'yes');
		setRsvp(id, b.id, 'yes');
		setRsvp(id, c.id, 'maybe');
		setRsvp(id, c.id, 'yes');
		setRsvp(id, d.id, 'yes');
		expect(db.prepare('SELECT response FROM rsvps WHERE event_id = ? AND user_id = ?').get(id, c.id)).toEqual({ response: 'maybe' });
		expect(db.prepare('SELECT response FROM rsvps WHERE event_id = ? AND user_id = ?').get(id, d.id)).toBeUndefined();
		const card = (u: User) => listDashboardEvents(u.id, '2099-01-01T00:00').upcoming.find((e) => e.id === id)!;
		expect(card(d)).toMatchObject({ todo: null, waitlisted: 1, waiting: 2, maybe: 0 });
		expect(card(c)).toMatchObject({ todo: null, waitlisted: 1 });
		expect(card(a)).toMatchObject({ todo: null, waitlisted: 0, going: 2 });
	});

	it('gives a freed spot to the first on the waitlist and tells them, and maybe or no leaves the queue', () => {
		const { id, a, b, c, d } = gaff();
		setRsvp(id, a.id, 'yes');
		setRsvp(id, b.id, 'yes');
		setRsvp(id, c.id, 'yes');
		setRsvp(id, d.id, 'yes');
		setRsvp(id, a.id, 'maybe');
		expect(going(id)).toEqual(['Host', 'B', 'C']);
		expect(queue(id)).toEqual(['D']);
		expect(notes(c)).toEqual([SPOT]);
		expect(notes(d)).toEqual([]);
		setRsvp(id, d.id, 'no');
		expect(queue(id)).toEqual([]);
		setRsvp(id, b.id, 'no'); // nobody waiting: the spot just stays free
		expect(going(id)).toEqual(['Host', 'C']);
		expect(setRsvp(id, a.id, 'yes')).toBe('set');
	});

	it('raising or lifting the limit lets people in; lowering it bumps nobody', () => {
		const { id, host, a, b, c, d } = gaff();
		for (const u of [a, b, c, d]) setRsvp(id, u.id, 'yes');
		setGuestLimit(id, host.id, 4);
		expect(going(id)).toEqual(['Host', 'A', 'B', 'C']);
		expect(queue(id)).toEqual(['D']);
		setGuestLimit(id, host.id, 2);
		expect(going(id)).toEqual(['Host', 'A', 'B', 'C']);
		setRsvp(id, a.id, 'no'); // still over the new limit, so nobody moves up
		expect(queue(id)).toEqual(['D']);
		setGuestLimit(id, host.id, null);
		expect(going(id)).toEqual(['Host', 'B', 'C', 'D']);
		expect(notes(d)).toEqual([SPOT]);
	});

	it('a deleted account frees its spot, and waitlist rows are exported and deleted', () => {
		const { id, a, b, c } = gaff();
		setRsvp(id, a.id, 'yes');
		setRsvp(id, b.id, 'yes');
		setRsvp(id, c.id, 'yes');
		expect(exportData(c.id)).toMatchObject({ waitlist: [{ event_id: id, user_id: c.id }] });
		deleteAccount(a.id);
		expect(going(id)).toEqual(['Host', 'B', 'C']);
		expect(notes(c)).toEqual([SPOT]);
		deleteAccount(c.id);
		expect(db.prepare('SELECT COUNT(*) AS n FROM waitlist WHERE user_id = ?').get(c.id)).toEqual({ n: 0 });
	});

	it('someone taking over a deleted host’s night leaves the waitlist, and the next in line gets the spot', () => {
		const { id, host, a, b, c, d } = gaff();
		// C joined the event first, so C takes over if the host goes.
		db.prepare(`UPDATE event_members SET joined_at = '2000-01-01' WHERE event_id = ? AND user_id = ?`).run(id, c.id);
		setRsvp(id, a.id, 'yes');
		setRsvp(id, b.id, 'yes');
		setRsvp(id, c.id, 'yes');
		setRsvp(id, d.id, 'yes');
		deleteAccount(host.id);
		expect(getEvent(id)!.host_id).toBe(c.id);
		expect(queue(id)).toEqual(['D']);
		setRsvp(id, a.id, 'no');
		expect(going(id)).toEqual(['B', 'C', 'D']);
		expect(notes(c)).toEqual([]);
		expect(notes(d)).toEqual([SPOT]);
	});

	it('repeat nights keep the limit', () => {
		const { id, host } = gaff();
		setRepeat(id, host.id, 7);
		makeRepeats('2099-06-20T21:00');
		const next = (db.prepare('SELECT id FROM events WHERE repeated_from = ?').get(id) as { id: number }).id;
		expect(getEvent(next)!.guest_limit).toBe(3);
	});
});
