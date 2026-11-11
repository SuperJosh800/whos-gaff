import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Each entry runs once, in order; PRAGMA user_version records how many have run.
// Append new migrations; never edit one that has shipped.
const migrations: string[] = [
	`
	CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		name TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE sessions (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);
	`,
	`
	-- starts_at is NULL while a date poll is open; once set, the date is locked and RSVPs open.
	CREATE TABLE events (
		id INTEGER PRIMARY KEY,
		host_id INTEGER NOT NULL REFERENCES users(id),
		title TEXT NOT NULL,
		details TEXT NOT NULL DEFAULT '',
		location TEXT NOT NULL DEFAULT '',
		mode TEXT NOT NULL CHECK (mode IN ('fixed', 'poll')),
		starts_at TEXT,
		vote_deadline TEXT,
		invite_token TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE event_members (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		joined_at TEXT NOT NULL DEFAULT (datetime('now')),
		PRIMARY KEY (event_id, user_id)
	);
	CREATE INDEX event_members_user ON event_members(user_id);
	CREATE TABLE date_options (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		starts_at TEXT NOT NULL,
		suggested_by INTEGER NOT NULL REFERENCES users(id),
		UNIQUE (event_id, starts_at)
	);
	CREATE TABLE votes (
		option_id INTEGER NOT NULL REFERENCES date_options(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		available INTEGER NOT NULL CHECK (available IN (0, 1)),
		PRIMARY KEY (option_id, user_id)
	);
	CREATE TABLE rsvps (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		response TEXT NOT NULL CHECK (response IN ('yes', 'no', 'maybe')),
		updated_at TEXT NOT NULL DEFAULT (datetime('now')),
		PRIMARY KEY (event_id, user_id)
	);
	CREATE TABLE email_invites (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		email TEXT NOT NULL COLLATE NOCASE,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		PRIMARY KEY (event_id, email)
	);
	CREATE TABLE notifications (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
		message TEXT NOT NULL,
		read INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE INDEX notifications_user ON notifications(user_id, read);
	CREATE TABLE messages (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		body TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	`
];

function open(path: string) {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
	const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = user_version; v < migrations.length; v++) {
		db.exec('BEGIN');
		try {
			db.exec(migrations[v]);
			db.exec(`PRAGMA user_version = ${v + 1}`);
			db.exec('COMMIT');
		} catch (e) {
			db.exec('ROLLBACK');
			throw e;
		}
	}
	return db;
}

export const db = open(process.env.DATABASE_PATH ?? 'data/whos-gaff.db');

/** Runs fn inside a transaction. */
export function tx<T>(fn: () => T): T {
	db.exec('BEGIN');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}
