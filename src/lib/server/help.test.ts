import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { askForHelp, listHelp, onMyWay, purgeHelp, readSpot, resolveHelp } from './help.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';
import { db } from './db.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@help.test`, name, 'correct-horse-9') as User;
const START = '2099-06-20T21:00';
const DURING = '2099-06-20T23:30';
const SPOT = { lat: 55.8721, lng: -4.2892, accuracy: 25 };

/** Host, Sam and Alex going, Maybe not. */
function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: START });
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

describe('come get me', () => {
	it('tells everyone else going, with the location only for people going', () => {
		const { id, host, sam, alex, maybe } = night();
		askForHelp(id, sam.id, SPOT, ' outside the chippy ', DURING);
		for (const p of [host, alex]) expect(notes(p.id, /come get/)).toEqual(['Sam needs someone to come get them. Their location is on the Night tab. (Night)']);
		expect(notes(sam.id, /come get/)).toEqual([]);
		expect(notes(maybe.id, /come get/)).toEqual([]);
		const [seen] = listHelp(id, alex.id, DURING);
		expect(seen).toMatchObject({ name: 'Sam', note: 'outside the chippy', accuracy: 25, mine: false, map: 'https://www.google.com/maps/search/?api=1&query=55.8721,-4.2892' });
		expect(listHelp(id, sam.id, DURING)[0].mine).toBe(true);
		expect(listHelp(id, maybe.id, DURING)).toEqual([]);
	});

	it('works without a location', () => {
		const { id, sam, alex } = night();
		askForHelp(id, sam.id, null, '', DURING);
		expect(notes(alex.id, /come get/)).toEqual(['Sam needs someone to come get them. (Night)']);
		expect(listHelp(id, alex.id, DURING)[0].map).toBeNull();
	});

	it('only works for people going, from 3 hours before the night starts until the next day', () => {
		const { id, sam, maybe } = night();
		expect(() => askForHelp(id, maybe.id, SPOT, '', DURING)).toThrow('RSVP “going”');
		expect(() => askForHelp(id, user('Stranger').id, SPOT, '', DURING)).toThrow('not invited');
		expect(() => askForHelp(id, sam.id, SPOT, '', '2099-06-20T17:59')).toThrow('3 hours before');
		expect(() => askForHelp(id, sam.id, SPOT, '', '2099-06-21T21:00')).toThrow('3 hours before');
		askForHelp(id, sam.id, SPOT, '', '2099-06-20T18:00');
		askForHelp(id, sam.id, SPOT, '', '2099-06-21T20:59');
		expect(listHelp(id, sam.id, '2099-06-21T20:59')).toHaveLength(1);
	});

	it('keeps one request per person, and re-tells people about it at most 3 times in 10 minutes', () => {
		const { id, sam, alex } = night();
		expect(askForHelp(id, sam.id, null, 'by the bins', DURING)).toEqual({ told: true });
		const told = [0, 1, 2, 3].map((i) => askForHelp(id, sam.id, { lat: 55 + i, lng: -4, accuracy: 10 }, 'by the bins', DURING).told);
		expect(told).toEqual([true, true, true, false]);
		expect(notes(alex.id, /come get/)).toHaveLength(4);
		const all = listHelp(id, alex.id, DURING);
		expect(all).toHaveLength(1);
		expect(all[0].map).toContain('query=58,-4');
		// Someone else's re-sends have their own allowance.
		askForHelp(id, alex.id, null, '', DURING);
		expect(askForHelp(id, alex.id, null, 'still here', DURING).told).toBe(true);
	});

	it('keeps the last good location when a re-send has none, and updates the note', () => {
		const { id, sam, alex } = night();
		askForHelp(id, sam.id, SPOT, 'by the bins', DURING);
		askForHelp(id, sam.id, null, `round the back ${'x'.repeat(300)}`, DURING);
		const [h] = listHelp(id, alex.id, DURING);
		expect(h.map).toContain('query=55.8721,-4.2892');
		expect(h.accuracy).toBe(25);
		expect(h.note).toHaveLength(200);
		expect(h.note.startsWith('round the back')).toBe(true);
	});

	it('always tells people about a new request, even straight after the last one was OK', () => {
		const { id, sam, alex } = night();
		askForHelp(id, sam.id, SPOT, '', DURING);
		askForHelp(id, sam.id, SPOT, '', DURING);
		askForHelp(id, sam.id, SPOT, '', DURING);
		resolveHelp(id, sam.id, DURING);
		expect(askForHelp(id, sam.id, null, 'really need help now', DURING)).toEqual({ told: true });
		expect(notes(alex.id, /come get/)).toHaveLength(4);
	});

	it('stops telling people after 5 new requests in an hour, and then doesn’t stand them down either', () => {
		const { id, sam, alex } = night();
		for (let i = 0; i < 5; i++) {
			expect(askForHelp(id, sam.id, null, '', DURING).told).toBe(true);
			resolveHelp(id, sam.id, DURING);
		}
		expect(askForHelp(id, sam.id, null, '', DURING).told).toBe(false);
		resolveHelp(id, sam.id, DURING);
		expect(notes(alex.id, /come get/)).toHaveLength(5);
		expect(notes(alex.id, /OK now/)).toHaveLength(5);
		expect(notes(sam.id, /OK now|come get/)).toEqual([]);
	});

	it('starts afresh after 12 hours, without the old “on my way”s', () => {
		const { id, sam, alex } = night();
		askForHelp(id, sam.id, SPOT, '', DURING);
		const old = listHelp(id, alex.id, DURING)[0].id;
		onMyWay(id, alex.id, old);
		askForHelp(id, sam.id, null, '', '2099-06-21T12:00');
		const [h] = listHelp(id, sam.id, '2099-06-21T12:00');
		expect(h.id).not.toBe(old);
		expect(h.coming).toEqual([]);
		expect(h.map).toBeNull();
	});

	it('lets you see and stand down your own request after you stop going', () => {
		const { id, sam, alex } = night();
		askForHelp(id, sam.id, SPOT, '', DURING);
		setRsvp(id, sam.id, 'no');
		expect(listHelp(id, sam.id, DURING).map((h) => h.mine)).toEqual([true]);
		resolveHelp(id, sam.id, DURING);
		expect(listHelp(id, alex.id, DURING)).toEqual([]);
	});

	it('tells the person once when someone is on their way, and not for their own request', () => {
		const { id, host, sam, alex, maybe } = night();
		askForHelp(id, sam.id, SPOT, '', DURING);
		const request = listHelp(id, alex.id, DURING)[0].id;
		onMyWay(id, alex.id, request);
		onMyWay(id, alex.id, request);
		expect(notes(sam.id, /on their way/)).toEqual(['Alex is on their way to you.']);
		expect(listHelp(id, sam.id, DURING)[0].coming).toEqual(['Alex']);
		expect(listHelp(id, alex.id, DURING)[0].iAmComing).toBe(true);
		expect(listHelp(id, host.id, DURING)[0].iAmComing).toBe(false);
		onMyWay(id, alex.id, request, false);
		onMyWay(id, alex.id, request, false);
		expect(notes(sam.id, /can’t come/)).toEqual(['Alex can’t come after all.']);
		expect(listHelp(id, sam.id, DURING)[0].coming).toEqual([]);
		expect(() => onMyWay(id, sam.id, request)).toThrow('your own');
		expect(() => onMyWay(id, maybe.id, request)).toThrow('RSVP “going”');
		const other = night();
		expect(() => onMyWay(other.id, other.alex.id, request)).toThrow('OK now');
	});

	it('wipes the location and stands everyone down once they’re OK', () => {
		const { id, host, sam, alex } = night();
		askForHelp(id, sam.id, SPOT, '', DURING);
		const request = listHelp(id, alex.id, DURING)[0].id;
		resolveHelp(id, sam.id, DURING);
		resolveHelp(id, sam.id, DURING);
		for (const p of [host, alex]) expect(notes(p.id, /OK now/)).toEqual(['Sam is OK now, no need to come. (Night)']);
		expect(listHelp(id, alex.id, DURING)).toEqual([]);
		expect(db.prepare('SELECT lat, lng, accuracy FROM help_requests WHERE id = ?').get(request)).toEqual({ lat: null, lng: null, accuracy: null });
		expect(() => onMyWay(id, alex.id, request)).toThrow('OK now');
	});

	it('drops requests from the list after 12 hours and deletes them after a week, or with the account', () => {
		const { id, sam, alex } = night();
		askForHelp(id, sam.id, SPOT, '', DURING);
		expect(listHelp(id, alex.id, '2099-06-21T11:30')).toHaveLength(1);
		expect(listHelp(id, alex.id, '2099-06-21T11:31')).toEqual([]);
		const count = () => (db.prepare('SELECT COUNT(*) AS n FROM help_requests WHERE event_id = ?').get(id) as { n: number }).n;
		const lat = () => (db.prepare('SELECT lat FROM help_requests WHERE event_id = ?').get(id) as { lat: number | null }).lat;
		purgeHelp('2099-06-21T11:30');
		expect(lat()).toBe(SPOT.lat);
		purgeHelp('2099-06-21T11:31');
		expect(lat()).toBeNull();
		purgeHelp('2099-06-27T23:30');
		expect(count()).toBe(1);
		purgeHelp('2099-06-27T23:31');
		expect(count()).toBe(0);
		askForHelp(id, alex.id, SPOT, '', DURING);
		expect((exportData(alex.id).help_requests as { lat: number }[]).map((r) => r.lat)).toEqual([SPOT.lat]);
		deleteAccount(alex.id);
		expect(count()).toBe(0);
	});

	it('reads a location from the form only when it makes sense', () => {
		expect(readSpot('', '', '')).toBeNull();
		expect(readSpot('55.87', '-4.29', '24.6')).toEqual({ lat: 55.87, lng: -4.29, accuracy: 25 });
		for (const [lat, lng] of [['91', '0'], ['0', '-181'], ['55', ''], ['', '-4'], ['abc', '1']])
			expect(() => readSpot(lat, lng, '10')).toThrow('location');
	});
});
