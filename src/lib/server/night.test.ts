import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { listHomePlans, setHomePlan, taxiShares } from './night.ts';
import { listNotifications } from './notifications.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@night.test`, name, 'correct-horse-9') as User;

/** A night with the host and the named people going. */
function night(...names: string[]) {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const people = names.map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		setRsvp(id, p.id, 'yes');
		return p;
	});
	return { id, host, people };
}
const shares = (id: number) => taxiShares(listHomePlans(id)).map((g) => g.people.map((p) => p.name).join('+'));
const taxiNotes = (userId: number) => listNotifications(userId, 50).filter((x) => /Share a taxi/.test(x.message)).map((x) => x.message);

describe('share a taxi', () => {
	it('matches people heading to the same area whatever the spelling, biggest group first', () => {
		const { id, host, people } = night('Alex', 'Cat', 'Dan', 'Eve');
		const [alex, cat, dan, eve] = people;
		setHomePlan(id, host.id, 'taxi', '', 'Partick');
		setHomePlan(id, alex.id, 'night-bus', '', 'The West End');
		setHomePlan(id, cat.id, 'taxi', '', '  west   end. ');
		setHomePlan(id, dan.id, 'walking', '', 'Wést-End');
		setHomePlan(id, eve.id, 'taxi', '', 'partick');
		expect(shares(id)).toEqual(['Alex+Cat+Dan', 'Eve+Host']);
		expect(taxiShares(listHomePlans(id))[0].area).toBe('The West End');
		expect(listHomePlans(id).find((p) => p.user_id === cat.id)!.area).toBe('west   end');
	});

	it('leaves out people on their own, without an area, or no longer going', () => {
		const { id, host, people } = night('Alex', 'Cat');
		const [alex, cat] = people;
		setHomePlan(id, host.id, 'taxi', '', 'Shawlands');
		setHomePlan(id, alex.id, 'taxi', 'with Sam', '');
		setHomePlan(id, cat.id, 'taxi', '', 'Dennistoun');
		expect(shares(id)).toEqual([]);
		setHomePlan(id, cat.id, 'taxi', '', 'Shawlands');
		expect(shares(id)).toEqual(['Cat+Host']);
		setRsvp(id, cat.id, 'no');
		expect(shares(id)).toEqual([]);
	});

	it('tells the people already heading that way once, when someone picks their area', () => {
		const { id, host, people } = night('Alex', 'Cat', 'Dan');
		const [alex, cat, dan] = people;
		setHomePlan(id, alex.id, 'taxi', '', 'Partick');
		setHomePlan(id, dan.id, 'taxi', '', 'Govan');
		setHomePlan(id, cat.id, 'night-bus', '', 'partick.');
		expect(taxiNotes(alex.id)).toEqual(['Cat is heading to Partick too. Share a taxi? (Night)']);
		expect(taxiNotes(cat.id)).toEqual([]);
		expect(taxiNotes(dan.id)).toEqual([]);
		expect(taxiNotes(host.id)).toEqual([]);
		// Saving the same area again, even spelt differently, stays quiet.
		setHomePlan(id, cat.id, 'taxi', 'leaving at 1', 'Partick.');
		expect(taxiNotes(alex.id)).toHaveLength(1);
		// Cat telling Alex is not repeated when Alex re-saves, but Alex moving to Govan tells Dan.
		setHomePlan(id, alex.id, 'taxi', 'actually', 'Partick');
		setHomePlan(id, alex.id, 'taxi', '', 'Govan');
		expect(taxiNotes(cat.id)).toEqual([]);
		expect(taxiNotes(dan.id)).toEqual(['Alex is heading to Govan too. Share a taxi? (Night)']);
	});

	it('stops telling people after three area changes in an hour, but still saves the plan', () => {
		const { id, people } = night('Alex', 'Cat');
		const [alex, cat] = people;
		setHomePlan(id, alex.id, 'taxi', '', 'Partick');
		for (const area of ['Partick', 'Govan', 'Partick', 'Govan', 'Partick']) setHomePlan(id, cat.id, 'taxi', '', area);
		expect(taxiNotes(alex.id)).toHaveLength(2);
		expect(shares(id)).toEqual(['Alex+Cat']);
	});

	it('does not let someone not going tell anyone', () => {
		const { id, people } = night('Alex');
		const outsider = user('Maybe');
		joinByToken(getEvent(id)!.invite_token, outsider.id);
		setHomePlan(id, people[0].id, 'taxi', '', 'Partick');
		setHomePlan(id, outsider.id, 'taxi', '', 'Partick');
		expect(taxiNotes(people[0].id)).toEqual([]);
		expect(shares(id)).toEqual([]);
	});
});
