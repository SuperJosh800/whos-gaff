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
	`,
	`
	CREATE TABLE gaffs (
		id INTEGER PRIMARY KEY,
		owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		address TEXT NOT NULL DEFAULT '',
		house_rules TEXT NOT NULL DEFAULT '',
		wifi TEXT NOT NULL DEFAULT '',
		coats TEXT NOT NULL DEFAULT '',
		parking TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT ''
	);
	ALTER TABLE events ADD COLUMN gaff_id INTEGER REFERENCES gaffs(id) ON DELETE SET NULL;
	ALTER TABLE events ADD COLUMN playlist_url TEXT NOT NULL DEFAULT '';
	CREATE TABLE bring_items (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		added_by INTEGER NOT NULL REFERENCES users(id),
		claimed_by INTEGER REFERENCES users(id)
	);
	CREATE TABLE damage_log (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		reported_by INTEGER NOT NULL REFERENCES users(id),
		culprit TEXT NOT NULL,
		what TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	`,
	`
	CREATE TABLE timeline_stages (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		starts_at TEXT NOT NULL,
		place TEXT NOT NULL DEFAULT ''
	);
	CREATE TABLE moves (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		place TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE home_plans (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		details TEXT NOT NULL DEFAULT '',
		PRIMARY KEY (event_id, user_id)
	);
	CREATE TABLE home_safe (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		at TEXT NOT NULL,
		PRIMARY KEY (event_id, user_id)
	);
	CREATE TABLE rounds (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		skipped INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE expenses (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		paid_by INTEGER NOT NULL REFERENCES users(id),
		description TEXT NOT NULL,
		amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE expense_shares (
		expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		PRIMARY KEY (expense_id, user_id)
	);
	CREATE TABLE settlements (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		from_user INTEGER NOT NULL REFERENCES users(id),
		to_user INTEGER NOT NULL REFERENCES users(id),
		amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	ALTER TABLE users ADD COLUMN payment_link TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN payday INTEGER CHECK (payday BETWEEN 1 AND 31);
	`,
	`
	CREATE TABLE friend_groups (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		invite_token TEXT NOT NULL UNIQUE,
		created_by INTEGER NOT NULL REFERENCES users(id),
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE group_members (
		group_id INTEGER NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		joined_at TEXT NOT NULL DEFAULT (datetime('now')),
		PRIMARY KEY (group_id, user_id)
	);
	ALTER TABLE events ADD COLUMN group_id INTEGER REFERENCES friend_groups(id) ON DELETE SET NULL;
	CREATE TABLE free_gaffs (
		id INTEGER PRIMARY KEY,
		group_id INTEGER NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		place TEXT NOT NULL,
		from_date TEXT NOT NULL,
		to_date TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE pings (
		id INTEGER PRIMARY KEY,
		group_id INTEGER NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE ping_answers (
		ping_id INTEGER NOT NULL REFERENCES pings(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		answer TEXT NOT NULL CHECK (answer IN ('yes', 'no')),
		PRIMARY KEY (ping_id, user_id)
	);
	`,
	`
	CREATE TABLE award_votes (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		award TEXT NOT NULL,
		voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		nominee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		PRIMARY KEY (event_id, award, voter_id)
	);
	CREATE TABLE event_photos (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		filename TEXT NOT NULL,
		mime TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	`,
	`
	ALTER TABLE pings ADD COLUMN plan TEXT NOT NULL DEFAULT 'anything' CHECK (plan IN ('pub', 'home', 'club', 'food', 'anything'));
	ALTER TABLE pings ADD COLUMN on_date TEXT;
	`,
	`
	-- Only a hash of each reset token is stored, like sessions.
	CREATE TABLE password_resets (
		token_hash TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);
	CREATE INDEX sessions_user ON sessions(user_id);
	ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
	`,
	`
	-- The game currently running at an event. cards and meta are a snapshot of the game when it started,
	-- so editing or deleting a custom game doesn't break one in progress. deck is the play order (card indexes),
	-- picks the players named on the current card ({1}, {2}…).
	CREATE TABLE event_activity (
		event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
		game TEXT NOT NULL,
		meta TEXT NOT NULL,
		cards TEXT NOT NULL,
		deck TEXT NOT NULL,
		position INTEGER NOT NULL DEFAULT 0,
		picks TEXT NOT NULL DEFAULT '[]',
		-- The last secret mission, shown to everyone once it's finished (JSON, or NULL).
		reveal TEXT,
		soft INTEGER NOT NULL DEFAULT 0,
		updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	-- Games people make themselves. Anyone on an event with the owner can play them there.
	CREATE TABLE custom_games (
		id INTEGER PRIMARY KEY,
		owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		emoji TEXT NOT NULL DEFAULT '🎲',
		setting TEXT NOT NULL CHECK (setting IN ('pub', 'club', 'gaff', 'any')),
		rules TEXT NOT NULL DEFAULT '',
		scored INTEGER NOT NULL DEFAULT 0,
		cards TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE INDEX custom_games_owner ON custom_games(owner_id);
	CREATE TABLE challenge_results (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		challenge TEXT NOT NULL,
		points INTEGER NOT NULL,
		done INTEGER NOT NULL CHECK (done IN (0, 1)),
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE INDEX challenge_results_event ON challenge_results(event_id);
	`,
	`
	-- Games open in a lobby: people join, then someone starts it and only those players are dealt cards.
	-- A game already running when this was added counts as started.
	ALTER TABLE event_activity ADD COLUMN started INTEGER NOT NULL DEFAULT 1;
	CREATE TABLE game_players (
		event_id INTEGER NOT NULL REFERENCES event_activity(event_id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		joined_at TEXT NOT NULL DEFAULT (datetime('now')),
		PRIMARY KEY (event_id, user_id)
	);
	-- Smaller rounds within an event (WG-40). With none, everyone going is one round (group_id NULL).
	CREATE TABLE round_groups (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE TABLE round_group_members (
		group_id INTEGER NOT NULL REFERENCES round_groups(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		PRIMARY KEY (group_id, user_id)
	);
	ALTER TABLE rounds ADD COLUMN group_id INTEGER REFERENCES round_groups(id) ON DELETE CASCADE;
	`,
	`
	-- Players who have tapped "Next card" on the current card (JSON list of user ids). The card moves on
	-- once at least half the players have, and the list empties.
	ALTER TABLE event_activity ADD COLUMN next_votes TEXT NOT NULL DEFAULT '[]';
	`,
	`
	-- Secret missions run through the whole night (Night tab), one per person, instead of as a card game.
	-- text is the mission with names filled in; a photo mission needs a photo as proof.
	-- caught_by is whoever called it out; status is live until done, caught or swapped.
	CREATE TABLE missions (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		text TEXT NOT NULL,
		points INTEGER NOT NULL,
		photo INTEGER NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'done', 'caught', 'swapped')),
		caught_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
		photo_id INTEGER REFERENCES event_photos(id) ON DELETE SET NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		finished_at TEXT
	);
	CREATE INDEX missions_event ON missions(event_id);
	CREATE UNIQUE INDEX missions_one_live ON missions(event_id, user_id) WHERE status = 'live';
	-- Every call-out, so wrong guesses are shown and the same person can't be called out over and over.
	CREATE TABLE mission_guesses (
		id INTEGER PRIMARY KEY,
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		suspect_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	`,
	`
	-- Phones and browsers that want push notifications. endpoint is the push service URL for that device.
	-- Each belongs to the login that turned it on, so logging out of that phone stops its pushes.
	CREATE TABLE push_subscriptions (
		endpoint TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
		p256dh TEXT NOT NULL,
		auth TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);
	CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
	-- Values the server makes for itself once, such as the push signing keys.
	CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	`,
	`
	-- Before the night, who people think will win each award; the award votes afterwards say who called it.
	CREATE TABLE predictions (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		award TEXT NOT NULL,
		nominee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		PRIMARY KEY (event_id, user_id, award)
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
