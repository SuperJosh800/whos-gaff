import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, setRsvp } from './events.ts';
import { createGroup, joinGroupByToken } from './groups.ts';
import { bestRated, getRating, rateNight } from './ratings.ts';
import { yearReview } from './yearReview.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@rate.test`, name, 'correct-horse-9') as User;
const START = '2098-06-20T21:00';
const AFTER = '2098-06-21T11:00';

/** Ana made the group and hosts; Ben and Cat are going, Dan said maybe. */
function crew() {
	const [ana, ben, cat, dan] = ['Ana', 'Ben', 'Cat', 'Dan'].map(user);
	const id = createGroup(ana.id, 'Crew');
	const token = (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;
	for (const u of [ben, cat, dan]) joinGroupByToken(token, u.id);
	const night = (startsAt = START, title = `Night ${startsAt}`) => {
		const e = createEvent(ana.id, { title, mode: 'fixed', startsAt, groupId: id });
		for (const u of [ben, cat]) setRsvp(e, u.id, 'yes');
		setRsvp(e, dan.id, 'maybe');
		return e;
	};
	return { id, ana, ben, cat, dan, night };
}

describe('rate the night', () => {
	it('opens at the start for a week, for people who went, and takes 1 to 5 stars', () => {
		const { ana, ben, dan, night } = crew();
		const e = night();
		expect(() => rateNight(e, ben.id, 4, '2098-06-20T20:59')).toThrow('once it’s started');
		rateNight(e, ben.id, 4, START);
		rateNight(e, ben.id, 2, '2098-06-27T20:59');
		expect(() => rateNight(e, ben.id, 5, '2098-06-27T21:00')).toThrow('closed');
		expect(() => rateNight(e, dan.id, 5, AFTER)).toThrow('Only people who went');
		for (const bad of [0, 6, 3.5, NaN]) expect(() => rateNight(e, ana.id, bad, AFTER)).toThrow('1 to 5');
		expect(getRating(e, ben.id, START, AFTER)).toEqual({ count: 1, average: 2, mine: 2, canRate: true });
		expect(getRating(e, dan.id, START, AFTER).canRate).toBe(false);
		expect(getRating(e, ben.id, START, '2098-06-27T21:00').canRate).toBe(false);
	});

	it('averages to one decimal place, only counting people still going', () => {
		const { ana, ben, cat, night } = crew();
		const e = night();
		rateNight(e, ana.id, 5, AFTER);
		rateNight(e, ben.id, 4, AFTER);
		rateNight(e, cat.id, 4, AFTER);
		expect(getRating(e, ana.id, START, AFTER)).toMatchObject({ count: 3, average: 4.3 });
		setRsvp(e, cat.id, 'no');
		expect(getRating(e, ana.id, START, AFTER)).toMatchObject({ count: 2, average: 4.5 });
		expect(bestRated([e])).toMatchObject({ event_id: e, average: 4.5, count: 2 });
	});

	it('names the year’s best-rated night with at least 2 ratings, more ratings and then the earlier night winning ties', () => {
		const { id, ana, ben, cat, night } = crew();
		const solo = night('2098-03-01T20:00', 'One rating');
		const spring = night('2098-04-01T20:00', 'Spring');
		const summer = night('2098-05-01T20:00', 'Summer');
		const autumn = night('2098-09-01T20:00', 'Autumn');
		rateNight(solo, ana.id, 5, '2098-03-02T10:00');
		for (const [e, at] of [[spring, '2098-04-02T10:00'], [autumn, '2098-09-02T10:00']] as const) {
			rateNight(e, ana.id, 4, at);
			rateNight(e, ben.id, 4, at);
		}
		rateNight(summer, ana.id, 5, '2098-05-02T10:00');
		rateNight(summer, ben.id, 4, '2098-05-02T10:00');
		rateNight(summer, cat.id, 3, '2098-05-02T10:00');
		// Spring and Autumn average 4 from 2; Summer averages 4 from 3, so it wins.
		expect(yearReview(id, ana.id, 2098, '2098-12-31T23:00').best).toMatchObject({ id: summer, title: 'Summer', average: 4, count: 3 });
		rateNight(summer, cat.id, 1, '2098-05-02T11:00');
		expect(yearReview(id, ana.id, 2098, '2098-12-31T23:00').best).toMatchObject({ id: spring, average: 4, count: 2 });
		expect(yearReview(id, ana.id, 2097, '2098-12-31T23:00').best).toBeNull();
	});

	it('is removed with the account and in the export', () => {
		const { ana, ben, night } = crew();
		const e = night();
		rateNight(e, ben.id, 3, AFTER);
		expect(exportData(ben.id)).toMatchObject({ night_ratings: [{ event_id: e, stars: 3 }] });
		deleteAccount(ben.id);
		expect(getRating(e, ana.id, START, AFTER).count).toBe(0);
	});
});
