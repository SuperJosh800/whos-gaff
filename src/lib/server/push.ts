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

export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Saves a device's subscription. A device that another account used is handed to this one. */
export function savePushSubscription(userId: number, sub: Subscription) {
	if (!/^https:\/\//.test(sub?.endpoint ?? '') || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Bad subscription');
	db.prepare(
		`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
		 ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
	).run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth);
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
				urgency: 'high'
			}).catch((e: { statusCode?: number }) => {
				if (e?.statusCode === 404 || e?.statusCode === 410) {
					db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
				} else {
					console.error('[push] failed', e?.statusCode ?? e);
				}
			})
		)
	).then(() => undefined);
}
