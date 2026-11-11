import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db.ts';

export type User = { id: number; email: string; name: string };

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'session';

function hashPassword(password: string) {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64);
	return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string) {
	const [salt, hash] = stored.split(':');
	const expected = Buffer.from(hash, 'hex');
	const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
	return timingSafeEqual(actual, expected);
}

// Only a hash of the session token is stored, so a leaked database cannot be used to log in.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function signUp(email: string, name: string, password: string): User | { error: string } {
	email = email.trim().toLowerCase();
	name = name.trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
	if (!name) return { error: 'Enter your name.' };
	if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
	if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
		return { error: 'An account with that email already exists.' };
	}
	const { lastInsertRowid } = db
		.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
		.run(email, name, hashPassword(password));
	return { id: Number(lastInsertRowid), email, name };
}

export function logIn(email: string, password: string): User | null {
	const row = db
		.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
		.get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined;
	if (!row || !verifyPassword(password, row.password_hash)) return null;
	return { id: row.id, email: row.email, name: row.name };
}

export function createSession(userId: number) {
	const token = randomBytes(32).toString('base64url');
	const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
	db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
		hashToken(token),
		userId,
		expires
	);
	return { token, expires: new Date(expires) };
}

export function startSession(cookies: Cookies, userId: number) {
	const { token, expires } = createSession(userId);
	cookies.set(SESSION_COOKIE, token, { path: '/', expires, sameSite: 'lax' });
}

/** Only same-site paths are allowed as post-login redirects. */
export function safeNext(next: string | null) {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function getSessionUser(token: string): User | null {
	const row = db
		.prepare(
			`SELECT u.id, u.email, u.name, s.expires_at FROM sessions s
			 JOIN users u ON u.id = s.user_id WHERE s.id = ?`
		)
		.get(hashToken(token)) as (User & { expires_at: number }) | undefined;
	if (!row) return null;
	if (row.expires_at < Date.now()) {
		deleteSession(token);
		return null;
	}
	return { id: row.id, email: row.email, name: row.name };
}

export function deleteSession(token: string) {
	db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}
