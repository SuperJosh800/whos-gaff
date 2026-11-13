// Secret missions (Night tab). Anyone going can take one: it's private to them and runs all night,
// so nobody can tell who has one from a shared card. Pull it off and say so (with a photo when the
// mission asks for one) for the points; anyone who spots a mission being done can call it out.
import { randomInt } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember } from './events.ts';
import { goingPeople } from './money.ts';
import { notify } from './notifications.ts';
import { addPhoto, removePhotoFiles } from './after.ts';
import { fillNames, MISSIONS, namesNeeded } from '../activities.ts';

type Row = {
	id: number;
	user_id: number;
	text: string;
	points: number;
	photo: number;
	status: 'live' | 'done' | 'caught' | 'swapped';
	caught_by: number | null;
	photo_id: number | null;
};

const SWAP_LIMIT = 2;

function requireGoing(eventId: number, userId: number) {
	requireMember(eventId, userId);
	if (!goingPeople(eventId).some((p) => p.id === userId)) throw new EventError('RSVP “going” to get a mission.');
}

function liveMission(eventId: number, userId: number) {
	return db.prepare(`SELECT * FROM missions WHERE event_id = ? AND user_id = ? AND status = 'live'`).get(eventId, userId) as
		| Row
		| undefined;
}

/** Deals a mission the person hasn't had tonight, naming someone else going for {2}. */
function deal(eventId: number, userId: number) {
	const had = new Set(
		(db.prepare('SELECT text FROM missions WHERE event_id = ? AND user_id = ?').all(eventId, userId) as { text: string }[]).map(
			(r) => r.text
		)
	);
	const others = goingPeople(eventId).filter((p) => p.id !== userId);
	const pool = MISSIONS.filter((m) => namesNeeded(m.text) < 2 || others.length);
	const fresh = pool.filter((m) => !others.some((o) => had.has(fillNames(m.text, ['', o.name]))));
	const choices = fresh.length ? fresh : pool;
	const mission = choices[randomInt(choices.length)];
	const other = others.length ? others[randomInt(others.length)].name : 'someone';
	db.prepare('INSERT INTO missions (event_id, user_id, text, points, photo) VALUES (?, ?, ?, ?, ?)').run(
		eventId,
		userId,
		fillNames(mission.text, ['', other]),
		mission.points,
		mission.photo ? 1 : 0
	);
}

export function takeMission(eventId: number, userId: number) {
	requireGoing(eventId, userId);
	tx(() => {
		if (liveMission(eventId, userId)) throw new EventError('You’ve already got a mission.');
		deal(eventId, userId);
	});
	publish(eventId);
}

/** Swaps a mission you don't fancy for another, a couple of times a night. */
export function swapMission(eventId: number, userId: number) {
	requireGoing(eventId, userId);
	tx(() => {
		const live = liveMission(eventId, userId);
		if (!live) throw new EventError('You haven’t got a mission.');
		const { swaps } = db
			.prepare(`SELECT COUNT(*) AS swaps FROM missions WHERE event_id = ? AND user_id = ? AND status = 'swapped'`)
			.get(eventId, userId) as { swaps: number };
		if (swaps >= SWAP_LIMIT) throw new EventError('No swaps left tonight.');
		db.prepare(`UPDATE missions SET status = 'swapped', finished_at = datetime('now') WHERE id = ?`).run(live.id);
		deal(eventId, userId);
	});
	publish(eventId);
}

/** Marks your mission done. A photo mission needs the photo as proof; it goes in the night's photos. */
export async function completeMission(eventId: number, userId: number, photo: File | null) {
	requireGoing(eventId, userId);
	const live = liveMission(eventId, userId);
	if (!live) throw new EventError('You haven’t got a mission.');
	let photoId: number | null = null;
	if (live.photo) {
		if (!(photo instanceof File) || photo.size === 0) throw new EventError('This mission needs a photo as proof.');
		photoId = await addPhoto(eventId, userId, photo);
	}
	const changed = db
		.prepare(`UPDATE missions SET status = 'done', photo_id = ?, finished_at = datetime('now') WHERE id = ? AND status = 'live'`)
		.run(photoId, live.id).changes;
	if (!changed) {
		// Caught while the photo was uploading: the photo isn't proof of anything now.
		if (photoId) dropPhoto(photoId);
		throw new EventError('Too late: someone caught you.');
	}
	const name = (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;
	for (const p of goingPeople(eventId)) {
		if (p.id !== userId) notify(p.id, eventId, `${name} pulled off a secret mission: “${live.text}”`, '/night#missions');
	}
	publish(eventId);
}

function dropPhoto(photoId: number) {
	const row = db.prepare('SELECT filename FROM event_photos WHERE id = ?').get(photoId) as { filename: string } | undefined;
	if (!row) return;
	removePhotoFiles([row.filename]);
	db.prepare('DELETE FROM event_photos WHERE id = ?').run(photoId);
}

/**
 * Calls out someone you think is doing their mission. Right, and their mission is caught: no points
 * for them, a point for you. Wrong guesses cost nothing but are shown to everyone, so don't spam it.
 */
export function callOut(eventId: number, userId: number, suspectId: number) {
	requireGoing(eventId, userId);
	if (suspectId === userId) throw new EventError('You can’t catch yourself!');
	const caught = tx(() => {
		const recent = db
			.prepare(
				`SELECT 1 FROM mission_guesses WHERE event_id = ? AND user_id = ? AND suspect_id = ? AND created_at > datetime('now', '-15 minutes')`
			)
			.get(eventId, userId, suspectId);
		if (recent) throw new EventError('You already called them out. Give it 15 minutes.');
		const live = liveMission(eventId, suspectId);
		db.prepare('INSERT INTO mission_guesses (event_id, user_id, suspect_id, correct) VALUES (?, ?, ?, ?)').run(
			eventId,
			userId,
			suspectId,
			live ? 1 : 0
		);
		if (!live) return null;
		db.prepare(`UPDATE missions SET status = 'caught', caught_by = ?, finished_at = datetime('now') WHERE id = ?`).run(
			userId,
			live.id
		);
		return live;
	});
	if (caught) {
		const [me, them] = [userId, suspectId].map((id) => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string }).name);
		notify(suspectId, eventId, `${me} caught you on your secret mission. Take a new one on the Night tab.`, '/night#missions');
		for (const p of goingPeople(eventId)) {
			if (p.id !== suspectId && p.id !== userId) notify(p.id, eventId, `${me} caught ${them} on a secret mission: “${caught.text}”`, '/night#missions');
		}
	}
	publish(eventId);
	return { caught: !!caught };
}

/** The Night tab's view of missions: your own live one (only ever yours), and what's been settled. */
export function getMissions(eventId: number, viewerId: number) {
	const mine = liveMission(eventId, viewerId);
	const swaps = (
		db
			.prepare(`SELECT COUNT(*) AS n FROM missions WHERE event_id = ? AND user_id = ? AND status = 'swapped'`)
			.get(eventId, viewerId) as { n: number }
	).n;
	const settled = db
		.prepare(
			`SELECT m.id, m.user_id, u.name, m.text, m.points, m.status, c.name AS caught_by, m.photo_id
			 FROM missions m JOIN users u ON u.id = m.user_id LEFT JOIN users c ON c.id = m.caught_by
			 WHERE m.event_id = ? AND m.status IN ('done', 'caught') ORDER BY m.finished_at DESC, m.id DESC`
		)
		.all(eventId) as {
		id: number;
		user_id: number;
		name: string;
		text: string;
		points: number;
		status: 'done' | 'caught';
		caught_by: string | null;
		photo_id: number | null;
	}[];
	const misses = db
		.prepare(
			`SELECT u.name, s.name AS suspect FROM mission_guesses g JOIN users u ON u.id = g.user_id JOIN users s ON s.id = g.suspect_id
			 WHERE g.event_id = ? AND g.correct = 0 ORDER BY g.id DESC LIMIT 5`
		)
		.all(eventId) as { name: string; suspect: string }[];
	// How many people are on a mission right now; never who.
	const { live } = db
		.prepare(`SELECT COUNT(*) AS live FROM missions WHERE event_id = ? AND status = 'live'`)
		.get(eventId) as { live: number };
	return {
		mine: mine ? { text: mine.text, points: mine.points, photo: !!mine.photo } : null,
		swapsLeft: Math.max(0, SWAP_LIMIT - swaps),
		settled,
		misses,
		live,
		scores: missionScores(eventId)
	};
}

/** Mission points: the mission's points for pulling it off, 1 for each person caught. */
/** Mission points as rows of (user_id, event_id, points): the mission's points for doing it, 1 for catching someone. Season leaderboards use it too. */
export const MISSION_POINTS = `SELECT user_id, event_id, points FROM missions WHERE status = 'done'
	UNION ALL SELECT caught_by, event_id, 1 FROM missions WHERE status = 'caught' AND caught_by IS NOT NULL`;

function missionScores(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name, SUM(s.points) AS points FROM (${MISSION_POINTS}) s JOIN users u ON u.id = s.user_id
			 WHERE s.event_id = ? GROUP BY u.id ORDER BY points DESC, u.name`
		)
		.all(eventId) as { id: number; name: string; points: number }[];
}
