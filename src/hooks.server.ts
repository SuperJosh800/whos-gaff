import type { Handle } from '@sveltejs/kit/hooks';
import { getSessionUser, hashToken, purgeExpired, SESSION_COOKIE } from '#lib/server/auth.ts';
import { makeRepeats } from '#lib/server/repeats.ts';
import { purgeDrinks } from '#lib/server/drinks.ts';

// Clear out expired sessions and reset links, and week-old drink taps, once an hour.
const purge = () => {
	purgeExpired();
	purgeDrinks();
};
purge();
setInterval(purge, 60 * 60 * 1000).unref?.();

// Make the next night for repeating events once they've started. Checked every 10 minutes.
const repeats = () => {
	try {
		makeRepeats();
	} catch (e) {
		console.error('[repeats] failed', e);
	}
};
repeats();
setInterval(repeats, 10 * 60 * 1000).unref?.();

// The Content-Security-Policy is set by SvelteKit (kit.csp in vite.config.ts) so it can hash its own inline scripts.
const SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	// Invite links carry a token in the URL; never send the path to other sites.
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin'
};

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? getSessionUser(token) : null;
	event.locals.sessionId = event.locals.user && token ? hashToken(token) : null;
	if (token && !event.locals.user) event.cookies.delete(SESSION_COOKIE, { path: '/' });

	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	if (event.url.protocol === 'https:') {
		response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
	}
	// Pages for logged-in people hold private details: don't let shared caches keep them.
	if (event.locals.user && !response.headers.has('cache-control')) {
		response.headers.set('cache-control', 'private, no-store');
	}
	return response;
};
