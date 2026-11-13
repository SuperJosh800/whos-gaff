// Birthday reminders: a group page lists members' birthdays coming up, and a week before someone's
// birthday everyone who shares a group with them gets one reminder to plan the night.
import { db } from './db.ts';
import { notify } from './notifications.ts';
import { formatBirthday, nextBirthday } from '../birthdays.ts';
import { nowLocal } from '../time.ts';

/** Days ahead that the group page shows, and that reminders go out. */
export const SHOW_DAYS = 30;
export const REMIND_DAYS = 7;

/** Members' birthdays in the next 30 days (today included), soonest first. */
export function upcomingBirthdays(groupId: number, today = nowLocal().slice(0, 10)) {
	const rows = db
		.prepare(
			`SELECT u.id, u.name, u.birthday FROM group_members m JOIN users u ON u.id = m.user_id
			 WHERE m.group_id = ? AND u.birthday IS NOT NULL`
		)
		.all(groupId) as { id: number; name: string; birthday: string }[];
	return rows
		.map((r) => ({ ...r, ...nextBirthday(r.birthday, today) }))
		.filter((r) => r.days <= SHOW_DAYS)
		.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

const when = (date: string, days: number) =>
	days === 0
		? 'today'
		: days === 1
			? 'tomorrow'
			: `on ${new Date(date + 'T00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' })} ${formatBirthday(date.slice(5))}`;

/**
 * Tells everyone who shares a group with someone that their birthday is coming up, once a year each,
 * from a week before. Only sent between 10am and 9pm, so nobody's woken up by it.
 */
export function remindBirthdays(now = nowLocal()) {
	const time = now.slice(11);
	if (time < '10:00' || time >= '21:00') return;
	const today = now.slice(0, 10);
	const people = db.prepare('SELECT id, name, birthday FROM users WHERE birthday IS NOT NULL').all() as { id: number; name: string; birthday: string }[];
	const told = db.prepare('INSERT OR IGNORE INTO birthday_told (about_id, user_id, year) VALUES (?, ?, ?)');
	for (const p of people) {
		const next = nextBirthday(p.birthday, today);
		if (next.days > REMIND_DAYS) continue;
		// Each person who shares a group with them, and the first group they share, for the link.
		const others = db
			.prepare(
				`SELECT o.user_id, MIN(o.group_id) AS group_id FROM group_members me JOIN group_members o ON o.group_id = me.group_id
				 WHERE me.user_id = ? AND o.user_id != ? GROUP BY o.user_id`
			)
			.all(p.id, p.id) as { user_id: number; group_id: number }[];
		for (const o of others) {
			if (!told.run(p.id, o.user_id, Number(next.date.slice(0, 4))).changes) continue;
			notify(o.user_id, null, `It’s ${p.name}’s birthday ${when(next.date, next.days)}. Plan the night?`, `/groups/${o.group_id}#birthdays`);
		}
	}
}
