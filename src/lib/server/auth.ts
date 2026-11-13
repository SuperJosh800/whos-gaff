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
	if (!salt || !hash) return false;
	const expected = Buffer.from(hash, 'hex');
	const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
	return timingSafeEqual(actual, expected);
}

// Only a hash of the session token is stored, so a leaked database cannot be used to log in.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

/** Returns an error message for a password that is too short, too long or too common, else null. */
export function passwordProblem(password: string) {
	if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
	if (password.length > MAX_PASSWORD) return `Password must be at most ${MAX_PASSWORD} characters.`;
	if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too easy to guess. Pick another.';
	return null;
}

const COMMON_PASSWORDS = new Set([
	'password', 'password1', 'password12', 'password123', 'passw0rd', '12345678', '123456789', '1234567890',
	'87654321', '11111111', '00000000', 'qwertyuiop', 'qwerty123', 'iloveyou', 'abc12345', 'letmein1',
	'football', 'whosgaff', 'baseball', 'sunshine', 'princess', 'trustno1', 'superman', 'welcome1'
]);

export function signUp(email: string, name: string, password: string): User | { error: string } {
	email = email.trim().toLowerCase();
	name = name.trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
	if (!name) return { error: 'Enter your name.' };
	if (name.length > 60) return { error: 'Keep your name under 60 characters.' };
	const problem = passwordProblem(password);
	if (problem) return { error: problem };
	if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
		return { error: 'An account with that email already exists.' };
	}
	const { lastInsertRowid } = db
		.prepare("INSERT INTO users (email, name, password_hash, terms_accepted_at) VALUES (?, ?, ?, datetime('now'))")
		.run(email, name, hashPassword(password));
	return { id: Number(lastInsertRowid), email, name };
}

const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export function logIn(email: string, password: string): User | null {
	const row = db
		.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
		.get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined;
	// Check a dummy hash for unknown emails too, so response times don't reveal who has an account.
	const ok = verifyPassword(password.slice(0, MAX_PASSWORD), row?.password_hash ?? DUMMY_HASH);
	if (!row || !ok) return null;
	return { id: row.id, email: row.email, name: row.name };
}

export type Profile = User & { payment_link: string; payday: number | null };

export function getProfile(userId: number) {
	return db.prepare('SELECT id, email, name, payment_link, payday FROM users WHERE id = ?').get(userId) as Profile;
}

/** Returns an error message, or null when saved. */
export function updateProfile(userId: number, input: { name: string; paymentLink: string; payday: string }) {
	const name = input.name.trim();
	const paymentLink = input.paymentLink.trim();
	const payday = input.payday ? Number(input.payday) : null;
	if (!name) return 'Enter your name.';
	if (name.length > 60) return 'Keep your name under 60 characters.';
	if (paymentLink && !/^https:\/\/\S+$/.test(paymentLink)) return 'Payment links must start with https://';
	if (payday !== null && !(Number.isInteger(payday) && payday >= 1 && payday <= 31)) {
		return 'Payday must be a day of the month (1 to 31).';
	}
	db.prepare('UPDATE users SET name = ?, payment_link = ?, payday = ? WHERE id = ?').run(name, paymentLink, payday, userId);
	return null;
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
	// secure is on everywhere except plain-http localhost, where SvelteKit turns it off for development.
	cookies.set(SESSION_COOKIE, token, { path: '/', expires, sameSite: 'lax', httpOnly: true });
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

/** Logs out every other device, keeping the session with this token. */
export function deleteOtherSessions(userId: number, keepToken: string) {
	db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, hashToken(keepToken));
}

export function purgeExpired(now = Date.now()) {
	db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
	db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now);
}

/** Checks the user's current password. */
export function checkPassword(userId: number, password: string) {
	const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
	return !!row && verifyPassword(password.slice(0, MAX_PASSWORD), row.password_hash);
}

/** Returns an error message, or null when changed. Every other device is logged out. */
export function changePassword(userId: number, current: string, next: string, keepToken: string) {
	if (!checkPassword(userId, current)) return 'Your current password is wrong.';
	const problem = passwordProblem(next);
	if (problem) return problem;
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), userId);
	deleteOtherSessions(userId, keepToken);
	return null;
}

// ---- Password reset ----

const RESET_MINUTES = 60;

/** Makes a one-hour reset token for the account with this email, or returns null if there is none. */
export function createPasswordReset(email: string) {
	const row = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
		| { id: number; name: string }
		| undefined;
	if (!row) return null;
	const token = randomBytes(32).toString('base64url');
	// Only the newest link works.
	db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.id);
	db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
		hashToken(token),
		row.id,
		Date.now() + RESET_MINUTES * 60 * 1000
	);
	return { token, name: row.name, minutes: RESET_MINUTES };
}

export function resetTokenValid(token: string) {
	const row = db.prepare('SELECT expires_at FROM password_resets WHERE token_hash = ?').get(hashToken(token)) as
		| { expires_at: number }
		| undefined;
	return !!row && row.expires_at >= Date.now();
}

/** Sets a new password from a reset link, logs out every device and uses up the link. */
export function resetPassword(token: string, password: string): { userId: number } | { error: string } {
	const row = db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?').get(hashToken(token)) as
		| { user_id: number; expires_at: number }
		| undefined;
	if (!row || row.expires_at < Date.now()) return { error: 'This reset link has expired. Ask for a new one.' };
	const problem = passwordProblem(password);
	if (problem) return { error: problem };
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
	db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id);
	db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
	return { userId: row.user_id };
}
