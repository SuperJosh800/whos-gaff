import { fail, redirect } from '@sveltejs/kit';
import { safeNext, signUp, startSession } from '#lib/server/auth.ts';
import { claimEmailInvites } from '#lib/server/events.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const name = String(form.get('name') ?? '');
		const result = signUp(email, name, String(form.get('password') ?? ''));
		if ('error' in result) return fail(400, { error: result.error, email, name });
		claimEmailInvites(result.id, result.email);
		startSession(cookies, result.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
