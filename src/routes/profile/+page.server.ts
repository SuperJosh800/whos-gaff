import { fail, redirect } from '@sveltejs/kit';
import { getProfile, updateProfile } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { profile: getProfile(locals.user.id) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/profile');
		const form = await request.formData();
		const result = updateProfile(locals.user.id, {
			name: String(form.get('name') ?? ''),
			paymentLink: String(form.get('payment_link') ?? ''),
			payday: String(form.get('payday') ?? '')
		});
		if (result) return fail(400, { error: result });
		return { saved: true };
	}
};
