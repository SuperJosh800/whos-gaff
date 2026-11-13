import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireHost, requireMember } from './events.ts';
import { isLocalDateTime, nowLocal, shiftLocal } from '../time.ts';

// ---- Pres → pub → club timeline (WG-19) ----

export type Stage = { id: number; name: string; starts_at: string; place: string };
export type Move = { id: number; name: string; place: string; created_at: string };

export function listStages(eventId: number) {
	return db
		.prepare('SELECT id, name, starts_at, place FROM timeline_stages WHERE event_id = ? ORDER BY starts_at, id')
		.all(eventId) as Stage[];
}

/**
 * Where the "add a stage" time starts (WG-38): two hours after the last stage, otherwise the
 * event's date, or while the poll is open the leading option (most "can" votes, earliest on a tie).
 */
export function nextStageTime(eventId: number) {
	const last = db
		.prepare('SELECT MAX(starts_at) AS at FROM timeline_stages WHERE event_id = ?')
		.get(eventId) as { at: string | null };
	if (last.at) return shiftLocal(last.at, 120);
	const event = db.prepare('SELECT starts_at FROM events WHERE id = ?').get(eventId) as { starts_at: string | null };
	if (event.starts_at) return event.starts_at;
	const leading = db
		.prepare(
			`SELECT o.starts_at FROM date_options o LEFT JOIN votes v ON v.option_id = o.id
			 WHERE o.event_id = ? GROUP BY o.id ORDER BY COALESCE(SUM(v.available = 1), 0) DESC, o.starts_at LIMIT 1`
		)
		.get(eventId) as { starts_at: string } | undefined;
	return leading?.starts_at ?? '';
}

export function addStage(eventId: number, hostId: number, name: string, startsAt: string, place: string) {
	requireHost(eventId, hostId);
	name = name.trim();
	if (!name) throw new EventError('Name the stage, e.g. Pres, Pub or Club.');
	if (!isLocalDateTime(startsAt)) throw new EventError('Enter a time for the stage.');
	db.prepare('INSERT INTO timeline_stages (event_id, name, starts_at, place) VALUES (?, ?, ?, ?)').run(
		eventId,
		name.slice(0, 60),
		startsAt,
		place.trim().slice(0, 200)
	);
	publish(eventId);
}

export function removeStage(eventId: number, hostId: number, stageId: number) {
	requireHost(eventId, hostId);
	db.prepare('DELETE FROM timeline_stages WHERE id = ? AND event_id = ?').run(stageId, eventId);
	publish(eventId);
}

export function listMoves(eventId: number) {
	return db
		.prepare(
			`SELECT m.id, u.name, m.place, m.created_at FROM moves m JOIN users u ON u.id = m.user_id
			 WHERE m.event_id = ? ORDER BY m.id DESC LIMIT 20`
		)
		.all(eventId) as Move[];
}

/** Anyone posts "we've moved to X"; everyone else on the event is notified. */
export function postMove(eventId: number, userId: number, place: string) {
	const event = requireMember(eventId, userId);
	place = place.trim();
	if (!place) throw new EventError('Where have you moved to?');
	db.prepare('INSERT INTO moves (event_id, user_id, place) VALUES (?, ?, ?)').run(eventId, userId, place.slice(0, 200));
	const { name } = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string };
	const others = db
		.prepare('SELECT user_id FROM event_members WHERE event_id = ? AND user_id != ?')
		.all(eventId, userId) as { user_id: number }[];
	for (const o of others) notify(o.user_id, eventId, `${name}: we've moved to ${place} (${event.title})`, '/night');
	publish(eventId);
}

// ---- Getting home plan (WG-17) ----

export const HOME_KINDS = {
	'last-train': 'Last train',
	'night-bus': 'Night bus',
	taxi: 'Taxi / Uber split',
	staying: 'Staying at someone’s',
	walking: 'Walking',
	lift: 'Getting a lift'
} as const;
export type HomeKind = keyof typeof HOME_KINDS;

export type HomePlanRow = { user_id: number; name: string; kind: HomeKind | null; details: string | null };

/** Everyone going (and the host), with their plan; kind is null when they have no way home yet. */
export function listHomePlans(eventId: number) {
	return db
		.prepare(
			`SELECT u.id AS user_id, u.name, p.kind, p.details FROM event_members m
			 JOIN events e ON e.id = m.event_id
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 LEFT JOIN home_plans p ON p.event_id = m.event_id AND p.user_id = m.user_id
			 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id)
			 ORDER BY p.kind IS NOT NULL, u.name`
		)
		.all(eventId) as HomePlanRow[];
}

export function setHomePlan(eventId: number, userId: number, kind: string, details: string) {
	requireMember(eventId, userId);
	if (!(kind in HOME_KINDS)) throw new EventError('Choose how you’re getting home.');
	db.prepare(
		`INSERT INTO home_plans (event_id, user_id, kind, details) VALUES (?, ?, ?, ?)
		 ON CONFLICT (event_id, user_id) DO UPDATE SET kind = excluded.kind, details = excluded.details`
	).run(eventId, userId, kind, details.trim().slice(0, 200));
	publish(eventId);
}

/** Notifies everyone going who hasn't sorted a way home. Returns how many were nudged. */
export function nudgeNoPlan(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	const missing = listHomePlans(eventId).filter((p) => !p.kind && p.user_id !== userId);
	for (const p of missing) notify(p.user_id, eventId, `How are you getting home from ${event.title}? Add your plan.`, '/night');
	return missing.length;
}

// ---- "Home safe" check-in (WG-18) ----

/** People who haven't checked in by 3am after the event starts are highlighted. */
export function homeSafeCutoff(startsAt: string) {
	const start = new Date(startsAt + ':00Z');
	const cutoff = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 3));
	if (start.getUTCHours() >= 3) cutoff.setUTCDate(cutoff.getUTCDate() + 1);
	return cutoff.toISOString().slice(0, 16);
}

export type CheckIn = { user_id: number; name: string; at: string | null };

export function listCheckIns(eventId: number) {
	return db
		.prepare(
			`SELECT u.id AS user_id, u.name, s.at FROM event_members m
			 JOIN events e ON e.id = m.event_id
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 LEFT JOIN home_safe s ON s.event_id = m.event_id AND s.user_id = m.user_id
			 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id)
			 ORDER BY s.at IS NOT NULL, u.name`
		)
		.all(eventId) as CheckIn[];
}

export function checkInHomeSafe(eventId: number, userId: number, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	if (!event.starts_at || now < event.starts_at) throw new EventError('Check in once the night has started.');
	db.prepare('INSERT OR REPLACE INTO home_safe (event_id, user_id, at) VALUES (?, ?, ?)').run(eventId, userId, now);
	publish(eventId);
}
