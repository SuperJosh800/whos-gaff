import { fail, redirect } from '@sveltejs/kit';
import { logIn, safeNext, startSession } from '#lib/server/auth.ts';
import { claimEmailInvites } from '#lib/server/events.ts';
import { attemptAll, ipKey, clearAttempts, HOUR, MINUTE } from '#lib/server/ratelimit.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies, url } = event;
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		// Slow down password guessing: per account, and per IP address across accounts.
		const emailKey = `login:email:${email}`;
		const limited = attemptAll([
			{ key: emailKey, limit: 10, windowMs: 15 * MINUTE },
			{ key: ipKey('login', event), limit: 50, windowMs: HOUR }
		]);
		if (limited) return fail(429, { error: limited, email });
		const user = logIn(email, String(form.get('password') ?? ''));
		if (!user) return fail(400, { error: 'Wrong email or password.', email });
		clearAttempts(emailKey);
		claimEmailInvites(user.id, user.email);
		startSession(cookies, user.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
