import { asAction } from '#lib/server/events.ts';
import { beginGame, challengeScores, drawCard, endGame, finishChallenge, getActivity, joinGame, leaveGame, makeMove, nextCard, openGame } from '#lib/server/activities.ts';
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
	open: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => openGame(eventId, userId, get('game'), get('soft') === 'on'));
	},
	join: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => joinGame(eventId, userId));
	},
	leave: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => leaveGame(eventId, userId));
	},
	begin: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => beginGame(eventId, userId));
	},
	draw: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => drawCard(eventId, userId, Number(get('seen'))));
	},
	move: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		const seen = Number(get('seen'));
		const type = get('type');
		return asAction(() =>
			makeMove(
				eventId,
				userId,
				seen,
				type === 'pass' ? { type } : type === 'answer' ? { type, who: Number(get('who')) } : type === 'reveal' ? { type, drink: get('drink') === '1' } : { type: 'guess', guess: get('guess') }
			)
		);
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
