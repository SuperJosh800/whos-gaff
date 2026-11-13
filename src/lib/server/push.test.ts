import { describe, expect, it, vi } from 'vitest';

const sent: { endpoint: string; payload: string }[] = [];
vi.mock('web-push', async (original) => ({
	...(await original<typeof import('web-push')>()),
	sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
		sent.push({ endpoint: sub.endpoint, payload });
		if (sub.endpoint.includes('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
		if (sub.endpoint.includes('flaky')) throw Object.assign(new Error('Busy'), { statusCode: 503 });
	})
}));

const { db } = await import('./db.ts');
const { createSession, deleteSession, hashToken, signUp } = await import('./auth.ts');
const { deleteAccount, exportData } = await import('./account.ts');
const { notify } = await import('./notifications.ts');
const { createEvent } = await import('./events.ts');
const { pushIsOn, pushPublicKey, removePushSubscription, savePushSubscription } = await import('./push.ts');

let n = 0;
/** A new account logged in on one device. */
const login = () => {
	const { id } = signUp(`push${++n}@push.test`, 'Pusher', 'correct-horse-9') as { id: number };
	const { token } = createSession(id);
	return { id, token, session: hashToken(token) };
};
const fcm = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
const endpoints = (userId: number) =>
	(db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY endpoint').all(userId) as { endpoint: string }[]).map((r) => r.endpoint);

describe('push notifications', () => {
	it('keeps the same signing key once made', () => {
		expect(pushPublicKey()).toMatch(/^[\w-]{80,}$/);
		expect(pushPublicKey()).toBe(pushPublicKey());
	});

	it('pushes updates to every device, opening the event page, and forgets devices that are gone', async () => {
		const u = login();
		savePushSubscription(u.id, u.session, sub(fcm('phone')));
		savePushSubscription(u.id, u.session, sub('https://web.push.apple.com/gone'));
		savePushSubscription(u.id, u.session, sub('https://updates.push.services.mozilla.com/wpush/v2/flaky'));

		const id = createEvent(u.id, { title: 'Pres', mode: 'fixed', startsAt: '2099-01-01T20:00' });
		sent.length = 0;
		notify(u.id, id, 'Sam wants to play Ring of fire', '/games');
		await vi.waitFor(() => expect(endpoints(u.id)).toHaveLength(2)); // notify doesn't wait for the pushes
		expect(sent).toHaveLength(3);
		expect(JSON.parse(sent[0].payload)).toEqual({ title: "Who's Gaff", body: 'Sam wants to play Ring of fire', url: `/events/${id}/games` });
		// 410 means the phone unsubscribed; a temporary failure keeps the device.
		expect(endpoints(u.id)).toEqual([fcm('phone'), 'https://updates.push.services.mozilla.com/wpush/v2/flaky']);
	});

	it('only accepts the browsers’ push services, so nobody can make the server post anywhere', () => {
		const u = login();
		for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com:8443/x', 'https://joshserver1.tailfa7b0f.ts.net/x']) {
			expect(() => savePushSubscription(u.id, u.session, sub(bad)), bad).toThrow();
		}
		expect(() => savePushSubscription(u.id, u.session, { endpoint: fcm('x') })).toThrow();
		expect(() => savePushSubscription(u.id, u.session, 'nonsense')).toThrow();
		expect(endpoints(u.id)).toEqual([]);
	});

	it('keeps only a person’s newest 10 devices', () => {
		const u = login();
		for (let i = 0; i < 12; i++) savePushSubscription(u.id, u.session, sub(fcm(`d${String(i).padStart(2, '0')}`)));
		expect(endpoints(u.id)).toHaveLength(10);
		expect(endpoints(u.id)).not.toContain(fcm('d00'));
		expect(endpoints(u.id)).toContain(fcm('d11'));
	});

	it('stops pushing to a phone once its user logs out, even when someone else logs in on it', () => {
		const [a, b] = [login(), login()];
		savePushSubscription(a.id, a.session, sub(fcm('shared')));
		expect(pushIsOn(a.session, fcm('shared'))).toBe(true);
		deleteSession(a.token);
		expect(endpoints(a.id)).toEqual([]);
		expect(pushIsOn(b.session, fcm('shared'))).toBe(false); // so B's profile offers to turn it on
		savePushSubscription(b.id, b.session, sub(fcm('shared')));
		expect(pushIsOn(b.session, fcm('shared'))).toBe(true);
	});

	it('lets only the owner remove a device, exports it without keys, and forgets it on account deletion', () => {
		const [a, b] = [login(), login()];
		savePushSubscription(b.id, b.session, sub(fcm('mine')));
		removePushSubscription(a.id, fcm('mine'));
		expect(endpoints(b.id)).toEqual([fcm('mine')]);
		expect(exportData(b.id).push_subscriptions).toEqual([{ endpoint: fcm('mine'), created_at: expect.any(String) }]);
		deleteAccount(b.id);
		expect(endpoints(b.id)).toEqual([]);
	});
});
