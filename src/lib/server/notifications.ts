import { db } from './db.ts';

export type Notification = {
	id: number;
	event_id: number | null;
	message: string;
	read: number;
	created_at: string;
};

export function notify(userId: number, eventId: number | null, message: string) {
	db.prepare('INSERT INTO notifications (user_id, event_id, message) VALUES (?, ?, ?)').run(
		userId,
		eventId,
		message
	);
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
