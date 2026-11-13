// All event times are UK wall-clock times stored as "YYYY-MM-DDTHH:mm" strings (the format of
// <input type="datetime-local">). Comparing them as strings orders them correctly.

export const TIME_ZONE = 'Europe/London';

/** The current UK wall-clock time as "YYYY-MM-DDTHH:mm". */
export function nowLocal(date = new Date()) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: TIME_ZONE,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(date)
			.map((p) => [p.type, p.value])
	);
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function isLocalDateTime(value: string) {
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'Z'));
}

// Parse as UTC and format as UTC so the wall-clock time is shown unchanged.
const asUtc = (local: string) => new Date(local + ':00Z');

/** The moment a UK wall-clock time happens, in ms since 1970, allowing for BST. */
export function localToMs(local: string) {
	const guess = asUtc(local).getTime();
	// How far UK time is ahead of UTC then (0 or 1 hour).
	return guess - (asUtc(nowLocal(new Date(guess))).getTime() - guess);
}

/** Moves a wall-clock time by whole minutes, across midnight and month ends. */
export function shiftLocal(local: string, minutes: number) {
	return new Date(asUtc(local).getTime() + minutes * 60_000).toISOString().slice(0, 16);
}

/** "Sat 15 Nov, 8pm" */
export function formatWhen(local: string) {
	const d = asUtc(local);
	const day = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(d);
	return `${day}, ${formatTime(local)}`;
}

/** "8pm" or "8:30pm" */
export function formatTime(local: string) {
	const d = asUtc(local);
	const h = d.getUTCHours();
	const m = d.getUTCMinutes();
	const suffix = h < 12 ? 'am' : 'pm';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/**
 * True when the date falls within `days` days after payday (payday itself included).
 * A payday past the end of a short month (e.g. the 31st in November) falls on its last day.
 */
export function isJustAfterPayday(local: string, payday: number, days = 7) {
	const date = asUtc(local.slice(0, 10) + 'T00:00');
	for (const monthOffset of [0, -1]) {
		const year = date.getUTCFullYear();
		const month = date.getUTCMonth() + monthOffset;
		const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		const paid = Date.UTC(year, month, Math.min(payday, lastDay));
		const diff = (date.getTime() - paid) / 86_400_000;
		if (diff >= 0 && diff < days) return true;
	}
	return false;
}

/** "Sat 15th" */
export function formatShortDay(local: string) {
	const d = asUtc(local);
	const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(d);
	const n = d.getUTCDate();
	const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
	return `${weekday} ${n}${suffix}`;
}
