// "Stay or move on?": anyone going asks the group, everyone going has 60 seconds to vote, and the
// result goes to everyone when the time's up.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { attempt } from './ratelimit.ts';
import { EventError, requireMember } from './events.ts';
import { canSeeAddress } from './gaff.ts';
import { goingPeople } from './money.ts';
import { localToMs } from '../time.ts';

export const VOTE_MS = 60_000;
/** Votes work from the start of the night until this long after. */
const NIGHT_MS = 12 * 60 * 60_000;
/** The last result stays up this long, unless someone asks again. */
const RESULT_MS = 60 * 60_000;

type VoteRow = { id: number; started_by: number; place: string; started_at: number; name: string };
export type Outcome = 'stay' | 'move' | 'tie';

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('RSVP “going” to vote.');
	return event;
}

function tally(voteId: number) {
	return db.prepare(`SELECT COALESCE(SUM(choice = 'stay'), 0) AS stay, COALESCE(SUM(choice = 'move'), 0) AS move FROM move_ballots WHERE vote_id = ?`).get(voteId) as {
		stay: number;
		move: number;
	};
}

const outcomeOf = ({ stay, move }: { stay: number; move: number }): Outcome => (move > stay ? 'move' : stay > move ? 'stay' : 'tie');

/** Starts a vote, telling everyone else going. One at a time, and each person can start 3 an hour. */
export function startVote(eventId: number, userId: number, place: string, nowMs = Date.now()) {
	const event = requireGoing(eventId, userId);
	if (!event.starts_at || nowMs < localToMs(event.starts_at)) throw new EventError('You can ask once the night has started.');
	if (nowMs >= localToMs(event.starts_at) + NIGHT_MS) throw new EventError('The night’s over.');
	if (db.prepare('SELECT 1 FROM move_votes WHERE event_id = ? AND started_at + ? > ?').get(eventId, VOTE_MS, nowMs)) {
		throw new EventError('There’s already a vote on. Have your say on that one.');
	}
	if (!attempt(`move-vote:${eventId}:${userId}`, 3, 60 * 60_000, nowMs).ok) throw new EventError('You’ve asked 3 times this hour. Give it a rest.');
	place = place.replace(/\s+/g, ' ').trim().slice(0, 60);
	db.prepare('INSERT INTO move_votes (event_id, started_by, place, started_at) VALUES (?, ?, ?, ?)').run(eventId, userId, place, nowMs);
	const name = (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;
	for (const p of goingPeople(eventId)) {
		if (p.id !== userId) notify(p.id, eventId, `${name} asks: stay or move on${place ? ` to ${place}` : ''}? Vote in the next 60 seconds. (${event.title})`, '/night#move');
	}
	publish(eventId);
}

/** Votes stay or move on, or changes your vote, while the 60 seconds last. */
export function castVote(eventId: number, userId: number, voteId: number, choice: string, nowMs = Date.now()) {
	requireGoing(eventId, userId);
	if (choice !== 'stay' && choice !== 'move') throw new EventError('Choose stay or move on.');
	const vote = db.prepare('SELECT started_at FROM move_votes WHERE id = ? AND event_id = ?').get(voteId, eventId) as { started_at: number } | undefined;
	if (!vote) throw new EventError('That vote isn’t on any more.');
	if (nowMs >= vote.started_at + VOTE_MS) throw new EventError('Too late, the vote’s closed.');
	db.prepare(
		'INSERT INTO move_ballots (vote_id, user_id, choice) VALUES (?, ?, ?) ON CONFLICT (vote_id, user_id) DO UPDATE SET choice = excluded.choice'
	).run(voteId, userId, choice);
	publish(eventId);
}

/**
 * Tells everyone going the result of votes that have just closed, once. Checked every 5 seconds; a vote
 * nobody voted in closes quietly.
 */
export function closeDueVotes(nowMs = Date.now()) {
	const due = db
		.prepare('SELECT v.id, v.event_id, v.place, e.title FROM move_votes v JOIN events e ON e.id = v.event_id WHERE v.closed = 0 AND v.started_at + ? <= ?')
		.all(VOTE_MS, nowMs) as { id: number; event_id: number; place: string; title: string }[];
	for (const v of due) {
		db.prepare('UPDATE move_votes SET closed = 1 WHERE id = ?').run(v.id);
		const t = tally(v.id);
		if (t.stay + t.move) {
			const outcome = outcomeOf(t);
			const result =
				outcome === 'move' ? `move on${v.place ? ` to ${v.place}` : ''}` : outcome === 'stay' ? 'stay put' : 'it’s a tie';
			for (const p of goingPeople(v.event_id))
				notify(p.id, v.event_id, `Stay or move on: ${result} (${t.move} move, ${t.stay} stay). (${v.title})`, '/night#move');
		}
		publish(v.event_id);
	}
}

/** The vote that's on (with the tally so far), the last result from the past hour, and whether you can ask. */
export function getMoveVote(eventId: number, viewerId: number, nowMs = Date.now()) {
	const event = requireMember(eventId, viewerId);
	const latest = db
		.prepare('SELECT v.id, v.started_by, v.place, v.started_at, u.name FROM move_votes v JOIN users u ON u.id = v.started_by WHERE v.event_id = ? ORDER BY v.started_at DESC LIMIT 1')
		.get(eventId) as VoteRow | undefined;
	const on = !!latest && nowMs < latest.started_at + VOTE_MS;
	const recent = !!latest && !on && nowMs < latest.started_at + VOTE_MS + RESULT_MS;
	const counts = latest && (on || recent) ? tally(latest.id) : null;
	const mine = latest
		? ((db.prepare('SELECT choice FROM move_ballots WHERE vote_id = ? AND user_id = ?').get(latest.id, viewerId) as { choice: Outcome } | undefined)?.choice ?? null)
		: null;
	const nightOn = !!event.starts_at && nowMs >= localToMs(event.starts_at) && nowMs < localToMs(event.starts_at) + NIGHT_MS;
	return {
		live: on && counts ? { id: latest.id, by: latest.name, place: latest.place, endsAt: latest.started_at + VOTE_MS, ...counts, mine } : null,
		last: recent && counts ? { by: latest.name, place: latest.place, ...counts, outcome: outcomeOf(counts), mine } : null,
		canStart: nightOn && !on
	};
}
