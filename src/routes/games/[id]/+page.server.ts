import { error, fail, redirect } from '@sveltejs/kit';
import { EventError } from '#lib/server/events.ts';
import { cardsToText, getCustomGame, readGame, saveCustomGame } from '#lib/server/customGames.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const game = getCustomGame(Number(params.id));
	if (!game || game.owner_id !== locals.user.id) error(404, 'Game not found');
	return { game: { ...game, cards: cardsToText(game.cards) } };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/login?next=/games');
		const input = readGame(await request.formData());
		try {
			saveCustomGame(locals.user.id, input, Number(params.id));
		} catch (e) {
			if (e instanceof EventError) return fail(400, { error: e.message, values: input });
			throw e;
		}
		redirect(303, '/games');
	}
};
