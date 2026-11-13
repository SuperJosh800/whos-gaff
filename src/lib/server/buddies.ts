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

/**
 * Pairs up everyone going who hasn't got a buddy, keeping existing pairs, or reshuffles everyone.
 * An odd one out joins a pair to make a three.
 */
export function pairUp(eventId: number, hostId: number, reshuffle = false) {
	requireHost(eventId, hostId);
	const going = goingPeople(eventId);
	if (going.length < 2) throw new EventError('Buddies need at least two people going.');
	const paired = tx(() => {
		if (reshuffle) db.prepare('DELETE FROM buddies WHERE event_id = ?').run(eventId);
		const kept = groups(eventId);
		const keptIds = new Set(kept.flat().map((r) => r.user_id));
		// Clear out anyone left without a buddy (or no longer going), so they're paired again.
		const stale = db.prepare('SELECT user_id FROM buddies WHERE event_id = ?').all(eventId) as { user_id: number }[];
		for (const s of stale) if (!keptIds.has(s.user_id)) db.prepare('DELETE FROM buddies WHERE event_id = ? AND user_id = ?').run(eventId, s.user_id);

		const loose = going.filter((p) => !keptIds.has(p.id));
		for (let i = loose.length - 1; i > 0; i--) {
			const j = randomInt(i + 1);
			[loose[i], loose[j]] = [loose[j], loose[i]];
		}
		const { next } = db.prepare('SELECT COALESCE(MAX(grp), 0) + 1 AS next FROM buddies WHERE event_id = ?').get(eventId) as { next: number };
		const insert = db.prepare('INSERT INTO buddies (event_id, user_id, grp) VALUES (?, ?, ?)');
		let grp = next;
		for (let i = 0; i + 1 < loose.length; i += 2, grp++) {
			insert.run(eventId, loose[i].id, grp);
			insert.run(eventId, loose[i + 1].id, grp);
		}
		if (loose.length % 2) {
			// The odd one out joins a pair, preferring a new one so the kept pairs stay as they were.
			const pair = loose.length > 1 ? grp - 1 : kept.find((g) => g.length === 2)?.[0].grp ?? kept[0][0].grp;
			insert.run(eventId, loose[loose.length - 1].id, pair);
		}
		return new Set(loose.map((p) => p.id));
	});
	// Tell everyone whose group changed who their buddies are.
	for (const g of groups(eventId)) {
		if (!g.some((r) => paired.has(r.user_id))) continue;
		for (const r of g) {
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
 * Asks your buddies where you are, once the night has started. Returns who was pinged, or null when
 * you pinged them in the last few minutes (nothing is sent).
 */
export function pingBuddy(eventId: number, userId: number, now = nowLocal(), at = Date.now()) {
	const event = requireMember(eventId, userId);
	if (!isOver(event, now)) throw new EventError('You can ping your buddy once the night starts.');
	const others = buddiesOf(eventId, userId);
	if (!others.length) throw new EventError('You haven’t got a buddy yet.');
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
