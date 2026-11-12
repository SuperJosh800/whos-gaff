import { db } from './db.ts';
import { publish } from './realtime.ts';
import { EventError, isMember, requireMember } from './events.ts';

type Person = { id: number; name: string };

/** Everyone going, plus the host: the people in rounds and in the kitty by default. */
function goingPeople(eventId: number) {
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

// ---- Rounds tracker (WG-20) ----

export function getRounds(eventId: number) {
	const order = goingPeople(eventId);
	const history = db
		.prepare(
			`SELECT r.id, r.user_id, u.name, r.skipped, r.created_at FROM rounds r
			 JOIN users u ON u.id = r.user_id WHERE r.event_id = ? ORDER BY r.id`
		)
		.all(eventId) as { id: number; user_id: number; name: string; skipped: number; created_at: string }[];
	// Rounds go round in a fixed order; the next one is whoever follows the last person recorded.
	const lastIndex = history.length ? order.findIndex((p) => p.id === history.at(-1)!.user_id) : -1;
	const next = order.length ? order[(lastIndex + 1) % order.length] : null;
	const tally = order.map((p) => ({
		...p,
		bought: history.filter((h) => h.user_id === p.id && !h.skipped).length,
		skipped: history.filter((h) => h.user_id === p.id && h.skipped).length
	}));
	return { next, tally, history: history.slice().reverse() };
}

/** Records the current round as bought or skipped. forUser guards against two people tapping at once. */
export function recordRound(eventId: number, userId: number, forUser: number, skipped: boolean) {
	requireMember(eventId, userId);
	const { next } = getRounds(eventId);
	if (!next || next.id !== forUser) throw new EventError('Someone already updated the rounds. Have another look.');
	db.prepare('INSERT INTO rounds (event_id, user_id, skipped) VALUES (?, ?, ?)').run(eventId, forUser, skipped ? 1 : 0);
	publish(eventId);
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
