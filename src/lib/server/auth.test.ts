import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import {
	changePassword,
	createPasswordReset,
	createSession,
	getSessionUser,
	logIn,
	resetPassword,
	resetTokenValid,
	signUp,
	type User
} from './auth.ts';
import { attempt, attemptAll } from './ratelimit.ts';
import { deleteAccount, exportData } from './account.ts';
import { createEvent, getEvent, joinByToken, postMessage } from './events.ts';
import { addExpense } from './money.ts';

let n = 0;
const user = (name: string) => signUp(`${name.toLowerCase()}${++n}@auth.test`, name, 'correct-horse-9') as User;

describe('sign up', () => {
	it('rejects common and over-long passwords', () => {
		expect(signUp('x1@auth.test', 'X', 'password123')).toEqual({ error: expect.stringContaining('too easy') });
		expect(signUp('x2@auth.test', 'X', 'a'.repeat(201))).toEqual({ error: expect.stringContaining('at most') });
	});

	it('records when the terms were accepted', () => {
		const u = user('Terms');
		const row = db.prepare('SELECT terms_accepted_at FROM users WHERE id = ?').get(u.id) as { terms_accepted_at: string };
		expect(row.terms_accepted_at).toBeTruthy();
	});
});

describe('passwords', () => {
	it('changes the password and logs out other devices only', () => {
		const u = user('Changer');
		const here = createSession(u.id);
		const elsewhere = createSession(u.id);
		expect(changePassword(u.id, 'wrong-password', 'new-pass-phrase', here.token)).toMatch(/wrong/);
		expect(changePassword(u.id, 'correct-horse-9', 'new-pass-phrase', here.token)).toBeNull();
		expect(getSessionUser(here.token)?.id).toBe(u.id);
		expect(getSessionUser(elsewhere.token)).toBeNull();
		expect(logIn(u.email, 'new-pass-phrase')?.id).toBe(u.id);
	});

	it('resets a forgotten password once, then the link stops working', () => {
		const u = user('Forgetful');
		const session = createSession(u.id);
		expect(createPasswordReset('nobody@auth.test')).toBeNull();
		const reset = createPasswordReset(u.email.toUpperCase())!;
		expect(resetTokenValid(reset.token)).toBe(true);
		expect(resetPassword(reset.token, 'short')).toEqual({ error: expect.any(String) });
		expect(resetPassword(reset.token, 'fresh-start-22')).toEqual({ userId: u.id });
		expect(resetTokenValid(reset.token)).toBe(false);
		expect(resetPassword(reset.token, 'another-one-33')).toEqual({ error: expect.stringContaining('expired') });
		expect(getSessionUser(session.token)).toBeNull();
		expect(logIn(u.email, 'fresh-start-22')?.id).toBe(u.id);
	});

	it('only keeps the newest reset link', () => {
		const u = user('Twice');
		const first = createPasswordReset(u.email)!;
		const second = createPasswordReset(u.email)!;
		expect(resetTokenValid(first.token)).toBe(false);
		expect(resetTokenValid(second.token)).toBe(true);
	});
});

describe('rate limits', () => {
	it('allows up to the limit in the window, then blocks until it passes', () => {
		const t = 1_000_000;
		for (let i = 0; i < 3; i++) expect(attempt('t:a', 3, 60_000, t + i).ok).toBe(true);
		const blocked = attempt('t:a', 3, 60_000, t + 10);
		expect(blocked).toEqual({ ok: false, retryAfter: 60 });
		expect(attempt('t:a', 3, 60_000, t + 60_001).ok).toBe(true);
	});

	it('fails when any of several limits is used up', () => {
		expect(attemptAll([{ key: 't:b', limit: 1, windowMs: 1000 }], 0)).toBeNull();
		expect(attemptAll([{ key: 't:c', limit: 5, windowMs: 1000 }, { key: 't:b', limit: 1, windowMs: 1000 }], 1)).toMatch(/Too many/);
	});
});

describe('your data', () => {
	it('exports what you added without password hashes', () => {
		const u = user('Exporter');
		const id = createEvent(u.id, { title: 'Pres', mode: 'fixed', startsAt: '2099-01-01T20:00' });
		postMessage(id, u.id, 'hello');
		const data = exportData(u.id);
		expect(JSON.stringify(data)).not.toContain('password_hash');
		expect(data.messages).toEqual([expect.objectContaining({ body: 'hello' })]);
		expect(data.events_hosted).toEqual([expect.objectContaining({ title: 'Pres' })]);
	});

	it('deletes an account, hands hosting on and keeps shared money records anonymous', () => {
		const host = user('Leaver');
		const guest = user('Stayer');
		const id = createEvent(host.id, { title: 'Gaff', mode: 'fixed', startsAt: '2099-01-01T20:00' });
		const lonely = createEvent(host.id, { title: 'Nobody came', mode: 'fixed', startsAt: '2099-01-02T20:00' });
		joinByToken(getEvent(id)!.invite_token, guest.id);
		postMessage(id, host.id, 'my secret message');
		addExpense(id, host.id, 'Crisps', '6.00', [host.id, guest.id]);
		const session = createSession(host.id);

		deleteAccount(host.id);

		expect(getEvent(id)!.host_id).toBe(guest.id);
		expect(getEvent(lonely)).toBeUndefined();
		expect(getSessionUser(session.token)).toBeNull();
		expect(logIn(host.email, 'correct-horse-9')).toBeNull();
		const row = db.prepare('SELECT name, email FROM users WHERE id = ?').get(host.id) as { name: string; email: string };
		expect(row).toEqual({ name: 'Deleted user', email: `deleted-${host.id}@deleted.invalid` });
		expect(db.prepare('SELECT COUNT(*) AS c FROM messages WHERE user_id = ?').get(host.id)).toEqual({ c: 0 });
		expect(db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE event_id = ?').get(id)).toEqual({ c: 1 });
		// The email can be used for a new account.
		expect('id' in signUp(host.email, 'Back again', 'correct-horse-9')).toBe(true);
	});
});
