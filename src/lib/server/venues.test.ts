import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { listVenues, lockVenue, MAX_EACH, MAX_VENUES, removeVenue, reopenVenue, suggestVenue, voteVenue } from './venues.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@venues.test`, name, 'correct-horse-9') as User;
const notes = (u: User) =>
	(db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY id').all(u.id) as { message: string }[]).map((r) => r.message);
const tally = (eventId: number, u: User) => listVenues(eventId, u.id).options.map((o) => [o.name, o.votes, o.mine]);
const MAP = 'https://maps.app.goo.gl/abc';

function night() {
	const host = user('Host');
	const [a, b, no, maybe] = [user('A'), user('B'), user('No'), user('Maybe')];
	const id = createEvent(host.id, { title: 'Saturday', mode: 'fixed', startsAt: '2099-07-04T20:00' });
	for (const g of [a, b, no, maybe]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, maybe.id, 'maybe');
	return { id, host, a, b, no, maybe };
}

describe('venue vote', () => {
	it('takes suggestions with an optional https link, without repeats, and counts the suggester as up for it', () => {
		const { id, a, b } = night();
		const stranger = user('Stranger');
		suggestVenue(id, a.id, ' The   Ox ', MAP);
		expect(tally(id, a)).toEqual([['The Ox', 1, true]]);
		expect(listVenues(id, b.id).options[0]).toMatchObject({ link: MAP, mine: false, voters: 'A' });
		expect(() => suggestVenue(id, b.id, 'the ox', '')).toThrow('already on the list');
		expect(() => suggestVenue(id, b.id, 'Sub Club', 'javascript:alert(1)')).toThrow('https://');
		expect(() => suggestVenue(id, b.id, 'Sub Club', 'http://subclub.co.uk')).toThrow('https://');
		expect(() => suggestVenue(id, b.id, '\u200B', '')).toThrow('name of the pub');
		expect(() => suggestVenue(id, stranger.id, 'Elsewhere', '')).toThrow('not invited');
		expect(() => listVenues(id, stranger.id)).toThrow('not invited');
		for (let i = 1; i <= MAX_EACH; i++) suggestVenue(id, b.id, `Pub ${i}`, '');
		expect(() => suggestVenue(id, b.id, 'One more', '')).toThrow(`suggested ${MAX_EACH} already`);
		const g = getEvent(id)!.invite_token;
		for (let i = MAX_EACH + 1; i < MAX_VENUES; i++) {
			const helper = user('Helper');
			joinByToken(g, helper.id);
			suggestVenue(id, helper.id, `Pub ${i}`, '');
		}
		expect(() => suggestVenue(id, a.id, 'One more', '')).toThrow('plenty of places');
	});

	it('lets everyone tick as many places as they’d go to, and untick them, idempotently', () => {
		const { id, host, a, b } = night();
		suggestVenue(id, a.id, 'The Ox', '');
		suggestVenue(id, b.id, 'Sub Club', '');
		const [ox, sub] = listVenues(id, a.id).options.map((o) => o.id);
		voteVenue(id, a.id, sub, true);
		voteVenue(id, a.id, sub, true); // a double tap changes nothing
		voteVenue(id, host.id, sub, true);
		expect(tally(id, a)).toEqual([['Sub Club', 3, true], ['The Ox', 1, true]]);
		voteVenue(id, a.id, ox, false);
		voteVenue(id, a.id, ox, false);
		expect(tally(id, a)).toEqual([['Sub Club', 3, true], ['The Ox', 0, false]]);
	});

	it('keeps ticks and removals inside their own event, and only the suggester or host removes', () => {
		const one = night();
		const two = night();
		suggestVenue(two.id, two.a.id, 'Elsewhere', '');
		suggestVenue(two.id, two.b.id, 'Mine', '');
		const [far, mine] = listVenues(two.id, two.a.id).options.map((o) => o.id);
		expect(() => voteVenue(two.id, one.a.id, far, true)).toThrow('not invited');
		expect(() => removeVenue(two.id, one.a.id, far)).toThrow('not invited');
		expect(() => lockVenue(two.id, one.host.id, far)).toThrow('Only the host');
		expect(listVenues(two.id, two.b.id).options.find((o) => o.id === mine)!.canRemove).toBe(true);
		removeVenue(two.id, two.b.id, mine);
		expect(() => voteVenue(one.id, one.a.id, far, true)).toThrow('isn’t on the list');
		expect(() => removeVenue(one.id, one.host.id, far)).toThrow('isn’t on the list');
		expect(() => lockVenue(one.id, one.host.id, far)).toThrow('isn’t on the list');
		expect(() => removeVenue(two.id, two.b.id, far)).toThrow('Only whoever suggested it');
		expect(listVenues(two.id, two.host.id).options[0].canRemove).toBe(true);
		removeVenue(two.id, two.host.id, far);
		expect(listVenues(two.id, two.a.id).options).toEqual([]);
		expect(db.prepare('SELECT COUNT(*) AS n FROM venue_votes WHERE option_id = ?').get(far)).toEqual({ n: 0 });
	});

	it('the host picks one, which closes the vote and tells everyone not out, once per place', () => {
		const { id, host, a, b, no, maybe } = night();
		setRsvp(id, no.id, 'no');
		suggestVenue(id, a.id, 'The Ox', MAP);
		suggestVenue(id, a.id, 'Sub Club', '');
		const [ox, sub] = listVenues(id, a.id).options.map((o) => o.id);
		expect(() => lockVenue(id, a.id, ox)).toThrow('Only the host');
		lockVenue(id, host.id, ox);
		expect(getEvent(id)).toMatchObject({ venue: 'The Ox', venue_link: MAP });
		expect(() => suggestVenue(id, b.id, 'Elsewhere', '')).toThrow('picked where');
		expect(() => voteVenue(id, b.id, sub, true)).toThrow('picked where');
		expect(() => removeVenue(id, a.id, sub)).toThrow('picked where');
		expect(() => lockVenue(id, host.id, sub)).toThrow('picked where');
		for (const u of [a, b, maybe]) expect(notes(u)).toEqual(['Saturday is at The Ox.']);
		expect(notes(no)).toEqual([]);
		expect(notes(host)).toEqual([]);
		expect(() => reopenVenue(id, a.id)).toThrow('Only the host');
		reopenVenue(id, host.id);
		expect(getEvent(id)).toMatchObject({ venue: '', venue_link: '' });
		lockVenue(id, host.id, ox);
		expect(notes(a)).toHaveLength(1);
		// The same place in different case isn't news either.
		reopenVenue(id, host.id);
		removeVenue(id, host.id, ox);
		suggestVenue(id, b.id, 'THE OX', '');
		lockVenue(id, host.id, listVenues(id, b.id).options.find((o) => o.name === 'THE OX')!.id);
		expect(notes(a)).toHaveLength(1);
		reopenVenue(id, host.id);
		lockVenue(id, host.id, sub);
		expect(notes(a)).toEqual(['Saturday is at The Ox.', 'Saturday is at Sub Club.']);
		expect(getEvent(id)!.venue_link).toBe('');
	});

	it('exports and deletes your ticks, and keeps your suggestions without your name', () => {
		const { id, a, b } = night();
		suggestVenue(id, a.id, 'The Ox', '');
		const ox = listVenues(id, a.id).options[0].id;
		voteVenue(id, b.id, ox, true);
		expect(exportData(a.id)).toMatchObject({ venue_votes: [{ option_id: ox }], venue_options: [{ name: 'The Ox' }] });
		deleteAccount(a.id);
		expect(tally(id, b)).toEqual([['The Ox', 1, true]]);
	});
});
