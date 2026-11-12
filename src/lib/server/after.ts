import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db.ts';
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
function attendees(eventId: number) {
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
const WINNERS = `
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

export async function addPhoto(eventId: number, userId: number, file: File) {
	requireMember(eventId, userId);
	if (!(file instanceof File) || file.size === 0) throw new EventError('Choose a photo to upload.');
	if (file.size > MAX_PHOTO_BYTES) throw new EventError('Photos must be under 8 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const type = imageType(bytes);
	if (!type) throw new EventError('Photos must be JPEG, PNG, GIF or WebP.');
	mkdirSync(UPLOADS, { recursive: true });
	const filename = `${randomUUID()}.${type.ext}`;
	writeFileSync(join(UPLOADS, filename), bytes);
	db.prepare('INSERT INTO event_photos (event_id, user_id, filename, mime) VALUES (?, ?, ?, ?)').run(
		eventId,
		userId,
		filename,
		type.mime
	);
	publish(eventId);
}

export function listPhotos(eventId: number) {
	return db
		.prepare(
			`SELECT p.id, u.name FROM event_photos p JOIN users u ON u.id = p.user_id WHERE p.event_id = ? ORDER BY p.id`
		)
		.all(eventId) as { id: number; name: string }[];
}

export function readPhoto(eventId: number, photoId: number) {
	const photo = db
		.prepare('SELECT filename, mime FROM event_photos WHERE id = ? AND event_id = ?')
		.get(photoId, eventId) as { filename: string; mime: string } | undefined;
	if (!photo) return null;
	return { mime: photo.mime, bytes: readFileSync(join(UPLOADS, photo.filename)) };
}
