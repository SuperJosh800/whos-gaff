import { db } from './db.ts';
import { pushTo } from './push.ts';

export type Notification = {
	id: number;
	event_id: number | null;
	message: string;
	read: number;
	created_at: string;
};

/**
 * Adds an update for someone and pushes it to their phone. `path` is where tapping the push opens:
 * within the event, such as '/games', or anywhere when there's no event, such as '/groups/3'.
 */
export function notify(userId: number, eventId: number | null, message: string, path = '') {
	db.prepare('INSERT INTO notifications (user_id, event_id, message) VALUES (?, ?, ?)').run(
		userId,
		eventId,
		message
	);
	// A push that fails must never undo or break the update itself.
	try {
		pushTo(userId, { body: message, url: eventId ? `/events/${eventId}${path}` : path || '/' }).catch((e) =>
			console.error('[push] failed', e)
		);
	} catch (e) {
		console.error('[push] failed', e);
	}
}

export function listNotifications(userId: number, limit = 10) {
	return db
		.prepare(
			`SELECT id, event_id, message, read, created_at FROM notifications
			 WHERE user_id = ? ORDER BY id DESC LIMIT ?`
		)
		.all(userId, limit) as Notification[];
}

export function markAllRead(userId: number) {
	db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
}
