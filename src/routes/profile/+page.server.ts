import { fail, redirect } from '@sveltejs/kit';
import { changePassword, deleteOtherSessions, getProfile, SESSION_COOKIE, updateProfile } from '#lib/server/auth.ts';
import { hallOfFame } from '#lib/server/after.ts';
import { attemptAll, MINUTE } from '#lib/server/ratelimit.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { profile: getProfile(locals.user.id), hallOfFame: hallOfFame(locals.user.id) };
};

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/profile');
		const form = await request.formData();
		const result = updateProfile(locals.user.id, {
			name: String(form.get('name') ?? ''),
			paymentLink: String(form.get('payment_link') ?? ''),
			payday: String(form.get('payday') ?? '')
		});
		if (result) return fail(400, { section: 'profile', error: result });
		return { section: 'profile', saved: true };
	},
	password: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(303, '/login?next=/profile');
		const limited = attemptAll([{ key: `password:user:${locals.user.id}`, limit: 10, windowMs: 15 * MINUTE }]);
		if (limited) return fail(429, { section: 'password', error: limited });
		const form = await request.formData();
		const next = String(form.get('new') ?? '');
		if (next !== String(form.get('confirm') ?? '')) {
			return fail(400, { section: 'password', error: 'The two new passwords don’t match.' });
		}
		const result = changePassword(locals.user.id, String(form.get('current') ?? ''), next, cookies.get(SESSION_COOKIE)!);
		if (result) return fail(400, { section: 'password', error: result });
		return { section: 'password', saved: true };
	},
	logoutOthers: async ({ locals, cookies }) => {
		if (!locals.user) redirect(303, '/login?next=/profile');
		deleteOtherSessions(locals.user.id, cookies.get(SESSION_COOKIE)!);
		return { section: 'sessions', saved: true };
	}
};
