import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember, type Event } from './events.ts';
import { nowLocal } from '../time.ts';

// ---- Post-night awards and hall of fame (WG-32) ----

export const AWARDS = {
	mvp: 'MVP',
	'first-home': 'First to go home',
	'worst-state': 'Worst state'
} as const;
export type Award = keyof typeof AWARDS;

export const isOver = (event: Event, now = nowLocal()) => !!event.starts_at && event.starts_at <= now;

/** The people who can vote and be voted for: the host and everyone who RSVP'd going. */
export function attendees(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name FROM event_members m JOIN events e ON e.id = m.event_id JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id) ORDER BY u.name`
		)
		.all(eventId) as { id: number; name: string }[];
}

export function voteAward(eventId: number, voterId: number, award: string, nomineeId: number, now = nowLocal()) {
	const event = requireMember(eventId, voterId);
	if (!isOver(event, now)) throw new EventError('Awards open once the night has started.');
	if (!(award in AWARDS)) throw new EventError('Unknown award.');
	const people = attendees(eventId);
	if (!people.some((p) => p.id === voterId)) throw new EventError('Only people who went can vote.');
	if (!people.some((p) => p.id === nomineeId)) throw new EventError('Pick someone who was there.');
	db.prepare(
		`INSERT INTO award_votes (event_id, award, voter_id, nominee_id) VALUES (?, ?, ?, ?)
		 ON CONFLICT (event_id, award, voter_id) DO UPDATE SET nominee_id = excluded.nominee_id`
	).run(eventId, award, voterId, nomineeId);
	publish(eventId);
}

// Winners are whoever has the most votes for an award at an event; ties share it.
export const WINNERS = `
	WITH counts AS (
		SELECT event_id, award, nominee_id, COUNT(*) AS votes FROM award_votes GROUP BY event_id, award, nominee_id
	), best AS (
		SELECT event_id, award, MAX(votes) AS votes FROM counts GROUP BY event_id, award
	)
	SELECT c.event_id, c.award, c.nominee_id, c.votes FROM counts c JOIN best b USING (event_id, award, votes)`;

export function getAwards(eventId: number, userId: number) {
	const winners = db
		.prepare(
			`SELECT w.award, w.nominee_id, u.name, w.votes FROM (${WINNERS}) w JOIN users u ON u.id = w.nominee_id
			 WHERE w.event_id = ? ORDER BY u.name`
		)
		.all(eventId) as { award: Award; nominee_id: number; name: string; votes: number }[];
	const mine = db
		.prepare('SELECT award, nominee_id FROM award_votes WHERE event_id = ? AND voter_id = ?')
		.all(eventId, userId) as { award: Award; nominee_id: number }[];
	return {
		people: attendees(eventId),
		awards: Object.entries(AWARDS).map(([key, label]) => ({
			key: key as Award,
			label,
			winners: winners.filter((w) => w.award === key),
			myVote: mine.find((m) => m.award === key)?.nominee_id ?? null
		}))
	};
}

/** Every award a user has won, newest event first. */
export function hallOfFame(userId: number) {
	return (
		db
			.prepare(
				`SELECT w.event_id, e.title, e.starts_at, w.award FROM (${WINNERS}) w JOIN events e ON e.id = w.event_id
				 WHERE w.nominee_id = ? ORDER BY e.starts_at DESC`
			)
			.all(userId) as { event_id: number; title: string; starts_at: string; award: Award }[]
	).map((r) => ({ ...r, label: AWARDS[r.award] }));
}

// ---- Night predictions ----
// Before the night, everyone going guesses who'll win each award. Picks stay hidden until the night
// starts, then the award votes afterwards decide who called it. Nobody has to mark anything.

/**
 * Saves someone's picks, one per award; an empty pick clears it. All or nothing.
 * Open only once the date is set and until the night starts.
 */
export function savePredictions(eventId: number, userId: number, picks: Record<string, string>, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	if (!event.starts_at) throw new EventError('Predictions open once the date is set.');
	if (isOver(event, now)) throw new EventError('Predictions closed when the night started.');
	const people = attendees(eventId);
	if (!people.some((p) => p.id === userId)) throw new EventError('RSVP going to make predictions.');
	tx(() => {
		for (const [award, pick] of Object.entries(picks)) {
			if (!(award in AWARDS)) throw new EventError('Unknown award.');
			if (!pick) {
				db.prepare('DELETE FROM predictions WHERE event_id = ? AND user_id = ? AND award = ?').run(eventId, userId, award);
				continue;
			}
			if (!people.some((p) => p.id === Number(pick))) throw new EventError('Pick someone who’s going.');
			db.prepare(
				`INSERT INTO predictions (event_id, user_id, award, nominee_id) VALUES (?, ?, ?, ?)
				 ON CONFLICT (event_id, user_id, award) DO UPDATE SET nominee_id = excluded.nominee_id`
			).run(eventId, userId, award, Number(pick));
		}
	});
	publish(eventId);
}

export function getPredictions(eventId: number, userId: number, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	const locked = isOver(event, now);
	const people = attendees(eventId);
	const going = new Set(people.map((p) => p.id));
	// Only picks by and about people still going count: someone who drops out takes their picks with them.
	const rows = (
		db
			.prepare(
				`SELECT p.user_id, p.award, p.nominee_id, u.name, n.name AS nominee FROM predictions p
				 JOIN users u ON u.id = p.user_id JOIN users n ON n.id = p.nominee_id
				 WHERE p.event_id = ? ORDER BY u.name, p.user_id`
			)
			.all(eventId) as { user_id: number; award: Award; nominee_id: number; name: string; nominee: string }[]
	).filter((r) => going.has(r.user_id) && going.has(r.nominee_id));
	const mine = Object.fromEntries(rows.filter((r) => r.user_id === userId).map((r) => [r.award, r.nominee_id])) as Partial<Record<Award, number>>;
	const predictors = [...new Set(rows.map((r) => r.user_id))];
	const base = { locked, open: !!event.starts_at && !locked, people, canPredict: going.has(userId), mine, count: predictors.length };
	if (!locked) return { ...base, table: [], decided: false };

	const winners = db.prepare(`SELECT award, nominee_id FROM (${WINNERS}) WHERE event_id = ?`).all(eventId) as { award: Award; nominee_id: number }[];
	const decided = winners.length > 0;
	const table = predictors
		.map((id) => {
			const picks = rows.filter((r) => r.user_id === id);
			const cells = Object.keys(AWARDS).map((award) => {
				const pick = picks.find((r) => r.award === award);
				const won = winners.filter((w) => w.award === award);
				return { award: award as Award, nominee: pick?.nominee ?? null, right: !!pick && won.some((w) => w.nominee_id === pick.nominee_id) };
			});
			return { user_id: id, name: picks[0].name, cells, score: cells.filter((c) => c.right).length };
		})
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
	return { ...base, table, decided };
}

// ---- Photos for the night recap card (WG-33) ----

const UPLOADS = process.env.UPLOADS_PATH ?? 'data/uploads';
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Detects the image type from its first bytes rather than trusting the browser. */
function imageType(bytes: Uint8Array) {
	const hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
	if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg' };
	if (hex.startsWith('89504e47')) return { mime: 'image/png', ext: 'png' };
	if (hex.startsWith('47494638')) return { mime: 'image/gif', ext: 'gif' };
	if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return { mime: 'image/webp', ext: 'webp' };
	return null;
}

export async function addPhoto(eventId: number, userId: number, file: File, live = true) {
	requireMember(eventId, userId);
	if (!(file instanceof File) || file.size === 0) throw new EventError('Choose a photo to upload.');
	if (file.size > MAX_PHOTO_BYTES) throw new EventError('Photos must be under 8 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const type = imageType(bytes);
	if (!type) throw new EventError('Photos must be JPEG, PNG, GIF or WebP.');
	mkdirSync(UPLOADS, { recursive: true });
	const filename = `${randomUUID()}.${type.ext}`;
	writeFileSync(join(UPLOADS, filename), bytes);
	const { lastInsertRowid } = db
		.prepare('INSERT INTO event_photos (event_id, user_id, filename, mime) VALUES (?, ?, ?, ?)')
		.run(eventId, userId, filename, type.mime);
	// Callers that save more alongside the photo update open pages themselves, once.
	if (live) publish(eventId);
	return Number(lastInsertRowid);
}

/** Photos from a photo drop stay hidden until its uploads close: the 2 minutes plus 30 seconds' grace. */
export const DROP_REVEAL_MS = 150_000;
const inRunningDrop = `p.id IN (SELECT dp.photo_id FROM drop_photos dp JOIN photo_drops d ON d.id = dp.drop_id WHERE d.fire_at + ${DROP_REVEAL_MS} > ?)`;

export function listPhotos(eventId: number, nowMs = Date.now()) {
	return db
		.prepare(
			`SELECT p.id, u.name FROM event_photos p JOIN users u ON u.id = p.user_id
			 WHERE p.event_id = ? AND NOT ${inRunningDrop} ORDER BY p.id`
		)
		.all(eventId, nowMs) as { id: number; name: string }[];
}

/** A photo, unless it's someone else's in a photo drop that hasn't been revealed yet. */
export function readPhoto(eventId: number, photoId: number, viewerId: number, nowMs = Date.now()) {
	const photo = db
		.prepare(`SELECT filename, mime FROM event_photos p WHERE p.id = ? AND p.event_id = ? AND (p.user_id = ? OR NOT ${inRunningDrop})`)
		.get(photoId, eventId, viewerId, nowMs) as { filename: string; mime: string } | undefined;
	if (!photo) return null;
	const path = join(UPLOADS, photo.filename);
	if (!existsSync(path)) return null;
	return { mime: photo.mime, bytes: readFileSync(path) };
}

/** Removes photo files from disk; call before deleting their rows. */
export function removePhotoFiles(filenames: string[]) {
	for (const name of filenames) {
		// Filenames are UUIDs the server made, but never follow anything that looks like a path.
		if (/^[\w-]+\.\w+$/.test(name)) rmSync(join(UPLOADS, name), { force: true });
	}
}
