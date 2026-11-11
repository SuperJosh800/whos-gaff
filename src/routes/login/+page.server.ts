import { fail, redirect } from '@sveltejs/kit';
import { logIn, safeNext, startSession } from '#lib/server/auth.ts';
import { claimEmailInvites } from '#lib/server/events.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const user = logIn(email, String(form.get('password') ?? ''));
		if (!user) return fail(400, { error: 'Wrong email or password.', email });
		claimEmailInvites(user.id, user.email);
		startSession(cookies, user.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
