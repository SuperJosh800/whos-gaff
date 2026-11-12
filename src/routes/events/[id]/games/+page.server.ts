import { asAction } from '#lib/server/events.ts';
import { challengeScores, endGame, finishChallenge, getActivity, nextCard, players, startGame } from '#lib/server/activities.ts';
import { eventInput } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const eventId = Number(params.id);
	return { activity: getActivity(eventId), scores: challengeScores(eventId), players: players(eventId) };
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
		return asAction(() => finishChallenge(eventId, userId, Number(get('seen')), true));
	},
	bail: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => finishChallenge(eventId, userId, Number(get('seen')), false));
	},
	end: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => endGame(eventId, userId));
	}
};
