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
		// Slow down password guessing. The tight limit is per account from one address, so someone
		// else failing on purpose can't lock the owner out; the loose per-account limit caps guessing
		// spread across many addresses, and the per-address limit caps guessing across accounts.
		const ip = ipKey('login', event);
		const emailKey = ip ? `${ip}:email:${email}` : `login:email:${email}`;
		const limited = attemptAll([
			{ key: emailKey, limit: 10, windowMs: 15 * MINUTE },
			{ key: `login:email-any:${email}`, limit: 100, windowMs: HOUR },
			{ key: ip, limit: 50, windowMs: HOUR }
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
