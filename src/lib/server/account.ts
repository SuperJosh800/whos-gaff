// Your data: download everything held about you, or delete your account (UK GDPR rights).
import { db, tx } from './db.ts';
import { nowLocal } from '../time.ts';
import { removePhotoFiles } from './after.ts';
import { fillSpots } from './events.ts';

/** Every table that holds rows about a person, and the column that names them. */
const PERSONAL: [table: string, column: string][] = [
	['gaffs', 'owner_id'],
	['event_members', 'user_id'],
	['rsvps', 'user_id'],
	['votes', 'user_id'],
	['date_options', 'suggested_by'],
	['messages', 'user_id'],
	['notifications', 'user_id'],
	['bring_items', 'added_by'],
	['damage_log', 'reported_by'],
	['moves', 'user_id'],
	['home_plans', 'user_id'],
	['home_safe', 'user_id'],
	['rounds', 'user_id'],
	['expenses', 'paid_by'],
	['expense_shares', 'user_id'],
	['settlements', 'from_user'],
	['settlements', 'to_user'],
	['group_members', 'user_id'],
	['free_gaffs', 'user_id'],
	['pings', 'user_id'],
	['ping_answers', 'user_id'],
	['award_votes', 'voter_id'],
	['award_votes', 'nominee_id'],
	['event_photos', 'user_id'],
	['challenge_results', 'user_id'],
	['game_players', 'user_id'],
	['round_group_members', 'user_id'],
	['missions', 'user_id'],
	['mission_guesses', 'user_id'],
	['custom_games', 'owner_id'],
	['push_subscriptions', 'user_id'],
	['predictions', 'user_id'],
	['predictions', 'nominee_id'],
	['bingo_cards', 'user_id'],
	['bingo_marks', 'marked_by'],
	['buddies', 'user_id'],
	['ticket_holders', 'user_id'],
	['theme_options', 'suggested_by'],
	['theme_votes', 'user_id'],
	['venue_options', 'suggested_by'],
	['venue_votes', 'user_id'],
	['waitlist', 'user_id'],
	['drivers', 'user_id'],
	['taxi_told', 'user_id'],
	['taxi_told', 'about_id'],
	['drink_log', 'user_id'],
	['help_requests', 'user_id'],
	['help_responders', 'user_id'],
	['song_requests', 'suggested_by'],
	['song_votes', 'user_id'],
	['drop_photos', 'user_id'],
	['move_votes', 'started_by'],
	['move_ballots', 'user_id'],
	['takeaways', 'started_by'],
	['takeaways', 'orderer_id'],
	['takeaway_items', 'user_id'],
	['heading_off', 'user_id'],
	['quiz_questions', 'author_id'],
	['quiz_questions', 'about_id'],
	['quiz_answers', 'user_id'],
	['bets', 'proposer_id'],
	['bet_stakes', 'user_id']
];

/** Everything stored about a user, as plain data for a JSON download. Passwords and session tokens are left out. */
export function exportData(userId: number) {
	const profile = db
		.prepare('SELECT id, email, name, payment_link, payday, created_at, terms_accepted_at FROM users WHERE id = ?')
		.get(userId);
	const hosted = db.prepare('SELECT id, title, details, location, mode, starts_at, created_at FROM events WHERE host_id = ?').all(userId);
	const data: Record<string, unknown> = { exported_at: new Date().toISOString(), profile, events_hosted: hosted };
	for (const [table, column] of PERSONAL) {
		const key = column === 'user_id' || PERSONAL.filter(([t]) => t === table).length === 1 ? table : `${table} (${column})`;
		// Award votes and predictions about you leave out who made them.
		// Push devices leave out the session they belong to and their encryption keys.
		const columns =
			table === 'award_votes' && column === 'nominee_id'
				? 'event_id, award'
				: table === 'push_subscriptions'
					? 'endpoint, created_at'
					: // Drink taps leave out their ids, whose gaps would count other people's taps.
						table === 'drink_log'
						? 'event_id, kind, at'
						: '*';
		// Predictions about you are secret until the night starts, so only those from started nights.
		data[key] =
			table === 'predictions' && column === 'nominee_id'
				? db
						.prepare(
							`SELECT p.event_id, p.award FROM predictions p JOIN events e ON e.id = p.event_id
							 WHERE p.nominee_id = ? AND e.starts_at <= ?`
						)
						.all(userId, nowLocal())
				: db.prepare(`SELECT ${columns} FROM ${table} WHERE ${column} = ?`).all(userId);
	}
	return data;
}

/**
 * Deletes an account. Personal details, gaffs, messages, photos and plans are deleted.
 * Events you host pass to the longest-standing other member, or are deleted if nobody else is in them.
 * Shared records others rely on (kitty payments, bring list, rounds) are kept but shown as "Deleted user".
 */
export function deleteAccount(userId: number) {
	const photos: string[] = [];
	// Nights they were going to (or hosting) may have a spot to give to the waitlist afterwards.
	const spots = db
		.prepare(`SELECT event_id FROM rsvps WHERE user_id = ? AND response = 'yes' UNION SELECT id FROM events WHERE host_id = ?`)
		.all(userId, userId) as { event_id: number }[];
	tx(() => {
		const hosted = db.prepare('SELECT id FROM events WHERE host_id = ?').all(userId) as { id: number }[];
		for (const { id } of hosted) {
			const heir = db
				.prepare(
					`SELECT user_id FROM event_members WHERE event_id = ? AND user_id != ?
					 ORDER BY joined_at, user_id LIMIT 1`
				)
				.get(id, userId) as { user_id: number } | undefined;
			if (heir) {
				// The gaff profile belongs to the old host and is deleted with them, so detach it.
				// The repeat stops too: the new host didn't set it up, and may not be in the group it invites.
				db.prepare('UPDATE events SET host_id = ?, gaff_id = NULL, repeat_days = NULL WHERE id = ?').run(heir.user_id, id);
				// Hosts always count as going, so the new one can't also be queuing for a spot.
				db.prepare('DELETE FROM waitlist WHERE event_id = ? AND user_id = ?').run(id, heir.user_id);
			} else {
				photos.push(...(db.prepare('SELECT filename FROM event_photos WHERE event_id = ?').all(id) as { filename: string }[]).map((p) => p.filename));
				db.prepare('DELETE FROM events WHERE id = ?').run(id);
			}
		}
		photos.push(...(db.prepare('SELECT filename FROM event_photos WHERE user_id = ?').all(userId) as { filename: string }[]).map((p) => p.filename));

		for (const table of [
			'sessions', 'password_resets', 'push_subscriptions', 'event_members', 'rsvps', 'votes', 'messages', 'notifications',
			'moves', 'home_plans', 'home_safe', 'group_members', 'free_gaffs', 'pings', 'ping_answers',
			'event_photos', 'challenge_results', 'game_players', 'round_group_members',
			'missions', 'bingo_cards', 'buddies', 'ticket_holders', 'theme_votes', 'venue_votes', 'waitlist', 'drivers', 'drink_log', 'help_responders', 'help_requests', 'song_votes', 'drop_photos', 'move_ballots', 'heading_off', 'quiz_answers'
		]) {
			db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
		}
		db.prepare('DELETE FROM gaffs WHERE owner_id = ?').run(userId);
		db.prepare('DELETE FROM award_votes WHERE voter_id = ? OR nominee_id = ?').run(userId, userId);
		db.prepare('DELETE FROM predictions WHERE user_id = ? OR nominee_id = ?').run(userId, userId);
		db.prepare('DELETE FROM taxi_told WHERE user_id = ? OR about_id = ?').run(userId, userId);
		db.prepare('DELETE FROM move_votes WHERE started_by = ?').run(userId);
		// Open bets they made go, giving everyone's coins back; settled ones stay, as "Deleted user",
		// so everyone else's coins still add up. Their stakes on open bets go too.
		db.prepare('DELETE FROM bets WHERE proposer_id = ? AND outcome IS NULL').run(userId);
		db.prepare('DELETE FROM bet_stakes WHERE user_id = ? AND bet_id IN (SELECT id FROM bets WHERE outcome IS NULL)').run(userId);
		// Quiz questions they wrote, and ones about them, are about a person, so they go too.
		db.prepare('DELETE FROM quiz_questions WHERE author_id = ? OR about_id = ?').run(userId, userId);
		// Orders not yet placed go; placed ones stay, like the kitty costs they made, as "Deleted user",
		// so everyone else's share of them still adds up.
		db.prepare('DELETE FROM takeaway_items WHERE user_id = ? AND takeaway_id IN (SELECT id FROM takeaways WHERE ordered_at IS NULL)').run(userId);
		db.prepare('DELETE FROM takeaways WHERE started_by = ? AND ordered_at IS NULL').run(userId);
		db.prepare('UPDATE takeaways SET orderer_id = NULL WHERE orderer_id = ? AND ordered_at IS NULL').run(userId);
		// Squares that happened stay marked for everyone else, without the name.
		db.prepare('UPDATE bingo_marks SET marked_by = NULL WHERE marked_by = ?').run(userId);
		db.prepare('DELETE FROM mission_guesses WHERE user_id = ? OR suspect_id = ?').run(userId, userId);
		db.prepare('UPDATE bring_items SET claimed_by = NULL WHERE claimed_by = ?').run(userId);
		db.prepare('DELETE FROM custom_games WHERE owner_id = ?').run(userId);
		// Otherwise the old address would show up again as a pending email invite.
		db.prepare('DELETE FROM email_invites WHERE email = (SELECT email FROM users WHERE id = ?)').run(userId);

		// The row stays so shared money and bring-list records still add up, but nothing identifies the person.
		db.prepare(
			`UPDATE users SET email = ?, name = 'Deleted user', password_hash = '!', payment_link = '', payday = NULL,
			 terms_accepted_at = NULL WHERE id = ?`
		).run(`deleted-${userId}@deleted.invalid`, userId);
	});
	removePhotoFiles(photos);
	for (const { event_id } of spots) fillSpots(event_id);
}
