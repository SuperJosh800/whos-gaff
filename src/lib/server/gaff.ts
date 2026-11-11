import { db } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, getEvent, isMember, type Event } from './events.ts';

// ---- Gaff profiles (WG-24) ----

export type Gaff = {
	id: number;
	owner_id: number;
	name: string;
	address: string;
	house_rules: string;
	wifi: string;
	coats: string;
	parking: string;
	notes: string;
};

export const GAFF_FIELDS = ['name', 'address', 'house_rules', 'wifi', 'coats', 'parking', 'notes'] as const;
export type GaffInput = Record<(typeof GAFF_FIELDS)[number], string>;

export function listGaffs(ownerId: number) {
	return db.prepare('SELECT * FROM gaffs WHERE owner_id = ? ORDER BY name').all(ownerId) as Gaff[];
}

export function getGaff(id: number) {
	return db.prepare('SELECT * FROM gaffs WHERE id = ?').get(id) as Gaff | undefined;
}

function ownGaff(id: number, ownerId: number) {
	const gaff = getGaff(id);
	if (!gaff || gaff.owner_id !== ownerId) throw new EventError('Gaff profile not found.');
	return gaff;
}

/** Creates a gaff profile, or updates it when id is given. Returns its id. */
export function saveGaff(ownerId: number, input: GaffInput, id?: number) {
	const values = GAFF_FIELDS.map((f) => (input[f] ?? '').trim());
	if (!values[0]) throw new EventError('Give the gaff a name, e.g. "Josh’s flat".');
	if (id) {
		ownGaff(id, ownerId);
		db.prepare(
			`UPDATE gaffs SET ${GAFF_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`
		).run(...values, id);
		return id;
	}
	const { lastInsertRowid } = db
		.prepare(
			`INSERT INTO gaffs (owner_id, ${GAFF_FIELDS.join(', ')}) VALUES (?, ${GAFF_FIELDS.map(() => '?').join(', ')})`
		)
		.run(ownerId, ...values);
	return Number(lastInsertRowid);
}

export function deleteGaff(ownerId: number, id: number) {
	ownGaff(id, ownerId);
	db.prepare('DELETE FROM gaffs WHERE id = ?').run(id);
}

/** The host attaches one of their saved gaff profiles to an event, or detaches it with null. */
export function attachGaff(eventId: number, hostId: number, gaffId: number | null) {
	const event = getEvent(eventId);
	if (!event || event.host_id !== hostId) throw new EventError('Only the host can do that.');
	if (gaffId !== null) ownGaff(gaffId, hostId);
	db.prepare('UPDATE events SET gaff_id = ? WHERE id = ?').run(gaffId, eventId);
	publish(eventId);
}

// ---- Address unlock (WG-25) ----

/** The address and gaff details are only shown to the host and people who RSVP'd "going". */
export function canSeeAddress(event: Event, userId: number) {
	if (event.host_id === userId) return true;
	const rsvp = db
		.prepare('SELECT response FROM rsvps WHERE event_id = ? AND user_id = ?')
		.get(event.id, userId) as { response: string } | undefined;
	return rsvp?.response === 'yes';
}

// ---- Bring list and damage log (WG-26) ----

export type BringItem = { id: number; name: string; added_by: number; claimed_by: number | null; claimed_by_name: string | null };

export function listBringItems(eventId: number) {
	return db
		.prepare(
			`SELECT b.id, b.name, b.added_by, b.claimed_by, u.name AS claimed_by_name FROM bring_items b
			 LEFT JOIN users u ON u.id = b.claimed_by WHERE b.event_id = ? ORDER BY b.id`
		)
		.all(eventId) as BringItem[];
}

function requireMember(eventId: number, userId: number) {
	const event = getEvent(eventId);
	if (!event || !isMember(eventId, userId)) throw new EventError('You are not invited to this event.');
	return event;
}

function requireItem(eventId: number, itemId: number) {
	const item = db
		.prepare('SELECT id, added_by, claimed_by FROM bring_items WHERE id = ? AND event_id = ?')
		.get(itemId, eventId) as { id: number; added_by: number; claimed_by: number | null } | undefined;
	if (!item) throw new EventError('That item is no longer on the list.');
	return item;
}

export function addBringItem(eventId: number, userId: number, name: string) {
	requireMember(eventId, userId);
	name = name.trim();
	if (!name) throw new EventError('What needs bringing?');
	if (name.length > 100) throw new EventError('Keep it under 100 characters.');
	db.prepare('INSERT INTO bring_items (event_id, name, added_by) VALUES (?, ?, ?)').run(eventId, name, userId);
	publish(eventId);
}

/** Claims an unclaimed item, or un-claims an item the user already claimed. */
export function toggleClaim(eventId: number, userId: number, itemId: number) {
	requireMember(eventId, userId);
	const item = requireItem(eventId, itemId);
	if (item.claimed_by && item.claimed_by !== userId) throw new EventError('Someone else is already bringing that.');
	db.prepare('UPDATE bring_items SET claimed_by = ? WHERE id = ?').run(item.claimed_by ? null : userId, itemId);
	publish(eventId);
}

export function removeBringItem(eventId: number, userId: number, itemId: number) {
	const event = requireMember(eventId, userId);
	const item = requireItem(eventId, itemId);
	if (item.added_by !== userId && event.host_id !== userId) {
		throw new EventError('Only the host or whoever added it can remove it.');
	}
	db.prepare('DELETE FROM bring_items WHERE id = ?').run(itemId);
	publish(eventId);
}

export type DamageEntry = { id: number; culprit: string; what: string; reported_by_name: string; created_at: string };

export function listDamage(eventId: number) {
	return db
		.prepare(
			`SELECT d.id, d.culprit, d.what, u.name AS reported_by_name, d.created_at FROM damage_log d
			 JOIN users u ON u.id = d.reported_by WHERE d.event_id = ? ORDER BY d.id DESC`
		)
		.all(eventId) as DamageEntry[];
}

export function addDamage(eventId: number, userId: number, culprit: string, what: string) {
	requireMember(eventId, userId);
	culprit = culprit.trim();
	what = what.trim();
	if (!culprit || !what) throw new EventError('Say who broke what.');
	db.prepare('INSERT INTO damage_log (event_id, reported_by, culprit, what) VALUES (?, ?, ?, ?)').run(
		eventId,
		userId,
		culprit.slice(0, 60),
		what.slice(0, 200)
	);
	publish(eventId);
}
