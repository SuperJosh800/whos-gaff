// Lost property (After tab): after a night, anyone who went posts what they lost or found, everyone
// else who went is told, and people reply "I've got it" or "That's mine" until it's sorted.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireMember } from './events.ts';
import { canSeeAddress } from './gaff.ts';
import { goingPeople } from './money.ts';
import { isOver } from './after.ts';
import { nowLocal } from '../time.ts';

export type Kind = 'lost' | 'found';
/** Posts each person can make in an hour, as each one tells everyone. */
const POSTS_AN_HOUR = 3;

function requireWent(eventId: number, userId: number, now: string) {
	const event = requireMember(eventId, userId);
	if (!canSeeAddress(event, userId)) throw new EventError('Only people who went can use lost property.');
	if (!isOver(event, now)) throw new EventError('Lost property opens once the night starts.');
	return event;
}

function requireItem(eventId: number, itemId: number) {
	const item = db.prepare('SELECT id, user_id, kind, text, sorted FROM lost_items WHERE id = ? AND event_id = ?').get(itemId, eventId) as
		| { id: number; user_id: number; kind: Kind; text: string; sorted: number }
		| undefined;
	if (!item) throw new EventError('That post’s been taken down.');
	return item;
}

const name = (userId: number) => (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }).name;

export function postItem(eventId: number, userId: number, kind: string, text: string, now = nowLocal(), nowMs = Date.now()) {
	const event = requireWent(eventId, userId, now);
	if (kind !== 'lost' && kind !== 'found') throw new EventError('Lost or found?');
	text = text.replace(/\s+/g, ' ').trim().slice(0, 120);
	if (!text) throw new EventError(kind === 'lost' ? 'What did you lose?' : 'What did you find?');
	const { n } = db.prepare('SELECT COUNT(*) AS n FROM lost_items WHERE user_id = ? AND posted_at > ?').get(userId, nowMs - 60 * 60_000) as { n: number };
	if (n >= POSTS_AN_HOUR) throw new EventError(`You’ve posted ${POSTS_AN_HOUR} this hour. Give it a bit.`);
	db.prepare('INSERT INTO lost_items (event_id, user_id, kind, text, posted_at) VALUES (?, ?, ?, ?, ?)').run(eventId, userId, kind, text, nowMs);
	const who = name(userId);
	const message = kind === 'lost' ? `${who} lost ${text}. Seen it?` : `${who} found ${text}. Yours?`;
	for (const p of goingPeople(eventId)) if (p.id !== userId) notify(p.id, eventId, `Lost property: ${message} (${event.title})`, '/after#lost');
	publish(eventId);
}

/** "I've got it" on something lost, or "That's mine" on something found. The poster is told, once per person. */
export function reply(eventId: number, userId: number, itemId: number, now = nowLocal()) {
	const event = requireWent(eventId, userId, now);
	const item = requireItem(eventId, itemId);
	if (item.user_id === userId) throw new EventError('That’s your own post.');
	if (item.sorted) throw new EventError('That’s been sorted.');
	const { changes } = db.prepare('INSERT OR IGNORE INTO lost_replies (item_id, user_id) VALUES (?, ?)').run(itemId, userId);
	if (changes) {
		const said = item.kind === 'lost' ? 'has got' : 'says it’s theirs:';
		notify(item.user_id, eventId, `Lost property: ${name(userId)} ${said} ${item.text}. (${event.title})`, '/after#lost');
	}
	publish(eventId);
}

/** Takes your reply back. */
export function unreply(eventId: number, userId: number, itemId: number) {
	requireMember(eventId, userId);
	requireItem(eventId, itemId);
	db.prepare('DELETE FROM lost_replies WHERE item_id = ? AND user_id = ?').run(itemId, userId);
	publish(eventId);
}

/** The poster or the host marks a post sorted (or not), or takes it down. */
export function sortItem(eventId: number, userId: number, itemId: number, sorted: boolean) {
	const event = requireMember(eventId, userId);
	const item = requireItem(eventId, itemId);
	if (item.user_id !== userId && event.host_id !== userId) throw new EventError('Only whoever posted it or the host can do that.');
	db.prepare('UPDATE lost_items SET sorted = ? WHERE id = ?').run(sorted ? 1 : 0, itemId);
	publish(eventId);
}

export function removeItem(eventId: number, userId: number, itemId: number) {
	const event = requireMember(eventId, userId);
	const item = requireItem(eventId, itemId);
	if (item.user_id !== userId && event.host_id !== userId) throw new EventError('Only whoever posted it or the host can do that.');
	db.prepare('DELETE FROM lost_items WHERE id = ?').run(itemId);
	publish(eventId);
}

/** Posts for a night, open ones first, newest first, with who replied. */
export function listLost(eventId: number, viewerId: number) {
	const event = requireMember(eventId, viewerId);
	const items = db
		.prepare(
			`SELECT i.id, i.user_id, u.name, i.kind, i.text, i.sorted FROM lost_items i JOIN users u ON u.id = i.user_id
			 WHERE i.event_id = ? ORDER BY i.sorted, i.id DESC`
		)
		.all(eventId) as { id: number; user_id: number; name: string; kind: Kind; text: string; sorted: number }[];
	const replies = db
		.prepare('SELECT r.item_id, u.id, u.name FROM lost_replies r JOIN lost_items i ON i.id = r.item_id JOIN users u ON u.id = r.user_id WHERE i.event_id = ? ORDER BY r.rowid')
		.all(eventId) as { item_id: number; id: number; name: string }[];
	return {
		items: items.map((i) => {
			const who = replies.filter((r) => r.item_id === i.id);
			return {
				...i,
				sorted: !!i.sorted,
				replies: who.map((r) => r.name),
				replied: who.some((r) => r.id === viewerId),
				canManage: i.user_id === viewerId || event.host_id === viewerId
			};
		}),
		canPost: canSeeAddress(event, viewerId)
	};
}
