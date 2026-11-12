import { error, json } from '@sveltejs/kit';
import { removePushSubscription, savePushSubscription, type Subscription } from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

// Turns push notifications on (POST the browser's subscription) or off (DELETE its endpoint) for this device.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Log in first');
	try {
		savePushSubscription(locals.user.id, (await request.json()) as Subscription);
	} catch {
		error(400, 'Bad subscription');
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Log in first');
	const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
	if (endpoint) removePushSubscription(locals.user.id, endpoint);
	return json({ ok: true });
};
