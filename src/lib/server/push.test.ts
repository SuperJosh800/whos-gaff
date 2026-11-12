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
const { signUp } = await import('./auth.ts');
const { deleteAccount } = await import('./account.ts');
const { notify } = await import('./notifications.ts');
const { createEvent } = await import('./events.ts');
const { pushPublicKey, removePushSubscription, savePushSubscription } = await import('./push.ts');

let n = 0;
const user = () => signUp(`push${++n}@push.test`, 'Pusher', 'correct-horse-9') as { id: number };
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
const endpoints = (userId: number) =>
	(db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY endpoint').all(userId) as { endpoint: string }[]).map((r) => r.endpoint);

describe('push notifications', () => {
	it('keeps the same signing key once made', () => {
		expect(pushPublicKey()).toMatch(/^[\w-]{80,}$/);
		expect(pushPublicKey()).toBe(pushPublicKey());
	});

	it('pushes updates to every device, opening the event page, and forgets devices that are gone', async () => {
		const u = user();
		savePushSubscription(u.id, sub('https://push.example/phone'));
		savePushSubscription(u.id, sub('https://push.example/gone'));
		savePushSubscription(u.id, sub('https://push.example/flaky'));
		expect(() => savePushSubscription(u.id, sub('http://insecure.example/x'))).toThrow();

		const id = createEvent(u.id, { title: 'Pres', mode: 'fixed', startsAt: '2099-01-01T20:00' });
		sent.length = 0;
		notify(u.id, id, 'Sam wants to play Ring of fire', '/games');
		await vi.waitFor(() => expect(endpoints(u.id)).toHaveLength(2)); // notify doesn't wait for the pushes
		expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://push.example/flaky', 'https://push.example/gone', 'https://push.example/phone']);
		expect(JSON.parse(sent[0].payload)).toEqual({ title: "Who's Gaff", body: 'Sam wants to play Ring of fire', url: `/events/${id}/games` });
		// 410 means the phone unsubscribed; a temporary failure keeps the device.
		expect(endpoints(u.id)).toEqual(['https://push.example/flaky', 'https://push.example/phone']);
	});

	it('moves a device to whoever subscribed last, lets only its owner remove it, and forgets it on account deletion', () => {
		const [a, b] = [user(), user()];
		savePushSubscription(a.id, sub('https://push.example/shared'));
		savePushSubscription(b.id, sub('https://push.example/shared'));
		expect(endpoints(a.id)).toEqual([]);
		removePushSubscription(a.id, 'https://push.example/shared');
		expect(endpoints(b.id)).toEqual(['https://push.example/shared']);
		deleteAccount(b.id);
		expect(endpoints(b.id)).toEqual([]);
	});
});
