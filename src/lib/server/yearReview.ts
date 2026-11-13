// Year in review for a group: the nights out the group had in a year (events made for the group that
// have happened), with totals and who topped each thing. Only counts what's already recorded.
import { db } from './db.ts';
import { AWARDS, WINNERS, type Award } from './after.ts';
import { bestRated } from './ratings.ts';
import { nowLocal } from '../time.ts';

type Ranked = { id: number; name: string; count: number };

/** Everyone tied for the most, as long as it's at least one. */
function top(rows: Ranked[]) {
	const best = Math.max(0, ...rows.map((r) => r.count));
	return best ? { names: rows.filter((r) => r.count === best).map((r) => r.name), count: best } : null;
}

/** The years with at least one night out for the group, newest first. */
export function reviewYears(groupId: number, now = nowLocal()) {
	return (
		db
			.prepare(
				`SELECT DISTINCT substr(starts_at, 1, 4) AS year FROM events
				 WHERE group_id = ? AND starts_at IS NOT NULL AND starts_at <= ? ORDER BY year DESC`
			)
			.all(groupId, now) as { year: string }[]
	).map((r) => Number(r.year));
}

/** The group's year as `viewerId` sees it: nights they weren't invited to (they joined the group later) stay untitled. */
export function yearReview(groupId: number, viewerId: number, year: number, now = nowLocal()) {
	const from = `${year}-01-01T00:00`;
	const to = `${year + 1}-01-01T00:00`;
	// Nights in the year that have started, and the people at each (the host and everyone going).
	const nights = db
		.prepare(
			`SELECT e.id, e.title, e.starts_at,
				(SELECT COUNT(*) FROM event_photos p WHERE p.event_id = e.id) AS photos,
				EXISTS (SELECT 1 FROM event_members m WHERE m.event_id = e.id AND m.user_id = ?) AS invited
			 FROM events e WHERE e.group_id = ? AND e.starts_at >= ? AND e.starts_at < ? AND e.starts_at <= ?
			 ORDER BY e.starts_at`
		)
		.all(viewerId, groupId, from, to, now) as { id: number; title: string; starts_at: string; photos: number; invited: number }[];
	const ids = JSON.stringify(nights.map((n) => n.id));
	const inYear = `SELECT value FROM json_each(?)`;

	// Only people still in the group are ranked, so leavers and deleted accounts drop out.
	const members = `SELECT user_id FROM group_members WHERE group_id = ?`;
	const rank = (sql: string, ...params: string[]) =>
		db
			.prepare(`SELECT u.id, u.name, x.count FROM (${sql}) x JOIN users u ON u.id = x.user_id WHERE x.user_id IN (${members}) ORDER BY u.name`)
			.all(ids, ...params, groupId) as Ranked[];

	const attendance = rank(
		`SELECT m.user_id, COUNT(*) AS count FROM event_members m JOIN events e ON e.id = m.event_id
		 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
		 WHERE m.event_id IN (${inYear}) AND (r.response = 'yes' OR m.user_id = e.host_id) GROUP BY m.user_id`
	);
	const hosted = rank(`SELECT host_id AS user_id, COUNT(*) AS count FROM events WHERE id IN (${inYear}) GROUP BY host_id`);
	const rounds = rank(`SELECT user_id, COUNT(*) AS count FROM rounds WHERE event_id IN (${inYear}) AND skipped = 0 GROUP BY user_id`);
	const homeFirst = rank(
		`SELECT user_id, COUNT(*) AS count FROM home_safe h
		 WHERE event_id IN (${inYear}) AND at = (SELECT MIN(at) FROM home_safe WHERE event_id = h.event_id) GROUP BY user_id`
	);
	const moves = rank(`SELECT user_id, COUNT(*) AS count FROM moves WHERE event_id IN (${inYear}) GROUP BY user_id`);
	// Awards won at each night (ties share it, as on the After tab), counted across the year.
	const awards = Object.entries(AWARDS).map(([key, label]) => ({
		key: key as Award,
		label,
		top: top(
			rank(`SELECT nominee_id AS user_id, COUNT(*) AS count FROM (${WINNERS}) WHERE event_id IN (${inYear}) AND award = ? GROUP BY nominee_id`, key)
		)
	}));
	const spent = db
		.prepare(`SELECT COALESCE(SUM(amount_pence), 0) AS pence FROM expenses WHERE event_id IN (${inYear})`)
		.get(ids) as { pence: number };
	const photos = nights.reduce((sum, n) => sum + n.photos, 0);
	// The night the most people went to (host plus going), only worth naming when there's a choice.
	const headcount = db.prepare(
		`SELECT COUNT(*) AS c FROM event_members m JOIN events e ON e.id = m.event_id
		 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
		 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id)`
	);
	const shown = nights.map((n) => ({
		id: n.id,
		title: n.invited ? n.title : null,
		starts_at: n.starts_at,
		people: (headcount.get(n.id) as { c: number }).c
	}));
	// The best-rated night, named only for people who were invited, like the list.
	const best = bestRated(nights.map((n) => n.id));
	const bestNight = best && shown.find((n) => n.id === best.event_id);
	const biggest = nights.length > 1 ? [...shown].sort((a, b) => b.people - a.people || a.starts_at.localeCompare(b.starts_at))[0] : null;

	return {
		year,
		nights: shown.map(({ id, title, starts_at }) => ({ id, title, starts_at })),
		totals: { nights: nights.length, photos, spentPence: spent.pence },
		biggest: biggest && biggest.people > 1 ? biggest : null,
		best: best && bestNight ? { id: best.event_id, title: bestNight.title, starts_at: bestNight.starts_at, average: Math.round(best.average * 10) / 10, count: best.count } : null,
		mostOut: top(attendance),
		attendance: [...attendance].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
		topHost: top(hosted),
		topRounds: top(rounds),
		firstHome: top(homeFirst),
		mostMoves: top(moves),
		awards
	};
}
