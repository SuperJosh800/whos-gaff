// Push notifications: anything that lands in someone's updates (notify) also buzzes the phones they
// turned notifications on for, even with the app closed. The signing (VAPID) keys are made once and kept
// in the database, so subscriptions keep working across restarts and updates.
import { generateVAPIDKeys, sendNotification } from 'web-push';
import { db } from './db.ts';

type Keys = { publicKey: string; privateKey: string };
let keys: Keys | null = null;

function vapidKeys(): Keys {
	if (keys) return keys;
	const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'vapid'`).get() as { value: string } | undefined;
	if (row) return (keys = JSON.parse(row.value) as Keys);
	const made = generateVAPIDKeys();
	db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vapid', ?)`).run(JSON.stringify(made));
	// Another process may have won the race; use whatever is stored.
	const stored = db.prepare(`SELECT value FROM app_settings WHERE key = 'vapid'`).get() as { value: string };
	return (keys = JSON.parse(stored.value) as Keys);
}

/** The key browsers need to subscribe. */
export const pushPublicKey = () => vapidKeys().publicKey;

// Only the browsers' own push services: anything else would let someone make the server post to any URL.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const MAX_DEVICES = 10;

const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * Saves the subscription a browser sent for this login. Logging out deletes it. A device someone else
 * used is handed to this login, and only a person's newest few devices are kept.
 */
export function savePushSubscription(userId: number, sessionId: string, sub: unknown) {
	const { endpoint, keys } = (sub ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	if (!text(endpoint, 1000) || !text(keys?.p256dh, 200) || !text(keys?.auth, 100)) throw new Error('Bad subscription');
	const url = URL.parse(endpoint as string);
	if (url?.protocol !== 'https:' || url.port || !PUSH_HOSTS.some((h) => h.test(url.hostname))) throw new Error('Bad subscription');
	db.prepare(
		`INSERT INTO push_subscriptions (endpoint, user_id, session_id, p256dh, auth) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id,
		   p256dh = excluded.p256dh, auth = excluded.auth, created_at = datetime('now')`
	).run(endpoint as string, userId, sessionId, keys!.p256dh as string, keys!.auth as string);
	db.prepare(
		`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN
		 (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`
	).run(userId, userId, MAX_DEVICES);
}

/** Whether this device gets pushes for this login (it may still be subscribed for someone who logged out). */
export function pushIsOn(sessionId: string, endpoint: string) {
	return !!db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ? AND session_id = ?').get(endpoint, sessionId);
}

export function removePushSubscription(userId: number, endpoint: string) {
	db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
}

/**
 * Sends a notification to every device the person turned notifications on for. Doesn't wait for the
 * push services; a device the service says is gone (404 or 410) is forgotten.
 */
export function pushTo(userId: number, message: { body: string; url: string }) {
	const subs = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as {
		endpoint: string;
		p256dh: string;
		auth: string;
	}[];
	if (!subs.length) return Promise.resolve();
	const { publicKey, privateKey } = vapidKeys();
	const origin = process.env.ORIGIN ?? '';
	const subject = origin.startsWith('https://') ? origin : 'mailto:no-reply@whos-gaff.local';
	const payload = JSON.stringify({ title: "Who's Gaff", ...message });
	return Promise.all(
		subs.map((s) =>
			sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
				vapidDetails: { subject, publicKey, privateKey },
				TTL: 60 * 60 * 6,
				urgency: 'high',
				timeout: 10_000
			})
				.catch((e: { statusCode?: number }) => {
					if (e?.statusCode === 404 || e?.statusCode === 410) {
						db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
					} else {
						console.error('[push] failed', e?.statusCode ?? e);
					}
				})
				.catch((e) => console.error('[push] failed', e))
		)
	).then(() => undefined);
}
