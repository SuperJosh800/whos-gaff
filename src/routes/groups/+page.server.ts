import { fail, redirect } from '@sveltejs/kit';
import { EventError } from '#lib/server/events.ts';
import { createGroup, listGroups } from '#lib/server/groups.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { groups: listGroups(locals.user.id) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/groups');
		const name = String((await request.formData()).get('name') ?? '');
		let id: number;
		try {
			id = createGroup(locals.user.id, name);
		} catch (e) {
			if (e instanceof EventError) return fail(400, { error: e.message });
			throw e;
		}
		redirect(303, `/groups/${id}`);
	}
};
