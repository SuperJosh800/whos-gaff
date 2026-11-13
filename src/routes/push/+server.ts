import { error, json } from '@sveltejs/kit';
import { pushIsOn, removePushSubscription, savePushSubscription } from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

// Push notifications for this device and login: GET whether they're on, POST the browser's subscription
// to turn them on, DELETE its endpoint to turn them off.
export const GET: RequestHandler = ({ url, locals }) => {
	if (!locals.user || !locals.sessionId) error(401, 'Log in first');
	return json({ on: pushIsOn(locals.sessionId, url.searchParams.get('endpoint') ?? '') });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.sessionId) error(401, 'Log in first');
	try {
		savePushSubscription(locals.user.id, locals.sessionId, await request.json());
	} catch {
		error(400, 'Bad subscription');
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Log in first');
	const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
	if (typeof endpoint === 'string') removePushSubscription(locals.user.id, endpoint);
	return json({ ok: true });
};
