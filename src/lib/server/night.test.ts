import { afterEach, describe, expect, it, vi } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { checkInHomeSafe, comeBack, headOff, listCheckIns, listHomePlans, setHomePlan, taxiShares } from './night.ts';
import { pairUp } from './buddies.ts';
import { getRounds, recordRound } from './money.ts';
import { exportData } from './account.ts';
import { listNotifications } from './notifications.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@night.test`, name, 'correct-horse-9') as User;

/** A night with the host and the named people going. */
function night(...names: string[]) {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const people = names.map((name) => going(id, user(name)));
	return { id, host, people };
}
function going(id: number, p: User) {
	joinByToken(getEvent(id)!.invite_token, p.id);
	setRsvp(id, p.id, 'yes');
	return p;
}
const shares = (id: number) => taxiShares(listHomePlans(id)).map((g) => g.people.map((p) => p.name).join('+'));
const taxiNotes = (userId: number) => listNotifications(userId, 50).filter((x) => /Share a taxi/.test(x.message)).map((x) => x.message);
const areaOf = (id: number, userId: number) => listHomePlans(id).find((p) => p.user_id === userId)!.area;

afterEach(() => {
	vi.useRealTimers();
});

describe('share a taxi', () => {
	it('matches people heading to the same area whatever the spelling, biggest group first', () => {
		const { id, host, people } = night('Abe', 'Cat', 'Dan', 'Eve');
		const [abe, cat, dan, eve] = people;
		setHomePlan(id, host.id, 'taxi', '', 'Partick');
		setHomePlan(id, abe.id, 'taxi', '', 'partick');
		setHomePlan(id, cat.id, 'night-bus', '', 'The West End');
		setHomePlan(id, dan.id, 'taxi', '', '  west   end. ');
		setHomePlan(id, eve.id, 'walking', '', 'Wést-End');
		expect(shares(id)).toEqual(['Cat+Dan+Eve', 'Abe+Host']);
		expect(taxiShares(listHomePlans(id))[0].area).toBe('The West End');
	});

	it('tidies the area without eating brackets, and keeps it to 60 characters', () => {
		const { id, people } = night('Abe');
		setHomePlan(id, people[0].id, 'taxi', '', '  west   end. ');
		expect(areaOf(id, people[0].id)).toBe('west   end');
		setHomePlan(id, people[0].id, 'taxi', '', 'Partick (West)!');
		expect(areaOf(id, people[0].id)).toBe('Partick (West)');
		setHomePlan(id, people[0].id, 'taxi', '', `${'a'.repeat(59)} bcd`);
		expect(areaOf(id, people[0].id)).toBe('a'.repeat(59));
	});

	it('leaves out people on their own, without an area, or no longer going', () => {
		const { id, host, people } = night('Abe', 'Cat');
		const [abe, cat] = people;
		setHomePlan(id, host.id, 'taxi', '', 'Shawlands');
		setHomePlan(id, abe.id, 'taxi', 'with Sam', '');
		setHomePlan(id, cat.id, 'taxi', '', 'Dennistoun');
		expect(shares(id)).toEqual([]);
		setHomePlan(id, cat.id, 'taxi', '', 'Shawlands');
		expect(shares(id)).toEqual(['Cat+Host']);
		setRsvp(id, cat.id, 'no');
		expect(shares(id)).toEqual([]);
	});

	it('only lets people going add a plan', () => {
		const { id } = night('Abe');
		const maybe = user('Maybe');
		joinByToken(getEvent(id)!.invite_token, maybe.id);
		setRsvp(id, maybe.id, 'maybe');
		expect(() => setHomePlan(id, maybe.id, 'taxi', '', 'Partick')).toThrow('RSVP “going”');
		expect(() => setHomePlan(id, user('Stranger').id, 'taxi', '', 'Partick')).toThrow('not invited');
	});

	it('tells each person once that someone is heading their way, in their own spelling', () => {
		const { id, host, people } = night('Abe', 'Cat', 'Dan');
		const [abe, cat, dan] = people;
		setHomePlan(id, abe.id, 'taxi', '', 'Partick');
		setHomePlan(id, dan.id, 'taxi', '', 'Govan');
		setHomePlan(id, cat.id, 'night-bus', '', 'partick.');
		expect(taxiNotes(abe.id)).toEqual(['Cat is heading to Partick too. Share a taxi or go together? (Night)']);
		expect([taxiNotes(cat.id), taxiNotes(dan.id), taxiNotes(host.id)]).toEqual([[], [], []]);
		// Re-saving, or clearing the area and putting it back, doesn't tell Abe again.
		setHomePlan(id, cat.id, 'taxi', 'leaving at 1', 'Partick');
		setHomePlan(id, cat.id, 'taxi', '', '');
		setHomePlan(id, cat.id, 'taxi', '', 'Partick');
		expect(taxiNotes(abe.id)).toHaveLength(1);
		// Cat picked Partick knowing Abe was there, so Abe re-saving doesn't tell Cat. Abe moving tells Dan.
		setHomePlan(id, abe.id, 'taxi', 'actually', 'Partick');
		setHomePlan(id, abe.id, 'taxi', '', 'Govan');
		expect(taxiNotes(cat.id)).toEqual([]);
		expect(taxiNotes(dan.id)).toEqual(['Abe is heading to Govan too. Share a taxi or go together? (Night)']);
	});

	it('does not tell someone who has stopped going', () => {
		const { id, people } = night('Abe', 'Cat');
		const [abe, cat] = people;
		setHomePlan(id, abe.id, 'taxi', '', 'Partick');
		setRsvp(id, abe.id, 'no');
		setHomePlan(id, cat.id, 'taxi', '', 'Partick');
		expect(taxiNotes(abe.id)).toEqual([]);
	});

	it('still tells people after someone tries a few other areas first', () => {
		const { id, people } = night('Abe', 'Cat');
		const [abe, cat] = people;
		setHomePlan(id, abe.id, 'taxi', '', 'Partick');
		for (const area of ['Glasgow', 'Southside', 'Shawlands', 'Govan', 'Partick']) setHomePlan(id, cat.id, 'taxi', '', area);
		expect(taxiNotes(abe.id)).toHaveLength(1);
	});

	it('gives each person at most 3 of these an hour on each night, and still saves the plans', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2099-06-01T23:00:00Z'));
		const { id, people } = night('Abe');
		const abe = people[0];
		setHomePlan(id, abe.id, 'taxi', '', 'Partick');
		const joinPartick = () => setHomePlan(id, going(id, user('New')).id, 'taxi', '', 'Partick');
		for (let i = 0; i < 4; i++) joinPartick();
		expect(taxiNotes(abe.id)).toHaveLength(3);
		expect(shares(id)[0].split('+')).toHaveLength(5);
		// The limit is per night: Abe is told straight away on another one.
		const other = night();
		going(other.id, abe);
		setHomePlan(other.id, abe.id, 'taxi', '', 'Partick');
		setHomePlan(other.id, other.host.id, 'taxi', '', 'Partick');
		expect(taxiNotes(abe.id)).toHaveLength(4);
		vi.setSystemTime(new Date('2099-06-01T23:59:00Z'));
		joinPartick();
		expect(taxiNotes(abe.id)).toHaveLength(4);
		vi.setSystemTime(new Date('2099-06-02T00:01:00Z'));
		joinPartick();
		expect(taxiNotes(abe.id)).toHaveLength(5);
	});
});

describe('I’m off', () => {
	const offOf = (id: number, userId: number) => listCheckIns(id).find((c) => c.user_id === userId)!.off;
	const nextRound = (id: number) => getRounds(id)[0].next?.name;
	const offNotes = (userId: number) => listNotifications(userId, 50).filter((x) => /headed off/.test(x.message)).map((x) => x.message);

	it('tells only your buddy, once, and the rounds pass you over until you’re back', () => {
		const { id, host, people } = night('Abe');
		const [abe] = people;
		pairUp(id, host.id);
		const cat = going(id, user('Cat'));
		const maybe = user('Maybe');
		joinByToken(getEvent(id)!.invite_token, maybe.id);
		expect(() => headOff(id, abe.id, '2099-06-20T20:59')).toThrow('once the night has started');
		expect(() => headOff(id, maybe.id, '2099-06-20T23:00')).toThrow('RSVP “going”');
		expect(nextRound(id)).toBe('Host');
		recordRound(id, host.id, null, host.id, false);
		expect(nextRound(id)).toBe('Abe');

		headOff(id, abe.id, '2099-06-20T23:30');
		expect(offNotes(host.id)).toEqual(['Your buddy Abe has headed off. They’ll check in when they’re home.']);
		expect(offNotes(cat.id)).toEqual([]);
		expect(offOf(id, abe.id)).toBe('2099-06-20T23:30');
		expect(nextRound(id)).toBe('Cat');
		expect(getRounds(id)[0].tally.find((t) => t.id === abe.id)!.gone).toBe(true);

		comeBack(id, abe.id);
		expect(offOf(id, abe.id)).toBeNull();
		expect(nextRound(id)).toBe('Abe');
		headOff(id, abe.id, '2099-06-20T23:45');
		headOff(id, abe.id, '2099-06-20T23:50');
		comeBack(id, abe.id);
		headOff(id, abe.id, '2099-06-20T23:55');
		comeBack(id, abe.id);
		headOff(id, abe.id, '2099-06-20T23:58');
		headOff(id, abe.id, '2099-06-20T23:59');
		expect(offNotes(host.id)).toHaveLength(1);
		expect(offOf(id, abe.id)).toBe('2099-06-20T23:58');
		expect(exportData(abe.id).heading_off).toMatchObject([{ event_id: id, at: '2099-06-20T23:58' }]);
	});

	it('tells a buddy paired after you left when you head off again, and closes a day after the start', () => {
		const { id, host, people } = night('Abe');
		const [abe] = people;
		headOff(id, abe.id, '2099-06-20T23:00');
		expect(offNotes(host.id)).toEqual([]);
		pairUp(id, host.id);
		comeBack(id, abe.id);
		headOff(id, abe.id, '2099-06-20T23:10');
		expect(offNotes(host.id)).toHaveLength(1);
		expect(() => headOff(id, host.id, '2099-06-21T21:00')).toThrow('long over');
		headOff(id, host.id, '2099-06-21T20:59');
		expect(() => comeBack(id, user('Stranger').id)).toThrow('not invited');
	});

	it('lists people still out first, then headed off, then home, and has nobody to buy a round when all have gone', () => {
		const { id, host, people } = night('Ann', 'Abe', 'Cat');
		const [ann, abe, cat] = people;
		headOff(id, ann.id, '2099-06-20T23:00');
		checkInHomeSafe(id, abe.id, '2099-06-20T23:30');
		expect(listCheckIns(id).map((c) => c.name)).toEqual(['Cat', 'Host', 'Ann', 'Abe']);
		headOff(id, host.id, '2099-06-20T23:40');
		expect(nextRound(id)).toBe('Cat');
		headOff(id, cat.id, '2099-06-20T23:50');
		expect(nextRound(id)).toBeUndefined();
	});

	it('passes over people home safe, and doesn’t let them head off again', () => {
		const { id, host, people } = night('Abe', 'Cat');
		const [abe] = people;
		recordRound(id, host.id, null, host.id, false);
		checkInHomeSafe(id, abe.id, '2099-06-21T00:30');
		expect(nextRound(id)).toBe('Cat');
		expect(() => headOff(id, abe.id, '2099-06-21T00:40')).toThrow('already home');
	});
});
