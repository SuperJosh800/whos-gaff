// Photo drop: the host sets one off now or at a random moment; everyone going then has 2 minutes to take
// a photo, and the photos are shown together once the time is up.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireHost, requireMember } from './events.ts';
import { canSeeAddress } from './gaff.ts';
import { goingPeople } from './money.ts';
import { addPhoto, removePhotoFiles } from './after.ts';
import { nowLocal, shiftLocal } from '../time.ts';

/** How long everyone has to take their photo. */
export const DROP_MS = 2 * 60_000;
/** Uploads that started in time can take a little longer to arrive. */
const GRACE_MS = 30_000;
/** A random drop goes off between 15 minutes and 2 hours after it's set (or after the start). */
const RANDOM_MIN_MS = 15 * 60_000;
const RANDOM_MAX_MS = 120 * 60_000;
export const MAX_DROPS = 6;

type DropRow = { id: number; fire_at: number };

/** Minutes between two UK wall-clock times. */
const minutesBetween = (from: string, to: string) => (Date.parse(to + 'Z') - Date.parse(from + 'Z')) / 60_000;

/**
 * Sets off a photo drop, now or at a random moment. Only one can be waiting or running at a time, and
 * a random one waits until the night has started. Works until 12 hours after the start.
 */
export function armDrop(eventId: number, hostId: number, when: 'now' | 'random', nowMs = Date.now(), random = Math.random) {
	const event = requireHost(eventId, hostId);
	const now = nowLocal(new Date(nowMs));
	if (!event.starts_at) throw new EventError('Set a date first.');
	if (now >= shiftLocal(event.starts_at, 12 * 60)) throw new EventError('The night’s over.');
	if (when === 'now' && now < event.starts_at) throw new EventError('You can drop one now once the night has started.');
	const busy = db.prepare('SELECT 1 FROM photo_drops WHERE event_id = ? AND fire_at + ? > ?').get(eventId, DROP_MS, nowMs);
	if (busy) throw new EventError('There’s already a photo drop on its way.');
	const { n } = db.prepare('SELECT COUNT(*) AS n FROM photo_drops WHERE event_id = ?').get(eventId) as { n: number };
	if (n >= MAX_DROPS) throw new EventError(`That’s ${MAX_DROPS} photo drops already.`);
	const start = nowMs + Math.max(0, minutesBetween(now, event.starts_at)) * 60_000;
	const fireAt = when === 'now' ? nowMs : Math.round(start + RANDOM_MIN_MS + random() * (RANDOM_MAX_MS - RANDOM_MIN_MS));
	db.prepare('INSERT INTO photo_drops (event_id, fire_at) VALUES (?, ?)').run(eventId, fireAt);
	if (when === 'now') fireDueDrops(nowMs);
	else publish(eventId);
}

/** The host calls off a drop that hasn't gone off yet. */
export function cancelDrop(eventId: number, hostId: number, nowMs = Date.now()) {
	requireHost(eventId, hostId);
	db.prepare('DELETE FROM photo_drops WHERE event_id = ? AND fire_at > ?').run(eventId, nowMs);
	publish(eventId);
}

/**
 * Tells everyone going about drops that have just gone off, once. Called every 30 seconds; a drop whose
 * 2 minutes passed while the server was down is marked done without telling anyone.
 */
export function fireDueDrops(nowMs = Date.now()) {
	const due = db.prepare('SELECT d.id, d.event_id, d.fire_at, e.title FROM photo_drops d JOIN events e ON e.id = d.event_id WHERE d.notified = 0 AND d.fire_at <= ?').all(nowMs) as {
		id: number;
		event_id: number;
		fire_at: number;
		title: string;
	}[];
	for (const d of due) {
		db.prepare('UPDATE photo_drops SET notified = 1 WHERE id = ?').run(d.id);
		if (nowMs >= d.fire_at + DROP_MS) continue;
		for (const p of goingPeople(d.event_id)) notify(p.id, d.event_id, `Photo drop! Take a photo in the next 2 minutes. (${d.title})`, '/night#drop');
		publish(d.event_id);
	}
}

/** Sends your photo for the drop that's running. One each. */
export async function sendDropPhoto(eventId: number, userId: number, dropId: number, file: File | null, nowMs = Date.now()) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('RSVP “going” to join the photo drop.');
	const drop = db.prepare('SELECT id, fire_at FROM photo_drops WHERE id = ? AND event_id = ?').get(dropId, eventId) as DropRow | undefined;
	if (!drop || nowMs < drop.fire_at) throw new EventError('That photo drop hasn’t started.');
	if (nowMs > drop.fire_at + DROP_MS + GRACE_MS) throw new EventError('Too late, the 2 minutes are up.');
	if (db.prepare('SELECT 1 FROM drop_photos WHERE drop_id = ? AND user_id = ?').get(dropId, userId)) throw new EventError('You’ve already sent yours.');
	if (!(file instanceof File) || file.size === 0) throw new EventError('Take a photo first.');
	const photoId = await addPhoto(eventId, userId, file);
	// A double tap can get here twice while the first upload is being saved: keep the first photo only.
	const { changes } = db.prepare('INSERT OR IGNORE INTO drop_photos (drop_id, user_id, photo_id) VALUES (?, ?, ?)').run(dropId, userId, photoId);
	if (!changes) {
		const row = db.prepare('SELECT filename FROM event_photos WHERE id = ?').get(photoId) as { filename: string };
		removePhotoFiles([row.filename]);
		db.prepare('DELETE FROM event_photos WHERE id = ?').run(photoId);
	}
	publish(eventId);
}

/**
 * What the page shows: whether a drop is waiting (its time stays secret), the one running now, and
 * the photos from drops that have finished. Photos stay hidden until the 2 minutes are up.
 */
export function getDrops(eventId: number, viewerId: number, nowMs = Date.now()) {
	requireMember(eventId, viewerId);
	const drops = db.prepare('SELECT id, fire_at FROM photo_drops WHERE event_id = ? ORDER BY fire_at DESC').all(eventId) as DropRow[];
	const photos = db.prepare(
		'SELECT p.id, u.name, dp.user_id FROM drop_photos dp JOIN event_photos p ON p.id = dp.photo_id JOIN users u ON u.id = dp.user_id WHERE dp.drop_id = ? ORDER BY p.id'
	);
	const liveRow = drops.find((d) => d.fire_at <= nowMs && nowMs < d.fire_at + DROP_MS);
	return {
		waiting: drops.some((d) => d.fire_at > nowMs),
		live: liveRow
			? {
					id: liveRow.id,
					endsAt: liveRow.fire_at + DROP_MS,
					sent: (photos.all(liveRow.id) as { user_id: number }[]).length,
					mine: (photos.all(liveRow.id) as { user_id: number }[]).some((p) => p.user_id === viewerId)
				}
			: null,
		done: drops
			.filter((d) => d.fire_at + DROP_MS <= nowMs)
			.map((d) => ({ id: d.id, at: nowLocal(new Date(d.fire_at)), photos: (photos.all(d.id) as { id: number; name: string }[]).map(({ id, name }) => ({ id, name })) })),
		canArm: drops.length < MAX_DROPS && !drops.some((d) => d.fire_at + DROP_MS > nowMs)
	};
}
