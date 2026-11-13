// Tickets and entry: the host adds where to buy tickets and the price, people going mark when they've
// got theirs, and everyone can see who still needs one.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireHost, requireMember } from './events.ts';
import { formatPounds, goingPeople, parsePounds } from './money.ts';

/** How long the host waits between nudges, so people aren't pestered. */
export const NUDGE_GAP_MS = 60 * 60 * 1000;

type TicketRow = { url: string; price_pence: number | null; note: string; nudged_at: number | null };

const ticketRow = (eventId: number) =>
	db.prepare('SELECT url, price_pence, note, nudged_at FROM tickets WHERE event_id = ?').get(eventId) as TicketRow | undefined;

/**
 * Sets the ticket link, price and a note (such as "last entry 11:30"). Saving with everything empty takes
 * the tickets off the event. People going hear about it the first time tickets are added.
 */
export function setTickets(eventId: number, hostId: number, input: { url: string; price: string; note: string }) {
	const event = requireHost(eventId, hostId);
	const url = input.url.trim();
	const price = input.price.trim();
	const note = input.note.trim().slice(0, 200);
	if (!url && !price && !note) {
		db.prepare('DELETE FROM tickets WHERE event_id = ?').run(eventId);
		publish(eventId);
		return;
	}
	if (url) {
		let parsed: URL | null = null;
		try {
			parsed = new URL(url);
		} catch {
			/* checked below */
		}
		if (parsed?.protocol !== 'https:') throw new EventError('Paste the ticket link, starting https://');
	}
	const pence = price ? parsePounds(price) : null;
	if (price && !pence) throw new EventError('Enter a price like 12.50, or leave it blank.');
	const isNew = !ticketRow(eventId);
	db.prepare(
		`INSERT INTO tickets (event_id, url, price_pence, note) VALUES (?, ?, ?, ?)
		 ON CONFLICT (event_id) DO UPDATE SET url = excluded.url, price_pence = excluded.price_pence, note = excluded.note`
	).run(eventId, url.slice(0, 500), pence, note);
	if (isNew) {
		const cost = pence ? ` (${formatPounds(pence)})` : '';
		for (const p of goingPeople(eventId)) {
			if (p.id !== hostId) notify(p.id, eventId, `Tickets for ${event.title} are up${cost}. Grab yours.`);
		}
	}
	publish(eventId);
}

/** Marks whether you've got your ticket. Only people going (and the host) need one. */
export function setHaveTicket(eventId: number, userId: number, have: boolean) {
	requireMember(eventId, userId);
	if (!ticketRow(eventId)) throw new EventError('The host hasn’t added tickets yet.');
	if (have) {
		if (!goingPeople(eventId).some((p) => p.id === userId)) throw new EventError('RSVP “going” first.');
		db.prepare('INSERT OR IGNORE INTO ticket_holders (event_id, user_id) VALUES (?, ?)').run(eventId, userId);
	} else {
		db.prepare('DELETE FROM ticket_holders WHERE event_id = ? AND user_id = ?').run(eventId, userId);
	}
	publish(eventId);
}

/** The event's tickets, or null when there aren't any. Only people going are listed. */
export function getTickets(eventId: number, userId: number, now = Date.now()) {
	requireMember(eventId, userId);
	const row = ticketRow(eventId);
	if (!row) return null;
	const holders = new Set(
		(db.prepare('SELECT user_id FROM ticket_holders WHERE event_id = ?').all(eventId) as { user_id: number }[]).map((r) => r.user_id)
	);
	const going = goingPeople(eventId);
	return {
		url: row.url,
		price_pence: row.price_pence,
		note: row.note,
		have: going.filter((p) => holders.has(p.id)),
		need: going.filter((p) => !holders.has(p.id)),
		mine: holders.has(userId),
		going: going.some((p) => p.id === userId),
		canNudge: row.nudged_at === null || now - row.nudged_at >= NUDGE_GAP_MS
	};
}

/** The host reminds everyone going who hasn't got a ticket. At most once an hour. Returns how many were nudged. */
export function nudgeTickets(eventId: number, hostId: number, now = Date.now()) {
	const event = requireHost(eventId, hostId);
	const tickets = getTickets(eventId, hostId, now);
	if (!tickets) throw new EventError('Add the tickets first.');
	if (!tickets.canNudge) throw new EventError('You’ve nudged them in the last hour. Give them a minute.');
	const need = tickets.need.filter((p) => p.id !== hostId);
	if (!need.length) throw new EventError('Everyone going has a ticket.');
	db.prepare('UPDATE tickets SET nudged_at = ? WHERE event_id = ?').run(now, eventId);
	for (const p of need) notify(p.id, eventId, `You still need a ticket for ${event.title}.`);
	publish(eventId);
	return need.length;
}
