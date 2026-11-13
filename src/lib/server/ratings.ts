// Rate the night: everyone who went gives it 1 to 5 stars, from the start until a week later. The
// average shows on the recap, and the group's year in review names its best-rated night.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireMember } from './events.ts';
import { attendees, isOver } from './after.ts';
import { nowLocal, shiftLocal } from '../time.ts';

/** Ratings can be given or changed for this long after the start. */
const OPEN_MINUTES = 7 * 24 * 60;
/** A night needs this many ratings to be the year's best, so one person's 5 stars doesn't decide it. */
export const BEST_MIN_RATINGS = 2;

const closed = (startsAt: string, now: string) => now >= shiftLocal(startsAt, OPEN_MINUTES);

export function rateNight(eventId: number, userId: number, stars: number, now = nowLocal()) {
	const event = requireMember(eventId, userId);
	if (!isOver(event, now)) throw new EventError('Rate the night once it’s started.');
	if (closed(event.starts_at!, now)) throw new EventError('Rating closed a week after the night.');
	if (!attendees(eventId).some((p) => p.id === userId)) throw new EventError('Only people who went can rate it.');
	if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new EventError('Pick 1 to 5 stars.');
	db.prepare(
		`INSERT INTO night_ratings (event_id, user_id, stars) VALUES (?, ?, ?)
		 ON CONFLICT (event_id, user_id) DO UPDATE SET stars = excluded.stars`
	).run(eventId, userId, stars);
	publish(eventId);
}

/** Average stars (one decimal place) from people who went, how many rated, and your own. */
export function getRating(eventId: number, userId: number, startsAt: string | null, now = nowLocal()) {
	const going = attendees(eventId);
	const ids = new Set(going.map((p) => p.id));
	const rows = (db.prepare('SELECT user_id, stars FROM night_ratings WHERE event_id = ?').all(eventId) as { user_id: number; stars: number }[]).filter((r) =>
		ids.has(r.user_id)
	);
	return {
		count: rows.length,
		average: rows.length ? Math.round((rows.reduce((sum, r) => sum + r.stars, 0) / rows.length) * 10) / 10 : null,
		mine: rows.find((r) => r.user_id === userId)?.stars ?? null,
		canRate: ids.has(userId) && !!startsAt && !closed(startsAt, now),
		closed: !!startsAt && closed(startsAt, now)
	};
}

/**
 * The best-rated of some nights: highest average from people who went, with at least 2 ratings; ties
 * go to the one more people rated, then the earlier night.
 */
export function bestRated(eventIds: number[]) {
	if (!eventIds.length) return null;
	return (
		(db
			.prepare(
				`SELECT r.event_id, AVG(r.stars) AS average, COUNT(*) AS count FROM night_ratings r JOIN events e ON e.id = r.event_id
				 JOIN event_members m ON m.event_id = r.event_id AND m.user_id = r.user_id
				 LEFT JOIN rsvps v ON v.event_id = r.event_id AND v.user_id = r.user_id
				 WHERE r.event_id IN (SELECT value FROM json_each(?)) AND (v.response = 'yes' OR r.user_id = e.host_id)
				 GROUP BY r.event_id HAVING COUNT(*) >= ? ORDER BY average DESC, count DESC, e.starts_at LIMIT 1`
			)
			.get(JSON.stringify(eventIds), BEST_MIN_RATINGS) as { event_id: number; average: number; count: number } | undefined) ?? null
	);
}
