import type { Handle } from '@sveltejs/kit/hooks';
import { getSessionUser, hashToken, purgeExpired, SESSION_COOKIE } from '#lib/server/auth.ts';
import { makeRepeats } from '#lib/server/repeats.ts';
import { purgeDrinks } from '#lib/server/drinks.ts';
import { purgeHelp } from '#lib/server/help.ts';
import { fireDueDrops } from '#lib/server/photoDrops.ts';
import { closeDueVotes } from '#lib/server/moveVotes.ts';
import { nudgeHangovers } from '#lib/server/hangover.ts';
import { remindBirthdays } from '#lib/server/birthdays.ts';

// Clear out expired sessions and reset links, and week-old drink taps and Come get me requests, once an hour.
const purge = () => {
	purgeExpired();
	purgeDrinks();
	purgeHelp();
};
purge();
setInterval(purge, 60 * 60 * 1000).unref?.();

// Make the next night for repeating events once they've started, and send the morning-after "How's the
// head?" nudges and birthday reminders. Checked every 10 minutes.
const slow = () => {
	for (const job of [makeRepeats, nudgeHangovers, remindBirthdays]) {
		try {
			job();
		} catch (e) {
			console.error(`[${job.name}] failed`, e);
		}
	}
};
slow();
setInterval(slow, 10 * 60 * 1000).unref?.();

// Tell everyone when a photo drop goes off and when a stay-or-move-on vote closes. Checked every
// 5 seconds, as they only last a minute or two.
const timed = () => {
	for (const job of [fireDueDrops, closeDueVotes]) {
		try {
			job();
		} catch (e) {
			console.error(`[${job.name}] failed`, e);
		}
	}
};
timed();
setInterval(timed, 5 * 1000).unref?.();

// The Content-Security-Policy is set by SvelteKit (kit.csp in vite.config.ts) so it can hash its own inline scripts.
const SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	// Invite links carry a token in the URL; never send the path to other sites.
	'referrer-policy': 'strict-origin-when-cross-origin',
	// Location is only asked for when someone taps Come get me.
	'permissions-policy': 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()',
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
