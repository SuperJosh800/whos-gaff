// The morning-after hangover check-in: everyone who went says how their head is, from Fresh to Dying.
// Whoever's worst gets "Worst hangover" alongside the voted awards. One "How's the head?" nudge goes out
// at 10am the morning after to anyone who hasn't checked in, and never later than noon.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireMember } from './events.ts';
import { attendees } from './after.ts';
import { formatWhen, nowLocal, shiftLocal } from '../time.ts';

export const HEADS = ['Fresh', 'Fine', 'Rough', 'Bad', 'Awful', 'Dying'] as const;

const HOUR = 60;
/** Check-ins open this long after the start, and close this long after it. */
const OPENS_AFTER = 6 * HOUR;
const CLOSES_AFTER = 72 * HOUR;

const opensAt = (start: string) => shiftLocal(start, OPENS_AFTER);
const closesAt = (start: string) => shiftLocal(start, CLOSES_AFTER);
/** The morning after: the first 10am once check-ins have opened (the same day for a night starting after midnight). */
function nudgeAt(start: string) {
	const open = opensAt(start);
	const day = open.slice(11) <= '10:00' ? open.slice(0, 10) : shiftLocal(open, 24 * HOUR).slice(0, 10);
	return `${day}T10:00`;
}
/** A nudge not sent by noon (the server was off) is dropped rather than sent at a silly hour. */
const tooLate = (start: string) => `${nudgeAt(start).slice(0, 10)}T12:00`;

/** Saves how bad your head is (0 to 5). Only people who went, from 6 hours after the start for 3 days. */
export function rateHead(eventId: number, userId: number, head: number, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	if (!event.starts_at || now < opensAt(event.starts_at)) throw new EventError(`The hangover check-in opens ${event.starts_at ? formatWhen(opensAt(event.starts_at)) : 'the morning after'}.`);
	if (now >= closesAt(event.starts_at)) throw new EventError('The hangover check-in has closed.');
	if (!attendees(eventId).some((p) => p.id === userId)) throw new EventError('Only people who went can check in.');
	if (!Number.isInteger(head) || head < 0 || head >= HEADS.length) throw new EventError('Pick how your head is.');
	db.prepare(
		`INSERT INTO hangovers (event_id, user_id, head) VALUES (?, ?, ?)
		 ON CONFLICT (event_id, user_id) DO UPDATE SET head = excluded.head`
	).run(eventId, userId, head);
	publish(eventId);
}

/**
 * Everyone's check-in, worst first, and who has the worst hangover (the highest rating; ties share it,
 * and nobody gets it if everyone's fresh). Only counts people who went.
 */
export function getHangovers(eventId: number, userId: number, startsAt: string | null, now = nowLocal()) {
	const going = new Set(attendees(eventId).map((p) => p.id));
	const heads = (
		db
			.prepare('SELECT h.user_id, u.name, h.head FROM hangovers h JOIN users u ON u.id = h.user_id WHERE h.event_id = ? ORDER BY h.head DESC, u.name')
			.all(eventId) as { user_id: number; name: string; head: number }[]
	).filter((h) => going.has(h.user_id));
	const top = heads[0]?.head ?? 0;
	return {
		scale: HEADS,
		opensAt: startsAt ? opensAt(startsAt) : null,
		state: !startsAt || now < opensAt(startsAt) ? 'soon' : now < closesAt(startsAt) ? 'open' : 'closed',
		canCheckIn: going.has(userId),
		mine: heads.find((h) => h.user_id === userId)?.head ?? null,
		heads,
		worst: top ? heads.filter((h) => h.head === top) : []
	};
}

/**
 * Sends the one "How's the head?" nudge for nights whose morning after has come, to everyone who went and
 * hasn't checked in. If it's past noon by then (the server was off, or this has just been deployed), the
 * night is marked as done without telling anyone.
 */
export function nudgeHangovers(now = nowLocal()) {
	const due = db
		.prepare('SELECT id, title, starts_at FROM events WHERE starts_at > ? AND starts_at <= ? AND id NOT IN (SELECT event_id FROM hangover_nudges)')
		.all(shiftLocal(now, -CLOSES_AFTER), shiftLocal(now, -OPENS_AFTER)) as { id: number; title: string; starts_at: string }[];
	for (const e of due) {
		if (now < nudgeAt(e.starts_at)) continue;
		db.prepare('INSERT INTO hangover_nudges (event_id) VALUES (?)').run(e.id);
		if (now >= tooLate(e.starts_at)) continue;
		const done = new Set((db.prepare('SELECT user_id FROM hangovers WHERE event_id = ?').all(e.id) as { user_id: number }[]).map((h) => h.user_id));
		for (const p of attendees(e.id)) if (!done.has(p.id)) notify(p.id, e.id, `How’s the head? Check in for ${e.title}.`, '/after#hangover');
	}
}
