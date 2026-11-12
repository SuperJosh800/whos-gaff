import { fail, redirect } from '@sveltejs/kit';
import { EventError } from '#lib/server/events.ts';
import { deleteCustomGame, listOwnGames, readGame, saveCustomGame } from '#lib/server/customGames.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { games: listOwnGames(locals.user.id) };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/games');
		const input = readGame(await request.formData());
		try {
			saveCustomGame(locals.user.id, input);
		} catch (e) {
			if (e instanceof EventError) return fail(400, { error: e.message, values: input });
			throw e;
		}
		return { saved: true };
	},
	delete: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/games');
		const form = await request.formData();
		try {
			deleteCustomGame(locals.user.id, Number(form.get('id')));
		} catch (e) {
			if (e instanceof EventError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
