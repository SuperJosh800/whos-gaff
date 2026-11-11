import type { Handle } from '@sveltejs/kit/hooks';
import { getSessionUser, SESSION_COOKIE } from '#lib/server/auth.ts';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? getSessionUser(token) : null;
	if (token && !event.locals.user) event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return resolve(event);
};
