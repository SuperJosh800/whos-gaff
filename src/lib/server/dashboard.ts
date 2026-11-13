import { db } from './db.ts';
import { votingOpen, type Event, type Rsvp } from './events.ts';
import { nowLocal } from '../time.ts';

type Row = Event & {
	is_host: number;
	host_name: string;
	invited: number;
	going: number;
	maybe: number;
	not_going: number;
	waiting: number;
	my_rsvp: Rsvp | null;
	waitlisted: number;
	voters: number;
	i_voted: number;
};

// The address and invite link stay on the server: the dashboard goes to everyone invited, going or not.
export type DashboardEvent = Omit<Row, 'location' | 'invite_token' | 'theme_told' | 'venue_told'> & {
	status: 'voting' | 'voting-closed' | 'locked' | 'past';
	/** What the user needs to do, if anything. */
	todo: 'vote' | 'rsvp' | 'pick' | null;
};

export function listDashboardEvents(userId: number, now = nowLocal()) {
	const rows = db
		.prepare(
			`SELECT e.*, (e.host_id = $u) AS is_host, h.name AS host_name,
				(SELECT COUNT(*) FROM event_members m2 WHERE m2.event_id = e.id) AS invited,
				(SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.response = 'yes') AS going,
				(SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.response = 'maybe'
					AND NOT EXISTS (SELECT 1 FROM waitlist w WHERE w.event_id = e.id AND w.user_id = r.user_id)) AS maybe,
				(SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.response = 'no'
					AND NOT EXISTS (SELECT 1 FROM waitlist w WHERE w.event_id = e.id AND w.user_id = r.user_id)) AS not_going,
				(SELECT COUNT(*) FROM waitlist w WHERE w.event_id = e.id) AS waiting,
				EXISTS (SELECT 1 FROM waitlist w WHERE w.event_id = e.id AND w.user_id = $u) AS waitlisted,
				(SELECT response FROM rsvps r WHERE r.event_id = e.id AND r.user_id = $u) AS my_rsvp,
				(SELECT COUNT(DISTINCT v.user_id) FROM votes v JOIN date_options o ON o.id = v.option_id
					WHERE o.event_id = e.id) AS voters,
				EXISTS (SELECT 1 FROM votes v JOIN date_options o ON o.id = v.option_id
					WHERE o.event_id = e.id AND v.user_id = $u) AS i_voted
			 FROM event_members m
			 JOIN events e ON e.id = m.event_id
			 JOIN users h ON h.id = e.host_id
			 WHERE m.user_id = $u`
		)
		.all({ u: userId }) as Row[];

	const events: DashboardEvent[] = rows.map((e) => {
		const open = votingOpen(e, now);
		const status = e.starts_at
			? e.starts_at < now
				? 'past'
				: 'locked'
			: open
				? 'voting'
				: 'voting-closed';
		const todo =
			status === 'voting' && !e.i_voted
				? 'vote'
				: status === 'locked' && !e.my_rsvp && !e.waitlisted
					? 'rsvp'
					: status === 'voting-closed' && e.is_host
						? 'pick'
						: null;
		const { location: _, invite_token: __, theme_told: ___, venue_told: ____, ...shown } = e;
		return { ...shown, status, todo };
	});

	// Undecided polls first (newest first), then dated events soonest first.
	const upcoming = events
		.filter((e) => e.status !== 'past')
		.sort((a, b) =>
			a.starts_at && b.starts_at
				? a.starts_at.localeCompare(b.starts_at)
				: a.starts_at
					? 1
					: b.starts_at
						? -1
						: b.id - a.id
		);
	const past = events
		.filter((e) => e.status === 'past')
		.sort((a, b) => b.starts_at!.localeCompare(a.starts_at!));
	return { upcoming, past };
}
