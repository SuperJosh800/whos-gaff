// Buddy system (Night tab). The host pairs up everyone going, with a three when the numbers are odd.
// On the night you can ping your buddy to find them, and they're told when you check in home safe.
import { randomInt } from 'node:crypto';
import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, requireHost, requireMember } from './events.ts';
import { isOver } from './after.ts';
import { goingPeople } from './money.ts';
import { notify } from './notifications.ts';
import { nowLocal } from '../time.ts';

const PING_MINUTES = 5;

type Row = { user_id: number; name: string; grp: number };

/** Groups of two or three people still going; anyone whose buddies all dropped out is left out. */
function groups(eventId: number) {
	const going = new Set(goingPeople(eventId).map((p) => p.id));
	const rows = (
		db
			.prepare('SELECT b.user_id, u.name, b.grp FROM buddies b JOIN users u ON u.id = b.user_id WHERE b.event_id = ? ORDER BY b.grp, u.name')
			.all(eventId) as Row[]
	).filter((r) => going.has(r.user_id));
	const byGroup = new Map<number, Row[]>();
	for (const r of rows) byGroup.set(r.grp, [...(byGroup.get(r.grp) ?? []), r]);
	return [...byGroup.values()].filter((g) => g.length > 1);
}

/** Each person's buddies, as a key that changes when their group does. */
function buddyKeys(eventId: number) {
	const keys = new Map<number, string>();
	for (const g of groups(eventId)) for (const r of g) keys.set(r.user_id, g.map((o) => o.user_id).filter((id) => id !== r.user_id).sort().join());
	return keys;
}

function shuffle<T>(items: T[]) {
	for (let i = items.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

/**
 * Pairs up everyone going who hasn't got a buddy, keeping existing pairs, or reshuffles everyone.
 * There's at most one three: an odd one out joins a pair, or someone from the existing three pairs
 * up with them instead.
 */
export function pairUp(eventId: number, hostId: number, reshuffle = false) {
	requireHost(eventId, hostId);
	const going = goingPeople(eventId);
	if (going.length < 2) throw new EventError('Buddies need at least two people going.');
	const before = buddyKeys(eventId);
	tx(() => {
		// The ping limit belongs to the person, not the pairing, so a reshuffle doesn't reset it.
		const pinged = new Map(
			(db.prepare('SELECT user_id, pinged_at FROM buddies WHERE event_id = ?').all(eventId) as { user_id: number; pinged_at: number | null }[]).map(
				(r) => [r.user_id, r.pinged_at]
			)
		);
		if (reshuffle) db.prepare('DELETE FROM buddies WHERE event_id = ?').run(eventId);
		const kept = groups(eventId);
		const keptIds = new Set(kept.flat().map((r) => r.user_id));
		let loose = going.filter((p) => !keptIds.has(p.id));
		const three = kept.find((g) => g.length === 3);
		if (loose.length % 2 && three) {
			// Take someone out of the three so everyone pairs up and there's still only one three.
			const moved = three[randomInt(3)];
			keptIds.delete(moved.user_id);
			loose = going.filter((p) => !keptIds.has(p.id));
		}
		// Clear out anyone without a buddy now (or no longer going), so they're paired again.
		db.prepare(`DELETE FROM buddies WHERE event_id = ? AND user_id NOT IN (SELECT value FROM json_each(?))`).run(eventId, JSON.stringify([...keptIds]));
		shuffle(loose);
		const { next } = db.prepare('SELECT COALESCE(MAX(grp), 0) + 1 AS next FROM buddies WHERE event_id = ?').get(eventId) as { next: number };
		const insert = db.prepare('INSERT INTO buddies (event_id, user_id, grp, pinged_at) VALUES (?, ?, ?, ?)');
		let grp = next;
		for (let i = 0; i + 1 < loose.length; i += 2, grp++) {
			insert.run(eventId, loose[i].id, grp, pinged.get(loose[i].id) ?? null);
			insert.run(eventId, loose[i + 1].id, grp, pinged.get(loose[i + 1].id) ?? null);
		}
		if (loose.length % 2) {
			// Only possible with no three yet: the odd one out joins a pair, a new one if there is one.
			const last = loose[loose.length - 1];
			const pair = loose.length > 1 ? grp - 1 : groups(eventId).find((g) => g.length === 2)![0].grp;
			insert.run(eventId, last.id, pair, pinged.get(last.id) ?? null);
		}
	});
	// Tell everyone whose buddies changed who they are now.
	const after = buddyKeys(eventId);
	for (const g of groups(eventId)) {
		for (const r of g) {
			if (before.get(r.user_id) === after.get(r.user_id)) continue;
			const others = g.filter((o) => o.user_id !== r.user_id).map((o) => o.name).join(' and ');
			notify(r.user_id, eventId, `Your buddy tonight: ${others}. Look out for each other.`, '/night#buddies');
		}
	}
	publish(eventId);
}

/** The other people in someone's group, or [] when they haven't got a buddy. */
export function buddiesOf(eventId: number, userId: number) {
	return (groups(eventId).find((g) => g.some((r) => r.user_id === userId)) ?? []).filter((r) => r.user_id !== userId);
}

/**
 * Asks your buddies who aren't home yet where you are, once the night has started. Returns who was
 * pinged, or null when you pinged them in the last few minutes (nothing is sent).
 */
export function pingBuddy(eventId: number, userId: number, now = nowLocal(), at = Date.now()) {
	const event = requireMember(eventId, userId);
	if (!isOver(event, now)) throw new EventError('You can ping your buddy once the night starts.');
	const buddies = buddiesOf(eventId, userId);
	if (!buddies.length) throw new EventError('You haven’t got a buddy yet.');
	const home = new Set((db.prepare('SELECT user_id FROM home_safe WHERE event_id = ?').all(eventId) as { user_id: number }[]).map((r) => r.user_id));
	const others = buddies.filter((b) => !home.has(b.user_id));
	if (!others.length) throw new EventError('Your buddy’s already home safe.');
	const { pinged_at } = db.prepare('SELECT pinged_at FROM buddies WHERE event_id = ? AND user_id = ?').get(eventId, userId) as { pinged_at: number | null };
	if (pinged_at && at - pinged_at < PING_MINUTES * 60_000) return null;
	db.prepare('UPDATE buddies SET pinged_at = ? WHERE event_id = ? AND user_id = ?').run(at, eventId, userId);
	const me = (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;
	for (const o of others) notify(o.user_id, eventId, `${me} is looking for you. Where are you?`, '/night#buddies');
	return others.map((o) => o.name).join(' and ');
}

export function getBuddies(eventId: number, userId: number) {
	requireMember(eventId, userId);
	const all = groups(eventId);
	const pairedIds = new Set(all.flat().map((r) => r.user_id));
	return {
		groups: all.map((g) => g.map((r) => r.name)),
		mine: buddiesOf(eventId, userId).map((r) => r.name),
		unpaired: goingPeople(eventId).filter((p) => !pairedIds.has(p.id)).map((p) => p.name)
	};
}
