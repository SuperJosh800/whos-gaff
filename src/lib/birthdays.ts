// Birthdays are stored as "MM-DD", with no year. 29 February is kept on 28 February in other years.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isBirthday(value: string) {
	const m = value.match(/^(\d{2})-(\d{2})$/);
	if (!m) return false;
	const [month, day] = [Number(m[1]), Number(m[2])];
	return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN[month - 1];
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const on = (birthday: string, year: number) => `${year}-${birthday === '02-29' && !isLeap(year) ? '02-28' : birthday}`;

/** The date ("YYYY-MM-DD") of the next birthday on or after `today`, and how many days away it is. */
export function nextBirthday(birthday: string, today: string) {
	const year = Number(today.slice(0, 4));
	const date = on(birthday, year) >= today ? on(birthday, year) : on(birthday, year + 1);
	return { date, days: Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000) };
}

/** "12 Mar" */
export const formatBirthday = (birthday: string) => `${Number(birthday.slice(3))} ${MONTHS[Number(birthday.slice(0, 2)) - 1]}`;
