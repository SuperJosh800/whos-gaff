// A group's quotes wall: the things people said on nights out, with who said it and optionally which
// night. Everyone in the group can vote once for each quote they didn't post or say; the wall sorts by
// votes or by newest.
import { db } from './db.ts';
import { EventError } from './events.ts';
import { isGroupMember, requireGroupMember } from './groups.ts';
import { notify } from './notifications.ts';
import { nowLocal } from '../time.ts';

/** Quotes each person can post in an hour, taken down or not, as each one tells whoever said it. */
export const QUOTES_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

type QuoteRow = { id: number; poster_id: number; said_by: number };

function requireQuote(groupId: number, quoteId: number) {
	const q = db.prepare('SELECT id, poster_id, said_by FROM quotes WHERE id = ? AND group_id = ? AND removed = 0').get(quoteId, groupId) as QuoteRow | undefined;
	if (!q) throw new EventError('That quote’s been taken down.');
	return q;
}

/** Puts a quote on the wall and tells whoever said it (unless that's you). */
export function addQuote(groupId: number, userId: number, saidBy: number, text: string, eventId: number | null, nowMs = Date.now(), now = nowLocal()) {
	const group = requireGroupMember(groupId, userId);
	if (!isGroupMember(groupId, saidBy)) throw new EventError('Pick who said it.');
	text = text.replace(/\s+/g, ' ').trim().replace(/^["“”]+|["“”]+$/g, '').trim().slice(0, 200);
	if (!text) throw new EventError('What did they say?');
	// Only nights that have started, as in the list to pick from.
	if (eventId !== null && !db.prepare('SELECT 1 FROM events WHERE id = ? AND group_id = ? AND starts_at <= ?').get(eventId, groupId, now)) {
		throw new EventError('Pick one of the group’s nights so far.');
	}
	const { n } = db.prepare('SELECT COUNT(*) AS n FROM quotes WHERE poster_id = ? AND posted_at > ?').get(userId, nowMs - HOUR_MS) as { n: number };
	if (n >= QUOTES_PER_HOUR) throw new EventError(`You’ve posted ${QUOTES_PER_HOUR} quotes this hour. Give it a bit.`);
	db.prepare('INSERT INTO quotes (group_id, poster_id, said_by, event_id, text, posted_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, userId, saidBy, eventId, text, nowMs);
	if (saidBy !== userId) {
		const { name } = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string };
		notify(saidBy, null, `${name} put you on the quotes wall in ${group.name}: “${text}”`, `/groups/${groupId}/quotes?sort=new`);
	}
}

/** Votes for a quote, or takes the vote back. Not for quotes you posted or said. */
export function voteQuote(groupId: number, userId: number, quoteId: number, on: boolean) {
	requireGroupMember(groupId, userId);
	const q = requireQuote(groupId, quoteId);
	if (q.poster_id === userId || q.said_by === userId) throw new EventError('You can’t vote for your own quote.');
	if (on) db.prepare('INSERT OR IGNORE INTO quote_votes (quote_id, user_id) VALUES (?, ?)').run(quoteId, userId);
	else db.prepare('DELETE FROM quote_votes WHERE quote_id = ? AND user_id = ?').run(quoteId, userId);
}

/** Whoever posted it, whoever said it, or whoever made the group can take a quote down. */
export function removeQuote(groupId: number, userId: number, quoteId: number) {
	const group = requireGroupMember(groupId, userId);
	const q = requireQuote(groupId, quoteId);
	if (![q.poster_id, q.said_by, group.created_by].includes(userId)) {
		throw new EventError('Only whoever posted it, whoever said it, or whoever made the group can take it down.');
	}
	db.prepare('UPDATE quotes SET removed = 1 WHERE id = ?').run(quoteId);
}

const LIST = `SELECT q.id, q.text, q.poster_id, q.said_by, s.name AS said_by_name, p.name AS poster, e.title AS night, e.starts_at,
		(SELECT COUNT(*) FROM quote_votes v WHERE v.quote_id = q.id) AS votes
	FROM quotes q JOIN users s ON s.id = q.said_by JOIN users p ON p.id = q.poster_id LEFT JOIN events e ON e.id = q.event_id
	WHERE q.group_id = ? AND q.removed = 0`;
type Listed = { id: number; text: string; poster_id: number; said_by: number; said_by_name: string; poster: string; night: string | null; starts_at: string | null; votes: number };

/** The wall, most votes first (newest first among ties) or newest first, and the group's nights so far to tag quotes with. */
export function getWall(groupId: number, viewerId: number, sort: 'top' | 'new', now = nowLocal()) {
	const group = requireGroupMember(groupId, viewerId);
	const quotes = db.prepare(`${LIST} ORDER BY ${sort === 'top' ? 'votes DESC, q.id DESC' : 'q.id DESC'}`).all(groupId) as Listed[];
	const voted = new Set(
		(db.prepare('SELECT v.quote_id FROM quote_votes v JOIN quotes q ON q.id = v.quote_id WHERE q.group_id = ? AND v.user_id = ?').all(groupId, viewerId) as { quote_id: number }[]).map(
			(v) => v.quote_id
		)
	);
	const nights = db
		.prepare('SELECT id, title, starts_at FROM events WHERE group_id = ? AND starts_at <= ? ORDER BY starts_at DESC LIMIT 30')
		.all(groupId, now) as { id: number; title: string; starts_at: string }[];
	return {
		nights,
		quotes: quotes.map((q) => ({
			...q,
			voted: voted.has(q.id),
			canVote: q.poster_id !== viewerId && q.said_by !== viewerId,
			canRemove: [q.poster_id, q.said_by, group.created_by].includes(viewerId)
		}))
	};
}

/** The group's best quote for the group page: the most votes, the newest among ties. */
export function topQuote(groupId: number) {
	return (db.prepare(`${LIST} ORDER BY votes DESC, q.id DESC LIMIT 1`).get(groupId) as Listed | undefined) ?? null;
}
