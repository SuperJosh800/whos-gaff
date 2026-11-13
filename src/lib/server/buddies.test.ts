import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { getBuddies, pairUp, pingBuddy } from './buddies.ts';
import { checkInHomeSafe } from './night.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@buddies.test`, name, 'correct-horse-9') as User;
const DURING = '2099-06-20T23:00';

/** A night with the host and `going` other people going, plus one maybe. */
function night(going: number) {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const people = Array.from({ length: going }, (_, i) => user(`P${i}`));
	const maybe = user('Maybe');
	for (const p of [...people, maybe]) joinByToken(getEvent(id)!.invite_token, p.id);
	for (const p of people) setRsvp(id, p.id, 'yes');
	return { id, host, people, maybe };
}
const join = (id: number) => {
	const p = user('New');
	joinByToken(getEvent(id)!.invite_token, p.id);
	setRsvp(id, p.id, 'yes');
	return p;
};
const sizes = (id: number, userId: number) => getBuddies(id, userId).groups.map((g) => g.length).sort();
const pairsOf = (id: number, userId: number) => getBuddies(id, userId).groups.map((g) => [...g].sort().join('+')).sort();
const notes = (userId: number, match: RegExp) => listNotifications(userId, 50).filter((x) => match.test(x.message)).map((x) => x.message);

describe('buddy system', () => {
	it('lets only the host pair up everyone going, with a three when the numbers are odd', () => {
		const { id, host, people, maybe } = night(4); // 5 going with the host
		expect(() => pairUp(id, people[0].id)).toThrow('Only the host');
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([2, 3]);
		const everyone = getBuddies(id, host.id).groups.flat().sort();
		expect(everyone).toEqual(['Host', 'P0', 'P1', 'P2', 'P3']);
		expect(getBuddies(id, maybe.id)).toMatchObject({ mine: [], unpaired: [] });
		const mine = getBuddies(id, people[0].id).mine;
		expect(notes(people[0].id, /Your buddy tonight/)).toEqual([`Your buddy tonight: ${mine.join(' and ')}. Look out for each other.`]);

		const solo = night(0);
		expect(() => pairUp(solo.id, solo.host.id)).toThrow('at least two');
	});

	it('pairs up newcomers without breaking up existing pairs, and puts a lone newcomer into a pair', () => {
		const { id, host, people } = night(3);
		pairUp(id, host.id);
		const before = pairsOf(id, host.id);
		expect(before).toHaveLength(2);
		const [x, y] = [join(id), join(id)];
		expect(getBuddies(id, host.id).unpaired.sort()).toEqual(['New', 'New']);
		pairUp(id, host.id);
		expect(pairsOf(id, host.id)).toEqual([...before, 'New+New'].sort());
		expect(getBuddies(id, x.id).mine).toEqual(['New']);
		expect(getBuddies(id, y.id).mine).toEqual(['New']);

		const z = join(id);
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([2, 2, 3]);
		// Z joins one pair, whose two people are told; nobody else is told again.
		expect(getBuddies(id, z.id).mine).toHaveLength(2);
		const toldTwice = [host, ...people, x, y].filter((p) => notes(p.id, /Your buddy tonight/).length === 2);
		expect(toldTwice).toHaveLength(2);
		expect(toldTwice.map((p) => getBuddies(id, p.id).mine)).toEqual(toldTwice.map(() => expect.arrayContaining(['New'])));
	});

	it('leaves someone without a buddy when theirs drops out, so the host can pair them again', () => {
		const { id, host, people } = night(3);
		pairUp(id, host.id);
		// The pair without the host: one of them drops out.
		const p0 = people.find((p) => !getBuddies(id, p.id).mine.includes('Host'))!;
		const partnerUser = people.find((p) => p.name === getBuddies(id, p0.id).mine[0])!;
		setRsvp(id, partnerUser.id, 'no');
		expect(getBuddies(id, p0.id).mine).toEqual([]);
		expect(getBuddies(id, host.id).unpaired).toEqual([p0.name]);
		// With 3 going now, P0 joins the remaining pair.
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([3]);
		expect(getBuddies(id, p0.id).mine).toHaveLength(2);
	});

	it('never makes more than one three as people join, and tells only people whose buddies changed', () => {
		const { id, host, people } = night(2);
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([3]);
		const first = [host, ...people];
		const a = join(id);
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([2, 2]);
		// One of the three moved to pair with A; that person, A and the two left together are all told.
		expect(first.filter((p) => notes(p.id, /Your buddy tonight/).length === 2)).toHaveLength(3);
		join(id);
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([2, 3]);
		for (let i = 0; i < 3; i++) join(id);
		pairUp(id, host.id);
		expect(sizes(id, host.id)).toEqual([2, 2, 2, 2]);
		const told = (p: User) => notes(p.id, /Your buddy tonight/).length;
		const counts = [...first, a].map(told);
		pairUp(id, host.id); // nothing to do: nobody is told
		expect([...first, a].map(told)).toEqual(counts);
	});

	it('reshuffles everyone when asked, keeping each person’s ping limit', () => {
		const { id, host, people } = night(4);
		pairUp(id, host.id);
		const t = Date.parse('2099-06-20T23:00:00Z');
		pingBuddy(id, people[0].id, DURING, t);
		const before = pairsOf(id, host.id);
		let changed = false;
		// 10 ways to split 5 people into a pair and a three: 20 reshuffles all matching is 1 in 10^20.
		for (let i = 0; i < 20 && !changed; i++) {
			pairUp(id, host.id, true);
			changed = pairsOf(id, host.id).join() !== before.join();
		}
		expect(changed).toBe(true);
		expect(sizes(id, host.id)).toEqual([2, 3]);
		expect(pingBuddy(id, people[0].id, DURING, t + 60_000)).toBeNull();
	});

	it('pings your buddy once the night starts, at most every five minutes', () => {
		const { id, host, people } = night(1);
		const [p0] = people;
		expect(() => pingBuddy(id, p0.id, DURING)).toThrow('haven’t got a buddy');
		pairUp(id, host.id);
		expect(() => pingBuddy(id, p0.id, '2099-06-20T20:00')).toThrow('once the night starts');
		const t = Date.parse('2099-06-20T23:00:00Z');
		expect(pingBuddy(id, p0.id, DURING, t)).toBe('Host');
		expect(pingBuddy(id, p0.id, DURING, t + 4 * 60_000)).toBeNull();
		pingBuddy(id, host.id, DURING, t + 60_000); // the host's own limit is separate
		pingBuddy(id, p0.id, DURING, t + 5 * 60_000);
		expect(notes(host.id, /looking for you/)).toEqual(['P0 is looking for you. Where are you?', 'P0 is looking for you. Where are you?']);
		expect(notes(p0.id, /looking for you/)).toEqual(['Host is looking for you. Where are you?']);
		checkInHomeSafe(id, host.id, DURING);
		expect(() => pingBuddy(id, p0.id, DURING, t + 20 * 60_000)).toThrow('already home safe');
	});

	it('tells your buddies, and only them, once when you check in home safe', () => {
		const { id, host, people } = night(3);
		pairUp(id, host.id, true);
		const [p0] = people;
		checkInHomeSafe(id, p0.id, DURING);
		checkInHomeSafe(id, p0.id, '2099-06-21T01:00');
		const buddy = getBuddies(id, p0.id).mine[0];
		for (const p of [host, ...people]) {
			expect(notes(p.id, /home safe/)).toEqual(p.name === buddy ? ['Your buddy P0 is home safe.'] : []);
		}
	});

	it('forgets a deleted account’s place, leaving their buddy unpaired', () => {
		const { id, host, people } = night(1);
		pairUp(id, host.id);
		deleteAccount(people[0].id);
		expect(getBuddies(id, host.id)).toMatchObject({ groups: [], mine: [], unpaired: ['Host'] });
	});
});
