// Takeaway order: someone going starts an order, everyone going adds what they want, one person orders
// it, and when they put in what they paid each person's share goes in the kitty.
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireMember } from './events.ts';
import { formatPounds, goingPeople, parsePounds } from './money.ts';

type Row = { id: number; place: string; started_by: number; by: string; orderer_id: number | null; orderer: string | null; total_pence: number | null; ordered_at: number | null };
type Item = { user_id: number; name: string; item: string; price_pence: number | null };

function requireGoing(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	if (!goingPeople(eventId).some((p) => p.id === userId)) throw new EventError('RSVP “going” to join the takeaway.');
	return event;
}

function getOrder(eventId: number, id: number) {
	const t = db.prepare('SELECT id, place, started_by, orderer_id, ordered_at FROM takeaways WHERE id = ? AND event_id = ? AND cancelled = 0').get(id, eventId) as
		| Pick<Row, 'id' | 'place' | 'started_by' | 'orderer_id' | 'ordered_at'>
		| undefined;
	if (!t) throw new EventError('That takeaway’s been called off.');
	return t;
}

function requireOpen(eventId: number, id: number) {
	const t = getOrder(eventId, id);
	if (t.ordered_at) throw new EventError('It’s already been ordered.');
	return t;
}

const items = (id: number) =>
	db
		.prepare('SELECT i.user_id, u.name, i.item, i.price_pence FROM takeaway_items i JOIN users u ON u.id = i.user_id WHERE i.takeaway_id = ? ORDER BY i.rowid')
		.all(id) as Item[];

/** Starts an order, telling everyone else going. One open at a time, and each person can start 3 an hour, called off or not. */
export function startTakeaway(eventId: number, userId: number, place: string, nowMs = Date.now()) {
	const event = requireGoing(eventId, userId);
	place = place.replace(/\s+/g, ' ').trim().slice(0, 60);
	if (!place) throw new EventError('Where from?');
	if (db.prepare('SELECT 1 FROM takeaways WHERE event_id = ? AND ordered_at IS NULL AND cancelled = 0').get(eventId)) {
		throw new EventError('There’s already a takeaway going. Add yours to that one.');
	}
	const started = db.prepare('SELECT COUNT(*) AS n FROM takeaways WHERE event_id = ? AND started_by = ? AND started_at > ?').get(eventId, userId, nowMs - 60 * 60_000) as {
		n: number;
	};
	if (started.n >= 3) throw new EventError('You’ve started 3 this hour. Give it a rest.');
	db.prepare('INSERT INTO takeaways (event_id, place, started_by, started_at) VALUES (?, ?, ?, ?)').run(eventId, place, userId, nowMs);
	const name = (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;
	for (const p of goingPeople(eventId)) {
		if (p.id !== userId) notify(p.id, eventId, `${name}’s getting a takeaway from ${place}. Add what you want. (${event.title})`, '/money#takeaway');
	}
	publish(eventId);
}

/** Adds or changes what you want, with its price if you know it. */
export function setItem(eventId: number, userId: number, takeawayId: number, item: string, price: string) {
	requireGoing(eventId, userId);
	requireOpen(eventId, takeawayId);
	item = item.replace(/\s+/g, ' ').trim().slice(0, 100);
	if (!item) throw new EventError('What do you want?');
	const pence = price.trim() ? parsePounds(price) : null;
	if (price.trim() && !pence) throw new EventError('Enter a price like 8.50, or leave it blank.');
	db.prepare(
		`INSERT INTO takeaway_items (takeaway_id, user_id, item, price_pence) VALUES (?, ?, ?, ?)
		 ON CONFLICT (takeaway_id, user_id) DO UPDATE SET item = excluded.item, price_pence = excluded.price_pence`
	).run(takeawayId, userId, item, pence);
	publish(eventId);
}

/** Takes your order out. */
export function removeItem(eventId: number, userId: number, takeawayId: number) {
	requireMember(eventId, userId);
	requireOpen(eventId, takeawayId);
	db.prepare('DELETE FROM takeaway_items WHERE takeaway_id = ? AND user_id = ?').run(takeawayId, userId);
	publish(eventId);
}

/** Says you'll do the ordering, or that you won't after all. */
export function setOrderer(eventId: number, userId: number, takeawayId: number, ordering: boolean) {
	requireGoing(eventId, userId);
	const t = requireOpen(eventId, takeawayId);
	if (ordering) {
		if (t.orderer_id && t.orderer_id !== userId) throw new EventError('Someone else is already ordering it.');
		db.prepare('UPDATE takeaways SET orderer_id = ? WHERE id = ?').run(userId, takeawayId);
	} else if (t.orderer_id === userId) {
		db.prepare('UPDATE takeaways SET orderer_id = NULL WHERE id = ?').run(takeawayId);
	}
	publish(eventId);
}

/**
 * Each person's share of what the orderer paid, in pence. Items with a price cost their price, and the
 * rest (delivery, items without a price) is split evenly between everyone who ordered, with the spare
 * pennies going to the lowest user ids, as the kitty does.
 */
export function shares(list: Pick<Item, 'user_id' | 'price_pence'>[], total: number) {
	const priced = list.reduce((sum, i) => sum + (i.price_pence ?? 0), 0);
	const rest = total - priced;
	const people = list.map((i) => i.user_id).sort((a, b) => a - b);
	const base = Math.floor(rest / people.length);
	const extra = rest - base * people.length;
	const restShare = new Map(people.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
	return { priced, rest, each: new Map(list.map((i) => [i.user_id, (i.price_pence ?? 0) + restShare.get(i.user_id)!])) };
}

/**
 * The orderer says it's ordered and what they paid. Each priced item becomes a kitty cost for the person
 * who ordered it, and the rest is one cost split between everyone in the order. Everyone is told their share.
 */
export function placeOrder(eventId: number, userId: number, takeawayId: number, total: string, nowMs = Date.now()) {
	const event = requireMember(eventId, userId);
	const t = requireOpen(eventId, takeawayId);
	if (t.orderer_id !== userId) throw new EventError('Only the person ordering can say it’s ordered.');
	const list = items(takeawayId);
	if (!list.length) throw new EventError('Nobody’s added anything yet.');
	const pence = parsePounds(total);
	if (!pence) throw new EventError('Enter what you paid, like 32.50.');
	const split = shares(list, pence);
	if (split.rest < 0) throw new EventError(`That’s less than the prices people put in (${formatPounds(split.priced)}).`);
	tx(() => {
		const cost = db.prepare('INSERT INTO expenses (event_id, paid_by, description, amount_pence) VALUES (?, ?, ?, ?)');
		const share = db.prepare('INSERT INTO expense_shares (expense_id, user_id) VALUES (?, ?)');
		for (const i of list) {
			// The orderer's own item is theirs alone, but goes in too so the kitty's total is what they paid.
			if (!i.price_pence) continue;
			share.run(cost.run(eventId, userId, `${t.place}: ${i.item}`.slice(0, 100), i.price_pence).lastInsertRowid, i.user_id);
		}
		if (split.rest > 0) {
			const { lastInsertRowid } = cost.run(eventId, userId, `${t.place}${split.priced ? ' (the rest, split)' : ''}`.slice(0, 100), split.rest);
			for (const i of list) share.run(lastInsertRowid, i.user_id);
		}
		db.prepare('UPDATE takeaways SET total_pence = ?, ordered_at = ? WHERE id = ?').run(pence, nowMs, takeawayId);
	});
	const name = (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;
	for (const i of list) {
		if (i.user_id !== userId)
			notify(i.user_id, eventId, `${name} ordered from ${t.place}. Your share, ${formatPounds(split.each.get(i.user_id)!)}, is in the kitty. (${event.title})`, '/money#takeaway');
	}
	publish(eventId);
}

/** Calls off an order that hasn't been placed. The person who started it or the host can. */
export function cancelTakeaway(eventId: number, userId: number, takeawayId: number) {
	const event = requireMember(eventId, userId);
	const t = requireOpen(eventId, takeawayId);
	if (t.started_by !== userId && event.host_id !== userId) throw new EventError('Only whoever started it or the host can call it off.');
	db.prepare('UPDATE takeaways SET cancelled = 1 WHERE id = ?').run(takeawayId);
	db.prepare('DELETE FROM takeaway_items WHERE takeaway_id = ?').run(takeawayId);
	publish(eventId);
}

/** The latest takeaway (open, or the last one ordered) with everyone's orders, and whether you can start one. */
export function getTakeaway(eventId: number, viewerId: number) {
	const event = requireMember(eventId, viewerId);
	const t = db
		.prepare(
			`SELECT t.id, t.place, t.started_by, s.name AS by, t.orderer_id, o.name AS orderer, t.total_pence, t.ordered_at
			 FROM takeaways t JOIN users s ON s.id = t.started_by LEFT JOIN users o ON o.id = t.orderer_id
			 WHERE t.event_id = ? AND t.cancelled = 0 ORDER BY t.id DESC LIMIT 1`
		)
		.get(eventId) as Row | undefined;
	const going = goingPeople(eventId).some((p) => p.id === viewerId);
	if (!t) return { order: null, canStart: going };
	const list = items(t.id);
	const each = t.total_pence ? shares(list, t.total_pence).each : null;
	return {
		order: {
			...t,
			items: list.map((i) => ({ ...i, share: each?.get(i.user_id) ?? null })),
			priced: list.reduce((sum, i) => sum + (i.price_pence ?? 0), 0),
			canCancel: !t.ordered_at && (t.started_by === viewerId || event.host_id === viewerId)
		},
		canStart: going && !!t.ordered_at
	};
}
