import { fail, redirect } from '@sveltejs/kit';
import { resetPassword, resetTokenValid, startSession } from '#lib/server/auth.ts';
import { attemptAll, ipKey, HOUR } from '#lib/server/ratelimit.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	return { valid: resetTokenValid(params.token) };
};

export const actions: Actions = {
	default: async (event) => {
		const limited = attemptAll([{ key: ipKey('reset-use', event), limit: 20, windowMs: HOUR }]);
		if (limited) return fail(429, { error: limited });
		const form = await event.request.formData();
		const password = String(form.get('password') ?? '');
		if (password !== String(form.get('confirm') ?? '')) return fail(400, { error: 'The two passwords don’t match.' });
		const result = resetPassword(event.params.token, password);
		if ('error' in result) return fail(400, { error: result.error });
		startSession(event.cookies, result.userId);
		redirect(303, '/');
	}
};
