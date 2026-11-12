import { asAction } from '#lib/server/events.ts';
import { challengeScores, endGame, finishChallenge, getActivity, nextCard, startGame } from '#lib/server/activities.ts';
import { listGamesForEvent } from '#lib/server/customGames.ts';
import { eventInput } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const eventId = Number(params.id);
	return {
		// Each phone gets the card as that person should see it: secret missions only reach the player.
		activity: getActivity(eventId, locals.user!.id),
		scores: challengeScores(eventId),
		customGames: listGamesForEvent(eventId).map(({ id, name, emoji, setting, owner, cards, scored }) => ({
			id,
			name,
			emoji,
			setting,
			owner,
			scored,
			count: cards.length,
			secrets: cards.filter((c) => c.secret).length
		}))
	};
};

export const actions: Actions = {
	start: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => startGame(eventId, userId, get('game'), get('soft') === 'on'));
	},
	next: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => nextCard(eventId, userId, Number(get('seen'))));
	},
	done: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => finishChallenge(eventId, userId, Number(get('seen')), 'done'));
	},
	bail: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => finishChallenge(eventId, userId, Number(get('seen')), 'bailed'));
	},
	caught: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => finishChallenge(eventId, userId, Number(get('seen')), 'caught'));
	},
	end: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => endGame(eventId, userId));
	}
};
