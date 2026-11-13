import { db, tx } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, isMember, requireMember } from './events.ts';

type Person = { id: number; name: string };

/** Everyone going, plus the host: the people in rounds and in the kitty by default. */
export function goingPeople(eventId: number) {
	return db
		.prepare(
			`SELECT u.id, u.name FROM event_members m
			 JOIN events e ON e.id = m.event_id
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = m.user_id
			 WHERE m.event_id = ? AND (r.response = 'yes' OR m.user_id = e.host_id)
			 ORDER BY u.id`
		)
		.all(eventId) as Person[];
}

// ---- Designated drivers ----

/** People going who are driving tonight. */
export function listDrivers(eventId: number) {
	const marked = new Set(
		(db.prepare('SELECT user_id FROM drivers WHERE event_id = ?').all(eventId) as { user_id: number }[]).map((r) => r.user_id)
	);
	return goingPeople(eventId).filter((p) => marked.has(p.id));
}

/** Says whether someone's driving tonight: yourself, or anyone if you're the host. Only people going can drive. */
export function setDriving(eventId: number, userId: number, who: number, driving: boolean) {
	const event = requireMember(eventId, userId);
	if (who !== userId && event.host_id !== userId) throw new EventError('Only the host can say who else is driving.');
	if (driving) {
		if (!goingPeople(eventId).some((p) => p.id === who)) throw new EventError(who === userId ? 'RSVP “going” first.' : 'They’re not going.');
		db.prepare('INSERT OR IGNORE INTO drivers (event_id, user_id) VALUES (?, ?)').run(eventId, who);
	} else {
		db.prepare('DELETE FROM drivers WHERE event_id = ? AND user_id = ?').run(eventId, who);
	}
	publish(eventId);
}

// ---- Rounds tracker (WG-20), with smaller rounds (WG-40) ----

/**
 * The rounds at an event. Anyone can split off a smaller round with just their mates; everyone else
 * going stays in the main round (id null). Each round goes round its own people in turn.
 */
export function getRounds(eventId: number) {
	const groups = db
		.prepare(
			`SELECT g.id, u.id AS user_id, u.name FROM round_groups g
			 JOIN round_group_members gm ON gm.group_id = g.id JOIN users u ON u.id = gm.user_id
			 WHERE g.event_id = ? ORDER BY g.id, u.id`
		)
		.all(eventId) as { id: number; user_id: number; name: string }[];
	const inGroup = new Set(groups.map((g) => g.user_id));
	const lists: { id: number | null; people: Person[] }[] = [
		{ id: null, people: goingPeople(eventId).filter((p) => !inGroup.has(p.id)) }
	];
	for (const g of groups) {
		if (lists.at(-1)!.id !== g.id) lists.push({ id: g.id, people: [] });
		lists.at(-1)!.people.push({ id: g.user_id, name: g.name });
	}
	const driving = new Set(listDrivers(eventId).map((d) => d.id));
	return lists.filter((l) => l.id !== null || l.people.length).map(({ id, people }) => roundState(eventId, id, people, driving));
}

export type Round = ReturnType<typeof roundState>;

function roundState(eventId: number, groupId: number | null, order: Person[], driving: Set<number>) {
	const history = db
		.prepare(
			`SELECT r.id, r.user_id, u.name, r.skipped, r.created_at FROM rounds r
			 JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.group_id IS ? ORDER BY r.id`
		)
		.all(eventId, groupId) as { id: number; user_id: number; name: string; skipped: number; created_at: string }[];
	// Rounds go round in a fixed order; the next one is whoever follows the last person recorded,
	// passing over anyone driving tonight.
	const lastIndex = history.length ? order.findIndex((p) => p.id === history.at(-1)!.user_id) : -1;
	const turns = order.map((_, i) => order[(lastIndex + 1 + i) % order.length]);
	const next = turns.find((p) => !driving.has(p.id)) ?? null;
	const tally = order.map((p) => ({
		...p,
		driving: driving.has(p.id),
		bought: history.filter((h) => h.user_id === p.id && !h.skipped).length,
		skipped: history.filter((h) => h.user_id === p.id && h.skipped).length
	}));
	return { id: groupId, next, tally, history: history.slice().reverse() };
}

/** Records a round's current turn as bought or skipped. forUser guards against two people tapping at once. */
export function recordRound(eventId: number, userId: number, groupId: number | null, forUser: number, skipped: boolean) {
	requireMember(eventId, userId);
	const round = getRounds(eventId).find((r) => r.id === groupId);
	if (!round?.next || round.next.id !== forUser) throw new EventError('Someone already updated the rounds. Have another look.');
	db.prepare('INSERT INTO rounds (event_id, user_id, skipped, group_id) VALUES (?, ?, ?, ?)').run(
		eventId,
		forUser,
		skipped ? 1 : 0,
		groupId
	);
	publish(eventId);
}

/**
 * Sets who is in a smaller round, or makes a new one when groupId is null. People move out of any
 * other smaller round they were in, and a round left with fewer than two people is closed.
 */
export function saveRoundGroup(eventId: number, userId: number, groupId: number | null, memberIds: number[]) {
	requireMember(eventId, userId);
	const members = [...new Set(memberIds)];
	if (members.length < 2) throw new EventError('Pick at least two people for the round.');
	if (!members.every((id) => isMember(eventId, id))) throw new EventError('Everyone in the round has to be on the event.');
	tx(() => {
		let id = groupId;
		if (id === null) {
			id = Number(db.prepare('INSERT INTO round_groups (event_id) VALUES (?)').run(eventId).lastInsertRowid);
		} else if (!db.prepare('SELECT 1 FROM round_groups WHERE id = ? AND event_id = ?').get(id, eventId)) {
			throw new EventError('That round has finished.');
		}
		const marks = members.map(() => '?').join(',');
		db.prepare(
			`DELETE FROM round_group_members WHERE user_id IN (${marks}) AND group_id != ?
			 AND group_id IN (SELECT id FROM round_groups WHERE event_id = ?)`
		).run(...members, id, eventId);
		db.prepare(`DELETE FROM round_group_members WHERE group_id = ? AND user_id NOT IN (${marks})`).run(id, ...members);
		const add = db.prepare('INSERT OR IGNORE INTO round_group_members (group_id, user_id) VALUES (?, ?)');
		for (const m of members) add.run(id, m);
		closeSmallRounds(eventId);
	});
	publish(eventId);
}

/** Leaves a smaller round and goes back to the main one. */
export function leaveRoundGroup(eventId: number, userId: number, groupId: number) {
	requireMember(eventId, userId);
	tx(() => {
		db.prepare(
			'DELETE FROM round_group_members WHERE user_id = ? AND group_id IN (SELECT id FROM round_groups WHERE id = ? AND event_id = ?)'
		).run(userId, groupId, eventId);
		closeSmallRounds(eventId);
	});
	publish(eventId);
}

function closeSmallRounds(eventId: number) {
	db.prepare(
		`DELETE FROM round_groups WHERE event_id = ?
		 AND (SELECT COUNT(*) FROM round_group_members WHERE group_id = round_groups.id) < 2`
	).run(eventId);
}

// ---- Kitty / split (WG-21) ----

export function parsePounds(value: string) {
	const match = value.trim().replace(/^£/, '').match(/^(\d{1,5})(?:\.(\d{1,2}))?$/);
	if (!match) return null;
	const pence = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	return pence > 0 ? pence : null;
}

export const formatPounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export function addExpense(eventId: number, userId: number, description: string, amount: string, shareIds: number[]) {
	requireMember(eventId, userId);
	description = description.trim();
	if (!description) throw new EventError('What was it for?');
	const pence = parsePounds(amount);
	if (!pence) throw new EventError('Enter an amount like 12.50.');
	const shares = [...new Set(shareIds)];
	if (!shares.length) throw new EventError('Pick who it’s split between.');
	if (shares.some((id) => !isMember(eventId, id))) throw new EventError('Only people on the event can share a cost.');
	db.exec('BEGIN');
	try {
		const { lastInsertRowid } = db
			.prepare('INSERT INTO expenses (event_id, paid_by, description, amount_pence) VALUES (?, ?, ?, ?)')
			.run(eventId, userId, description.slice(0, 100), pence);
		const insert = db.prepare('INSERT INTO expense_shares (expense_id, user_id) VALUES (?, ?)');
		for (const id of shares) insert.run(lastInsertRowid, id);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	publish(eventId);
}

export type Expense = { id: number; paid_by: number; payer: string; description: string; amount_pence: number; shares: number[] };

export function listExpenses(eventId: number) {
	const rows = db
		.prepare(
			`SELECT e.id, e.paid_by, u.name AS payer, e.description, e.amount_pence,
				(SELECT GROUP_CONCAT(user_id) FROM expense_shares s WHERE s.expense_id = e.id) AS share_ids
			 FROM expenses e JOIN users u ON u.id = e.paid_by WHERE e.event_id = ? ORDER BY e.id`
		)
		.all(eventId) as (Omit<Expense, 'shares'> & { share_ids: string })[];
	return rows.map(({ share_ids, ...e }) => ({ ...e, shares: share_ids.split(',').map(Number).sort((a, b) => a - b) }));
}

export type Transfer = { from: number; to: number; amount: number };

/**
 * Net balance per person in pence (positive: they are owed). Each cost is split evenly between
 * its sharers; leftover pennies go to the first sharers by user id so totals always balance.
 */
export function balances(expenses: Pick<Expense, 'paid_by' | 'amount_pence' | 'shares'>[], settled: Transfer[]) {
	const balance = new Map<number, number>();
	const add = (id: number, pence: number) => balance.set(id, (balance.get(id) ?? 0) + pence);
	for (const e of expenses) {
		add(e.paid_by, e.amount_pence);
		const base = Math.floor(e.amount_pence / e.shares.length);
		const extra = e.amount_pence - base * e.shares.length;
		e.shares.forEach((id, i) => add(id, -(base + (i < extra ? 1 : 0))));
	}
	for (const t of settled) {
		add(t.from, t.amount);
		add(t.to, -t.amount);
	}
	return balance;
}

/** Who pays whom to settle all balances: the biggest debtor pays the biggest creditor first. */
export function settleUp(balance: Map<number, number>) {
	const debtors = [...balance].filter(([, b]) => b < 0).map(([id, b]) => ({ id, owe: -b }));
	const creditors = [...balance].filter(([, b]) => b > 0).map(([id, b]) => ({ id, due: b }));
	const transfers: Transfer[] = [];
	debtors.sort((a, b) => b.owe - a.owe || a.id - b.id);
	creditors.sort((a, b) => b.due - a.due || a.id - b.id);
	let c = 0;
	for (const d of debtors) {
		while (d.owe > 0 && c < creditors.length) {
			const amount = Math.min(d.owe, creditors[c].due);
			transfers.push({ from: d.id, to: creditors[c].id, amount });
			d.owe -= amount;
			creditors[c].due -= amount;
			if (creditors[c].due === 0) c++;
		}
	}
	return transfers;
}

function listSettlements(eventId: number) {
	return db
		.prepare('SELECT from_user AS "from", to_user AS "to", amount_pence AS amount FROM settlements WHERE event_id = ?')
		.all(eventId) as Transfer[];
}

/** A bank-transfer link for paying someone: Monzo.me links get the amount added. */
export function payLink(paymentLink: string, pence: number) {
	if (!paymentLink) return null;
	const monzo = paymentLink.match(/^https:\/\/monzo\.me\/([\w.-]+)\/?$/);
	return monzo ? `https://monzo.me/${monzo[1]}/${(pence / 100).toFixed(2)}` : paymentLink;
}

export function getKitty(eventId: number) {
	const expenses = listExpenses(eventId);
	const transfers = settleUp(balances(expenses, listSettlements(eventId)));
	const people = new Map(
		(
			db
				.prepare(
					`SELECT u.id, u.name, u.payment_link FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = ?`
				)
				.all(eventId) as (Person & { payment_link: string })[]
		).map((p) => [p.id, p])
	);
	// Debts can involve someone no longer in the event, such as a deleted account ("Deleted user").
	const userById = db.prepare('SELECT id, name, payment_link FROM users WHERE id = ?');
	const person = (id: number) => people.get(id) ?? (userById.get(id) as (Person & { payment_link: string }) | undefined);
	return {
		expenses,
		people: [...people.values()].map(({ id, name }) => ({ id, name })),
		defaultShares: goingPeople(eventId).map((p) => p.id),
		total: expenses.reduce((sum, e) => sum + e.amount_pence, 0),
		transfers: transfers.map((t) => ({
			...t,
			fromName: person(t.from)?.name ?? '?',
			toName: person(t.to)?.name ?? '?',
			link: payLink(person(t.to)?.payment_link ?? '', t.amount)
		}))
	};
}

/** Marks a debt as paid. Either side of the transfer can record it. */
export function recordSettlement(eventId: number, userId: number, from: number, to: number) {
	requireMember(eventId, userId);
	if (userId !== from && userId !== to) throw new EventError('Only the people involved can mark this paid.');
	const transfer = settleUp(balances(listExpenses(eventId), listSettlements(eventId))).find(
		(t) => t.from === from && t.to === to
	);
	if (!transfer) throw new EventError('That’s already settled.');
	db.prepare('INSERT INTO settlements (event_id, from_user, to_user, amount_pence) VALUES (?, ?, ?, ?)').run(
		eventId,
		from,
		to,
		transfer.amount
	);
	publish(eventId);
}
