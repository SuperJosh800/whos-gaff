import { randomBytes } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { sendMail } from './mail.ts';
import { notify } from './notifications.ts';
import { formatWhen, isLocalDateTime, nowLocal, shiftLocal } from '../time.ts';

export type Event = {
	id: number;
	host_id: number;
	title: string;
	details: string;
	location: string;
	mode: 'fixed' | 'poll';
	/** NULL while a date poll is still open. */
	starts_at: string | null;
	vote_deadline: string | null;
	invite_token: string;
	created_at: string;
	gaff_id: number | null;
	group_id: number | null;
	playlist_url: string;
	/** The dress code or theme the host locked in, or '' while it's still a poll. */
	theme: string;
	theme_told: string;
	/** 7 or 14 when the next night is made automatically once this one starts. */
	repeat_days: number | null;
	repeated_from: number | null;
};

export type DateOption = {
	id: number;
	starts_at: string;
	suggested_by: number;
	suggested_by_name: string;
	can: number;
	cant: number;
	/** The current user's vote: 1 can, 0 can't, null not voted. */
	mine: 0 | 1 | null;
	can_names: string | null;
};

export type Rsvp = 'yes' | 'no' | 'maybe';

/** An error caused by the user's input, safe to show them. */
export class EventError extends Error {}

/** Runs a form action, turning an EventError into a 400 with its message. */
export async function asAction<T>(fn: () => T | Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof EventError) return fail(400, { error: e.message });
		throw e;
	}
}

const MAX_TITLE = 120;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getEvent(eventId: number) {
	return db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Event | undefined;
}

export function isMember(eventId: number, userId: number) {
	return !!db
		.prepare('SELECT 1 FROM event_members WHERE event_id = ? AND user_id = ?')
		.get(eventId, userId);
}

/** Voting is open on an unlocked date poll until its deadline passes. */
export function votingOpen(event: Event, now = nowLocal()) {
	return (
		event.mode === 'poll' &&
		event.starts_at === null &&
		!(event.vote_deadline && event.vote_deadline <= now)
	);
}

function requireEvent(eventId: number) {
	const event = getEvent(eventId);
	if (!event) throw new EventError('Event not found.');
	return event;
}

export function requireMember(eventId: number, userId: number) {
	const event = requireEvent(eventId);
	if (!isMember(eventId, userId)) throw new EventError('You are not invited to this event.');
	return event;
}

export function requireHost(eventId: number, userId: number) {
	const event = requireEvent(eventId);
	if (event.host_id !== userId) throw new EventError('Only the host can do that.');
	return event;
}

function requireVotingOpen(event: Event) {
	if (!votingOpen(event)) throw new EventError('Voting is closed for this event.');
}

function validateFutureDate(value: string, what: string) {
	if (!isLocalDateTime(value)) throw new EventError(`Enter a valid ${what}.`);
	if (value <= nowLocal()) throw new EventError(`The ${what} must be in the future.`);
}

export type NewEvent = {
	title: string;
	details?: string;
	location?: string;
	mode: 'fixed' | 'poll';
	startsAt?: string;
	options?: string[];
	voteDeadline?: string;
	/** A saved gaff profile of the host's (WG-24). */
	gaffId?: number | null;
	/** A group of the host's; all its members are invited. */
	groupId?: number | null;
};

export function createEvent(hostId: number, input: NewEvent) {
	const title = input.title.trim();
	if (!title) throw new EventError('Give the event a title.');
	if (title.length > MAX_TITLE) throw new EventError('That title is too long.');

	let startsAt: string | null = null;
	let options: string[] = [];
	let deadline: string | null = null;
	if (input.mode === 'fixed') {
		startsAt = input.startsAt ?? '';
		validateFutureDate(startsAt, 'date and time');
	} else if (input.mode === 'poll') {
		options = [...new Set((input.options ?? []).filter(Boolean))].sort();
		if (options.length < 2) throw new EventError('Add at least two date options for the poll.');
		for (const o of options) validateFutureDate(o, 'date option');
		if (input.voteDeadline) {
			deadline = input.voteDeadline;
			validateFutureDate(deadline, 'voting deadline');
			if (deadline >= options[0]) {
				throw new EventError('The voting deadline must be before the first date option.');
			}
		}
	} else {
		throw new EventError('Choose a fixed date or a date poll.');
	}
	const gaffId = input.gaffId || null;
	if (gaffId && !db.prepare('SELECT 1 FROM gaffs WHERE id = ? AND owner_id = ?').get(gaffId, hostId)) {
		throw new EventError('Gaff profile not found.');
	}
	const groupId = input.groupId || null;
	if (groupId && !db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, hostId)) {
		throw new EventError('You’re not in that group.');
	}

	const eventId = tx(() => {
		const { lastInsertRowid } = db
			.prepare(
				`INSERT INTO events (host_id, title, details, location, mode, starts_at, vote_deadline, invite_token, gaff_id, group_id)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				hostId,
				title,
				(input.details ?? '').trim(),
				(input.location ?? '').trim(),
				input.mode,
				startsAt,
				deadline,
				randomBytes(12).toString('base64url'),
				gaffId,
				groupId
			);
		const eventId = Number(lastInsertRowid);
		db.prepare('INSERT INTO event_members (event_id, user_id) VALUES (?, ?)').run(eventId, hostId);
		const insertOption = db.prepare(
			'INSERT INTO date_options (event_id, starts_at, suggested_by) VALUES (?, ?, ?)'
		);
		for (const o of options) insertOption.run(eventId, o, hostId);
		if (groupId) {
			db.prepare(
				`INSERT OR IGNORE INTO event_members (event_id, user_id) SELECT ?, user_id FROM group_members WHERE group_id = ?`
			).run(eventId, groupId);
		}
		return eventId;
	});
	if (groupId) {
		const host = db.prepare('SELECT name FROM users WHERE id = ?').get(hostId) as { name: string };
		const guests = db
			.prepare('SELECT user_id FROM event_members WHERE event_id = ? AND user_id != ?')
			.all(eventId, hostId) as { user_id: number }[];
		for (const g of guests) notify(g.user_id, eventId, `${host.name} invited you to ${title}.`);
	}
	return eventId;
}

// ---- Date options and votes ----

export function listOptions(eventId: number, userId: number) {
	return db
		.prepare(
			`SELECT o.id, o.starts_at, o.suggested_by, u.name AS suggested_by_name,
				COALESCE(SUM(v.available = 1), 0) AS can,
				COALESCE(SUM(v.available = 0), 0) AS cant,
				MAX(CASE WHEN v.user_id = ? THEN v.available END) AS mine,
				GROUP_CONCAT(CASE WHEN v.available = 1 THEN vu.name END, ', ') AS can_names
			 FROM date_options o
			 JOIN users u ON u.id = o.suggested_by
			 LEFT JOIN votes v ON v.option_id = o.id
			 LEFT JOIN users vu ON vu.id = v.user_id
			 WHERE o.event_id = ?
			 GROUP BY o.id ORDER BY o.starts_at`
		)
		.all(userId, eventId) as DateOption[];
}

/** Every vote on the event's options, for the person × date grid. */
export function listVotes(eventId: number) {
	return db
		.prepare(
			`SELECT v.option_id, v.user_id, v.available FROM votes v
			 JOIN date_options o ON o.id = v.option_id WHERE o.event_id = ?`
		)
		.all(eventId) as { option_id: number; user_id: number; available: 0 | 1 }[];
}

function requireOption(eventId: number, optionId: number) {
	const option = db
		.prepare('SELECT id, starts_at FROM date_options WHERE id = ? AND event_id = ?')
		.get(optionId, eventId) as { id: number; starts_at: string } | undefined;
	if (!option) throw new EventError('That date option no longer exists.');
	return option;
}

function insertOption(eventId: number, userId: number, startsAt: string) {
	validateFutureDate(startsAt, 'date');
	const existing = db
		.prepare('SELECT 1 FROM date_options WHERE event_id = ? AND starts_at = ?')
		.get(eventId, startsAt);
	if (existing) throw new EventError('That date is already an option.');
	db.prepare('INSERT INTO date_options (event_id, starts_at, suggested_by) VALUES (?, ?, ?)').run(
		eventId,
		startsAt,
		userId
	);
}

/** The host adds a date option. */
export function addOption(eventId: number, hostId: number, startsAt: string) {
	requireVotingOpen(requireHost(eventId, hostId));
	insertOption(eventId, hostId, startsAt);
	publish(eventId);
}

/** A guest suggests a new date; it joins the poll like any other option. */
export function suggestOption(eventId: number, userId: number, startsAt: string) {
	requireVotingOpen(requireMember(eventId, userId));
	insertOption(eventId, userId, startsAt);
	publish(eventId);
}

/** The host moves an option to a new date. Votes for it are cleared, since they were for the old date. */
export function updateOption(eventId: number, hostId: number, optionId: number, startsAt: string) {
	requireVotingOpen(requireHost(eventId, hostId));
	const option = requireOption(eventId, optionId);
	if (option.starts_at === startsAt) return;
	validateFutureDate(startsAt, 'date');
	if (db.prepare('SELECT 1 FROM date_options WHERE event_id = ? AND starts_at = ?').get(eventId, startsAt)) {
		throw new EventError('That date is already an option.');
	}
	tx(() => {
		db.prepare('UPDATE date_options SET starts_at = ? WHERE id = ?').run(startsAt, optionId);
		db.prepare('DELETE FROM votes WHERE option_id = ?').run(optionId);
	});
	publish(eventId);
}

export function removeOption(eventId: number, hostId: number, optionId: number) {
	requireVotingOpen(requireHost(eventId, hostId));
	requireOption(eventId, optionId);
	const { n } = db.prepare('SELECT COUNT(*) AS n FROM date_options WHERE event_id = ?').get(eventId) as {
		n: number;
	};
	if (n <= 1) throw new EventError('A poll needs at least one date option.');
	db.prepare('DELETE FROM date_options WHERE id = ?').run(optionId);
	publish(eventId);
}

/** Sets the user's vote on an option; null clears it back to no answer. */
export function setVote(eventId: number, userId: number, optionId: number, available: boolean | null) {
	requireVotingOpen(requireMember(eventId, userId));
	requireOption(eventId, optionId);
	if (available === null) {
		db.prepare('DELETE FROM votes WHERE option_id = ? AND user_id = ?').run(optionId, userId);
		publish(eventId);
		return;
	}
	db.prepare(
		`INSERT INTO votes (option_id, user_id, available) VALUES (?, ?, ?)
		 ON CONFLICT (option_id, user_id) DO UPDATE SET available = excluded.available`
	).run(optionId, userId, available ? 1 : 0);
	publish(eventId);
}

/** The host locks the event to one option: voting closes, guests are told, and RSVPs open. */
export async function pickWinner(eventId: number, hostId: number, optionId: number, origin: string) {
	const event = requireHost(eventId, hostId);
	if (event.mode !== 'poll' || event.starts_at) throw new EventError('The date is already set.');
	const option = requireOption(eventId, optionId);
	db.prepare('UPDATE events SET starts_at = ? WHERE id = ?').run(option.starts_at, eventId);
	// Stages planned before the vote ended move to the winning day, keeping their times (WG-38).
	const first = db.prepare('SELECT MIN(starts_at) AS at FROM timeline_stages WHERE event_id = ?').get(eventId) as {
		at: string | null;
	};
	if (first.at) {
		const days = (Date.parse(option.starts_at.slice(0, 10)) - Date.parse(first.at.slice(0, 10))) / 86_400_000;
		const stages = db.prepare('SELECT id, starts_at FROM timeline_stages WHERE event_id = ?').all(eventId) as {
			id: number;
			starts_at: string;
		}[];
		const move = db.prepare('UPDATE timeline_stages SET starts_at = ? WHERE id = ?');
		for (const s of stages) move.run(shiftLocal(s.starts_at, days * 24 * 60), s.id);
	}

	const message = `${event.title} is on ${formatWhen(option.starts_at)}. RSVPs are open!`;
	const guests = db
		.prepare(
			`SELECT u.id, u.email FROM event_members m JOIN users u ON u.id = m.user_id
			 WHERE m.event_id = ? AND m.user_id != ?`
		)
		.all(eventId, hostId) as { id: number; email: string }[];
	for (const guest of guests) notify(guest.id, eventId, message);
	publish(eventId);
	await Promise.all(
		guests.map((g) =>
			sendMail(g.email, `Date set: ${event.title}`, `${message}\n\nRSVP here: ${origin}/events/${eventId}`)
		)
	);
}

// ---- RSVPs ----

export function setRsvp(eventId: number, userId: number, response: Rsvp) {
	const event = requireMember(eventId, userId);
	if (!event.starts_at) throw new EventError('RSVPs open once the date is set.');
	if (!['yes', 'no', 'maybe'].includes(response)) throw new EventError('Choose yes, no or maybe.');
	db.prepare(
		`INSERT INTO rsvps (event_id, user_id, response) VALUES (?, ?, ?)
		 ON CONFLICT (event_id, user_id) DO UPDATE SET response = excluded.response, updated_at = datetime('now')`
	).run(eventId, userId, response);
	publish(eventId);
}

export type Attendee = { id: number; name: string; response: Rsvp | null; is_host: number };

export function listAttendees(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name, r.response, (u.id = e.host_id) AS is_host
			 FROM event_members m
			 JOIN events e ON e.id = m.event_id
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 WHERE m.event_id = ? ORDER BY is_host DESC, u.name`
		)
		.all(eventId) as Attendee[];
}

/** Emails invited to the event that have not joined yet. */
export function listPendingInvites(eventId: number) {
	return (
		db
			.prepare(
				`SELECT i.email FROM email_invites i
				 WHERE i.event_id = ? AND NOT EXISTS (
					SELECT 1 FROM event_members m JOIN users u ON u.id = m.user_id
					WHERE m.event_id = i.event_id AND u.email = i.email
				 ) ORDER BY i.email`
			)
			.all(eventId) as { email: string }[]
	).map((r) => r.email);
}

// ---- Playlist (WG-34) ----

export function setPlaylist(eventId: number, hostId: number, url: string) {
	requireHost(eventId, hostId);
	url = url.trim();
	if (url && !/^https:\/\/(open\.spotify\.com|spotify\.link)\//.test(url)) {
		throw new EventError('Paste a Spotify playlist link (https://open.spotify.com/…).');
	}
	db.prepare('UPDATE events SET playlist_url = ? WHERE id = ?').run(url, eventId);
	publish(eventId);
}

// ---- Messages ----

export type Message = { id: number; user_id: number; name: string; body: string; created_at: string };

/** The event's group chat, visible to everyone invited. */
export function listMessages(eventId: number, limit = 200) {
	return (
		db
			.prepare(
				`SELECT m.id, m.user_id, u.name, m.body, m.created_at FROM messages m
				 JOIN users u ON u.id = m.user_id WHERE m.event_id = ? ORDER BY m.id DESC LIMIT ?`
			)
			.all(eventId, limit) as Message[]
	).reverse();
}

export function postMessage(eventId: number, userId: number, body: string) {
	requireMember(eventId, userId);
	body = body.trim();
	if (!body) throw new EventError('Write a message first.');
	if (body.length > 1000) throw new EventError('Keep messages under 1000 characters.');
	db.prepare('INSERT INTO messages (event_id, user_id, body) VALUES (?, ?, ?)').run(eventId, userId, body);
	publish(eventId);
}

// ---- Invites ----

/** What someone who isn't logged in sees when they open an invite link. */
export function getInvitePreview(token: string) {
	return db
		.prepare(
			`SELECT e.title, e.starts_at, u.name AS host_name FROM events e
			 JOIN users u ON u.id = e.host_id WHERE e.invite_token = ?`
		)
		.get(token) as { title: string; starts_at: string | null; host_name: string } | undefined;
}

export function joinByToken(token: string, userId: number) {
	const event = db.prepare('SELECT id FROM events WHERE invite_token = ?').get(token) as
		| { id: number }
		| undefined;
	if (!event) return null;
	const { changes } = db
		.prepare('INSERT OR IGNORE INTO event_members (event_id, user_id) VALUES (?, ?)')
		.run(event.id, userId);
	if (changes) publish(event.id);
	return event.id;
}

/** Adds the user to every event their email was invited to. */
export function claimEmailInvites(userId: number, email: string) {
	db.prepare(
		`INSERT OR IGNORE INTO event_members (event_id, user_id)
		 SELECT event_id, ? FROM email_invites WHERE email = ?`
	).run(userId, email);
}

export async function inviteByEmail(eventId: number, hostId: number, rawEmails: string, origin: string) {
	const event = requireHost(eventId, hostId);
	const emails = [...new Set(rawEmails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
	if (!emails.length) throw new EventError('Enter at least one email address.');
	const invalid = emails.filter((e) => !EMAIL.test(e));
	if (invalid.length) throw new EventError(`These don't look like email addresses: ${invalid.join(', ')}`);

	const host = db.prepare('SELECT name FROM users WHERE id = ?').get(hostId) as { name: string };
	const link = `${origin}/invite/${event.invite_token}`;
	tx(() => {
		for (const email of emails) {
			db.prepare('INSERT OR IGNORE INTO email_invites (event_id, email) VALUES (?, ?)').run(eventId, email);
			const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
			if (user) {
				const { changes } = db
					.prepare('INSERT OR IGNORE INTO event_members (event_id, user_id) VALUES (?, ?)')
					.run(eventId, user.id);
				if (changes) notify(user.id, eventId, `${host.name} invited you to ${event.title}.`);
			}
		}
	});
	publish(eventId);
	await Promise.all(
		emails.map((email) =>
			sendMail(
				email,
				`${host.name} invited you to ${event.title}`,
				`${host.name} invited you to ${event.title} on Who's Gaff.\n\nOpen the invite: ${link}`
			)
		)
	);
	return emails.length;
}
