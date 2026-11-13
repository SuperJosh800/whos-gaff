import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, updateProfile, getProfile, type User } from './auth.ts';
import { createGroup, joinGroupByToken } from './groups.ts';
import { remindBirthdays, upcomingBirthdays } from './birthdays.ts';
import { nextBirthday } from '../birthdays.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string, birthday = '') => {
	const u = signUp(`${name}${++n}@bday.test`, name, 'correct-horse-9') as User;
	if (birthday) expect(updateProfile(u.id, { name, paymentLink: '', payday: '', birthday })).toBeNull();
	return u;
};
const token = (id: number) => (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;
const group = (owner: User, ...others: User[]) => {
	const id = createGroup(owner.id, 'Crew');
	for (const u of others) joinGroupByToken(token(id), u.id);
	return id;
};
const notes = (u: User) => listNotifications(u.id, 50).filter((x) => /birthday/.test(x.message)).map((x) => x.message);

describe('birthdays', () => {
	it('works out the next birthday, across the new year and for 29 February', () => {
		expect(nextBirthday('03-12', '2099-03-12')).toEqual({ date: '2099-03-12', days: 0 });
		expect(nextBirthday('03-12', '2099-03-13')).toEqual({ date: '2100-03-12', days: 364 });
		expect(nextBirthday('01-02', '2099-12-30')).toEqual({ date: '2100-01-02', days: 3 });
		expect(nextBirthday('02-29', '2099-02-01')).toEqual({ date: '2099-02-28', days: 27 });
		expect(nextBirthday('02-29', '2096-02-01')).toEqual({ date: '2096-02-29', days: 28 });
		expect(nextBirthday('02-29', '2100-02-01')).toEqual({ date: '2100-02-28', days: 27 });
	});

	it('checks the birthday on the profile, and keeps it when it isn’t sent', () => {
		const u = user('Ana');
		for (const bad of ['02-30', '13-01', '00-10', '05-00', '04-31', '4-1', '-05'])
			expect(updateProfile(u.id, { name: 'Ana', paymentLink: '', payday: '', birthday: bad })).toMatch('Pick both');
		expect(updateProfile(u.id, { name: 'Ana', paymentLink: '', payday: '', birthday: '02-29' })).toBeNull();
		expect(updateProfile(u.id, { name: 'Ana B', paymentLink: '', payday: '' })).toBeNull();
		expect(getProfile(u.id).birthday).toBe('02-29');
		expect(updateProfile(u.id, { name: 'Ana', paymentLink: '', payday: '', birthday: '' })).toBeNull();
		expect(getProfile(u.id).birthday).toBeNull();
	});

	it('lists members’ birthdays in the next 30 days, soonest first', () => {
		const [ana, ben, cal, dee] = [user('Ana', '07-01'), user('Ben', '06-21'), user('Cal', '07-22'), user('Dee')];
		const outsider = user('Out', '06-22');
		const id = group(ana, ben, cal, dee);
		expect(upcomingBirthdays(id, '2099-06-21').map((b) => [b.name, b.date, b.days])).toEqual([
			['Ben', '2099-06-21', 0],
			['Ana', '2099-07-01', 10]
		]);
		expect(outsider).toBeTruthy();
		expect(upcomingBirthdays(id, '2099-06-22').map((b) => b.name)).toEqual(['Ana', 'Cal']);
	});

	it('tells everyone who shares a group, once a year each, from a week before, during the day', () => {
		const ana = user('Ana', '09-10');
		const [ben, cal, dee] = [user('Ben'), user('Cal'), user('Dee')];
		const stranger = user('Stranger');
		const one = group(ana, ben, cal);
		group(dee, ana, ben);
		remindBirthdays('2099-09-02T12:00');
		expect(notes(ben)).toEqual([]);
		remindBirthdays('2099-09-03T09:59');
		remindBirthdays('2099-09-03T21:00');
		expect(notes(ben)).toEqual([]);
		remindBirthdays('2099-09-03T10:00');
		remindBirthdays('2099-09-09T12:00');
		expect(notes(ben)).toEqual(['It’s Ana’s birthday on Thu 10 Sep. Plan the night?']);
		for (const u of [cal, dee]) expect(notes(u)).toHaveLength(1);
		for (const u of [ana, stranger]) expect(notes(u)).toEqual([]);
		// Joining a group the day before still gets a reminder; the next year everyone's told again.
		const eve = user('Eve');
		joinGroupByToken(token(one), eve.id);
		remindBirthdays('2099-09-09T12:00');
		expect(notes(eve)).toEqual(['It’s Ana’s birthday tomorrow. Plan the night?']);
		remindBirthdays('2100-09-10T10:00');
		expect(notes(ben)).toEqual(['It’s Ana’s birthday today. Plan the night?', 'It’s Ana’s birthday on Thu 10 Sep. Plan the night?']);
		// Moving the birthday doesn't tell anyone again that year.
		updateProfile(ana.id, { name: 'Ana', paymentLink: '', payday: '', birthday: '09-12' });
		remindBirthdays('2100-09-10T11:00');
		expect(notes(ben)).toHaveLength(2);
	});

	it('tells people once about a birthday just after new year, though the reminder came in December', () => {
		const ana = user('Ana', '01-02');
		const ben = user('Ben');
		group(ana, ben);
		remindBirthdays('2099-12-28T12:00');
		remindBirthdays('2100-01-01T12:00');
		expect(notes(ben)).toEqual(['It’s Ana’s birthday on Sat 2 Jan. Plan the night?']);
	});

	it('is removed with the account and in the export', () => {
		const ana = user('Ana', '05-05');
		const ben = user('Ben');
		const id = group(ana, ben);
		remindBirthdays('2099-05-01T12:00');
		expect(exportData(ana.id)).toMatchObject({ profile: { birthday: '05-05' } });
		expect(exportData(ben.id)).toMatchObject({ birthday_told: [{ about_id: ana.id, year: 2099 }] });
		deleteAccount(ana.id);
		expect(getProfile(ana.id).birthday).toBeNull();
		expect(upcomingBirthdays(id, '2099-05-01')).toEqual([]);
		expect(db.prepare('SELECT COUNT(*) AS n FROM birthday_told WHERE about_id = ?').get(ana.id)).toEqual({ n: 0 });
	});
});
