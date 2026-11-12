import { randomBytes } from 'node:crypto';
import { db } from './db.ts';
import { notify } from './notifications.ts';
import { EventError } from './events.ts';
import { nowLocal } from '../time.ts';
import { PLANS, type Plan } from '../plans.ts';

export type Group = { id: number; name: string; invite_token: string; created_by: number };
type Member = { id: number; name: string };

export function createGroup(userId: number, name: string) {
	name = name.trim();
	if (!name) throw new EventError('Name the group, e.g. “The lads” or “Flat 2/1”.');
	const { lastInsertRowid } = db
		.prepare('INSERT INTO friend_groups (name, invite_token, created_by) VALUES (?, ?, ?)')
		.run(name.slice(0, 60), randomBytes(12).toString('base64url'), userId);
	db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(lastInsertRowid, userId);
	return Number(lastInsertRowid);
}

export function listGroups(userId: number) {
	return db
		.prepare(
			`SELECT g.id, g.name, (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id = g.id) AS members
			 FROM group_members m JOIN friend_groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY g.name`
		)
		.all(userId) as { id: number; name: string; members: number }[];
}

export function isGroupMember(groupId: number, userId: number) {
	return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

export function requireGroupMember(groupId: number, userId: number) {
	const group = db.prepare('SELECT * FROM friend_groups WHERE id = ?').get(groupId) as Group | undefined;
	if (!group || !isGroupMember(groupId, userId)) throw new EventError('You’re not in that group.');
	return group;
}

export function listGroupMembers(groupId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY u.name`
		)
		.all(groupId) as Member[];
}

export function joinGroupByToken(token: string, userId: number) {
	const group = db.prepare('SELECT id FROM friend_groups WHERE invite_token = ?').get(token) as { id: number } | undefined;
	if (!group) return null;
	db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, userId);
	return group.id;
}

function userName(userId: number) {
	return (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;
}

function notifyGroup(groupId: number, exceptUserId: number, message: string) {
	for (const m of listGroupMembers(groupId)) if (m.id !== exceptUserId) notify(m.id, null, message);
}

// ---- Free gaff alerts (WG-23) ----

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const shortDate = (d: string) =>
	new Date(d + 'T00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

export function markFreeGaff(groupId: number, userId: number, place: string, from: string, to: string) {
	const group = requireGroupMember(groupId, userId);
	place = place.trim() || `${userName(userId)}’s`;
	if (!DATE.test(from) || !DATE.test(to)) throw new EventError('Pick the dates your place is free.');
	if (to < from) throw new EventError('The end date is before the start date.');
	if (to < nowLocal().slice(0, 10)) throw new EventError('Those dates have already passed.');
	db.prepare('INSERT INTO free_gaffs (group_id, user_id, place, from_date, to_date) VALUES (?, ?, ?, ?, ?)').run(
		groupId,
		userId,
		place.slice(0, 80),
		from,
		to
	);
	const when = from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
	notifyGroup(groupId, userId, `Free gaff! ${place} is free ${when}. Plan something in ${group.name}?`);
}

export function listFreeGaffs(groupId: number) {
	return db
		.prepare(
			`SELECT f.id, f.place, f.from_date, f.to_date, f.user_id, u.name FROM free_gaffs f
			 JOIN users u ON u.id = f.user_id WHERE f.group_id = ? AND f.to_date >= ? ORDER BY f.from_date`
		)
		.all(groupId, nowLocal().slice(0, 10)) as {
		id: number;
		place: string;
		from_date: string;
		to_date: string;
		user_id: number;
		name: string;
	}[];
}

// ---- "Who's out?" (WG-30) ----

/** A ping is open until its date passes; old undated pings stay open for a week. Takes today's date. */
const OPEN_PING = `(p.on_date >= ? OR (p.on_date IS NULL AND p.created_at >= datetime('now', '-7 days')))`;

export function sendPing(groupId: number, userId: number, plan: Plan, date: string) {
	const group = requireGroupMember(groupId, userId);
	if (!Object.hasOwn(PLANS, plan)) throw new EventError('Pick what kind of night it is.');
	if (!DATE.test(date)) throw new EventError('Pick a date.');
	const today = nowLocal().slice(0, 10);
	if (date < today) throw new EventError('That date has already passed.');
	// One open ask per person per group, so nobody can spam everyone's notifications.
	if (db.prepare(`SELECT 1 FROM pings p WHERE p.group_id = ? AND p.user_id = ? AND ${OPEN_PING}`).get(groupId, userId, today)) {
		throw new EventError('You already have an ask out. Delete it first to ask about another night.');
	}
	const { lastInsertRowid } = db
		.prepare('INSERT INTO pings (group_id, user_id, plan, on_date) VALUES (?, ?, ?, ?)')
		.run(groupId, userId, plan, date);
	db.prepare("INSERT INTO ping_answers (ping_id, user_id, answer) VALUES (?, ?, 'yes')").run(lastInsertRowid, userId);
	const { ask } = PLANS[plan];
	const day = new Date(date + 'T00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
	notifyGroup(groupId, userId, `${userName(userId)} asks: who's out${ask} on ${day}? Answer in ${group.name}.`);
	return Number(lastInsertRowid);
}

function requirePing(groupId: number, pingId: number) {
	const ping = db.prepare('SELECT id, user_id, event_id FROM pings WHERE id = ? AND group_id = ?').get(pingId, groupId) as
		| { id: number; user_id: number; event_id: number | null }
		| undefined;
	if (!ping) throw new EventError('That ping no longer exists.');
	return ping;
}

/** The person who asked, or whoever created the group, can delete an ask. Any event made from it stays. */
export function deletePing(groupId: number, userId: number, pingId: number) {
	const group = requireGroupMember(groupId, userId);
	const ping = requirePing(groupId, pingId);
	if (ping.user_id !== userId && group.created_by !== userId) {
		throw new EventError('Only the person who asked can delete this.');
	}
	db.prepare('DELETE FROM pings WHERE id = ?').run(pingId);
}

/** `null` clears the answer, so tapping your square cycles in, can't, no answer. */
export function answerPing(groupId: number, userId: number, pingId: number, answer: 'yes' | 'no' | null) {
	requireGroupMember(groupId, userId);
	requirePing(groupId, pingId);
	if (answer === null) {
		db.prepare('DELETE FROM ping_answers WHERE ping_id = ? AND user_id = ?').run(pingId, userId);
		return;
	}
	if (answer !== 'yes' && answer !== 'no') throw new EventError('Answer yes or no.');
	db.prepare(
		`INSERT INTO ping_answers (ping_id, user_id, answer) VALUES (?, ?, ?)
		 ON CONFLICT (ping_id, user_id) DO UPDATE SET answer = excluded.answer`
	).run(pingId, userId, answer);
}

/** Pings for today or later (soonest first), plus undated ones from the last week, with everyone's answers. */
export function listPings(groupId: number) {
	const pings = db
		.prepare(
			`SELECT p.id, p.user_id, u.name, p.event_id, p.plan, p.on_date, p.created_at FROM pings p JOIN users u ON u.id = p.user_id
			 WHERE p.group_id = ? AND ${OPEN_PING}
			 ORDER BY COALESCE(p.on_date, date(p.created_at)), p.id DESC`
		)
		.all(groupId, nowLocal().slice(0, 10)) as {
		id: number;
		user_id: number;
		name: string;
		event_id: number | null;
		plan: Plan;
		on_date: string | null;
		created_at: string;
	}[];
	const answers = db.prepare(
		`SELECT a.user_id, u.name, a.answer FROM ping_answers a JOIN users u ON u.id = a.user_id WHERE a.ping_id = ? ORDER BY u.name`
	);
	return pings.map((p) => {
		const all = answers.all(p.id) as { user_id: number; name: string; answer: 'yes' | 'no' }[];
		return { ...p, yes: all.filter((a) => a.answer === 'yes'), no: all.filter((a) => a.answer === 'no') };
	});
}

/** Called when an event is created from a ping, so the ping links to it. */
export function linkPingToEvent(groupId: number, pingId: number, eventId: number) {
	// The ask may have been deleted while the event was being made; the event still stands.
	db.prepare('UPDATE pings SET event_id = ? WHERE id = ? AND group_id = ?').run(eventId, pingId, groupId);
}

// ---- Hosting leaderboard (WG-35) ----

/** Group members by how many of the group's dated events they've hosted, most first. */
export function hostingLeaderboard(groupId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name,
				(SELECT COUNT(*) FROM events e WHERE e.group_id = m.group_id AND e.host_id = u.id AND e.starts_at IS NOT NULL) AS hosted
			 FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?
			 ORDER BY hosted DESC, u.name`
		)
		.all(groupId) as { id: number; name: string; hosted: number }[];
}

export function nudgeToHost(groupId: number, userId: number, targetId: number) {
	const group = requireGroupMember(groupId, userId);
	if (!isGroupMember(groupId, targetId) || targetId === userId) throw new EventError('Pick someone else in the group.');
	const hosted = hostingLeaderboard(groupId).find((r) => r.id === targetId)!.hosted;
	if (hosted > 0) throw new EventError('They’ve already hosted. Fair’s fair.');
	notify(targetId, null, `${userName(userId)} says you owe ${group.name} a gaff!`);
}
