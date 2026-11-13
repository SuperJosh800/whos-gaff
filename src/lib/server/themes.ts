// Dress code or theme poll: anyone invited suggests a theme and votes for one, and the host locks one in.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireHost, requireMember, type Event } from './events.ts';

export const MAX_THEMES = 12;
const MAX_LABEL = 60;

/** Tidies a label: drops invisible characters, squashes spaces, and needs at least one letter or digit. */
export function cleanLabel(label: string, empty: string) {
	label = label.replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();
	if (!/[\p{L}\p{N}]/u.test(label)) throw new EventError(empty);
	if (label.length > MAX_LABEL) throw new EventError(`Keep it to ${MAX_LABEL} characters.`);
	return label;
}

/** Everyone invited who might come: all but `exceptId` and anyone who said they can't. */
export function peopleNotOut(eventId: number, exceptId: number) {
	return (
		db
			.prepare(
				`SELECT m.user_id FROM event_members m
				 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
				 WHERE m.event_id = ? AND m.user_id != ? AND (r.response IS NULL OR r.response != 'no')`
			)
			.all(eventId, exceptId) as { user_id: number }[]
	).map((r) => r.user_id);
}

function requireOpen(event: Event) {
	if (event.theme) throw new EventError('The host has locked in the dress code.');
	return event;
}

function requireOption(eventId: number, optionId: number) {
	const option = db.prepare('SELECT id, label, suggested_by FROM theme_options WHERE id = ? AND event_id = ?').get(optionId, eventId) as
		| { id: number; label: string; suggested_by: number }
		| undefined;
	if (!option) throw new EventError('That theme isn’t on the list any more.');
	return option;
}

/** The suggestions with their votes, most votes first. */
export function listThemes(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	const options = db
		.prepare(
			`SELECT o.id, o.label, o.suggested_by, COUNT(v.user_id) AS votes,
				group_concat(u.name, ', ') AS voters, MAX(v.user_id = ?) AS mine
			 FROM theme_options o
			 LEFT JOIN theme_votes v ON v.option_id = o.id
			 LEFT JOIN users u ON u.id = v.user_id
			 WHERE o.event_id = ? GROUP BY o.id ORDER BY votes DESC, o.id`
		)
		.all(userId, eventId) as { id: number; label: string; suggested_by: number; votes: number; voters: string | null; mine: number | null }[];
	return {
		theme: event.theme,
		options: options.map((o) => ({
			id: o.id,
			label: o.label,
			votes: o.votes,
			voters: o.voters ?? '',
			mine: !!o.mine,
			canRemove: !event.theme && (o.suggested_by === userId || event.host_id === userId)
		}))
	};
}

export function suggestTheme(eventId: number, userId: number, label: string) {
	requireOpen(requireMember(eventId, userId));
	label = cleanLabel(label, 'Type a dress code or theme.');
	const { n } = db.prepare('SELECT COUNT(*) AS n FROM theme_options WHERE event_id = ?').get(eventId) as { n: number };
	if (n >= MAX_THEMES) throw new EventError('That’s plenty of ideas. Vote for one.');
	const taken = db.prepare('SELECT 1 FROM theme_options WHERE event_id = ? AND label = ? COLLATE NOCASE').get(eventId, label);
	if (taken) throw new EventError('That one’s already on the list.');
	db.prepare('INSERT INTO theme_options (event_id, label, suggested_by) VALUES (?, ?, ?)').run(eventId, label, userId);
	publish(eventId);
}

/** Votes for a theme, or takes your vote back (`optionId` null). One vote each. */
export function voteTheme(eventId: number, userId: number, optionId: number | null) {
	requireOpen(requireMember(eventId, userId));
	if (optionId === null) {
		db.prepare('DELETE FROM theme_votes WHERE event_id = ? AND user_id = ?').run(eventId, userId);
	} else {
		requireOption(eventId, optionId);
		db.prepare(
			`INSERT INTO theme_votes (event_id, user_id, option_id) VALUES (?, ?, ?)
			 ON CONFLICT (event_id, user_id) DO UPDATE SET option_id = excluded.option_id`
		).run(eventId, userId, optionId);
	}
	publish(eventId);
}

/** Whoever suggested a theme, or the host, can take it off the list. Its votes go with it. */
export function removeTheme(eventId: number, userId: number, optionId: number) {
	const event = requireOpen(requireMember(eventId, userId));
	const option = requireOption(eventId, optionId);
	if (option.suggested_by !== userId && event.host_id !== userId) throw new EventError('Only whoever suggested it, or the host, can remove it.');
	db.prepare('DELETE FROM theme_options WHERE id = ?').run(optionId);
	publish(eventId);
}

/** The host reopens the vote after locking one in. Votes and suggestions are as they were. */
export function reopenTheme(eventId: number, hostId: number) {
	requireHost(eventId, hostId);
	db.prepare(`UPDATE events SET theme = '' WHERE id = ?`).run(eventId);
	publish(eventId);
}

/**
 * The host locks in one of the suggestions. Everyone who might come hears about it, but only when it's
 * different from the last one they were told, so reopening and locking the same one again stays quiet.
 */
export function lockTheme(eventId: number, hostId: number, optionId: number) {
	const event = requireOpen(requireHost(eventId, hostId));
	const { label } = requireOption(eventId, optionId);
	db.prepare('UPDATE events SET theme = ? WHERE id = ?').run(label, eventId);
	if (label.toLowerCase() !== event.theme_told.toLowerCase()) {
		db.prepare('UPDATE events SET theme_told = ? WHERE id = ?').run(label, eventId);
		for (const id of peopleNotOut(eventId, hostId)) notify(id, eventId, `Dress code for ${event.title}: ${label}`);
	}
	publish(eventId);
}
