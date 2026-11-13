import { addPhoto, getAwards, getPredictions, isOver, listPhotos, voteAward } from '#lib/server/after.ts';
import { asAction, getEvent } from '#lib/server/events.ts';
import { listStages } from '#lib/server/night.ts';
import { eventInput } from '#lib/server/form.ts';
import { getHangovers, rateHead } from '#lib/server/hangover.ts';
import { listLost, postItem, removeItem, reply, sortItem, unreply } from '#lib/server/lostProperty.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const event = getEvent(Number(params.id))!;
	return {
		over: isOver(event),
		...getAwards(event.id, locals.user!.id),
		predictions: getPredictions(event.id, locals.user!.id),
		photos: listPhotos(event.id),
		stages: listStages(event.id),
		lost: listLost(event.id, locals.user!.id),
		hangover: getHangovers(event.id, locals.user!.id, event.starts_at)
	};
};

export const actions: Actions = {
	vote: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => voteAward(eventId, userId, get('award'), Number(get('nominee'))));
	},
	head: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => rateHead(eventId, userId, Number(get('head') || NaN)));
	},
	lost: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => postItem(eventId, userId, get('kind'), get('text')));
	},
	lostReply: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		const id = Number(get('item'));
		return asAction(() => (get('undo') ? unreply(eventId, userId, id) : reply(eventId, userId, id)));
	},
	lostSort: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => sortItem(eventId, userId, Number(get('item')), get('sorted') === '1'));
	},
	lostRemove: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => removeItem(eventId, userId, Number(get('item'))));
	},
	photo: async (e) => {
		const { userId, eventId, form } = await eventInput(e);
		return asAction(() => addPhoto(eventId, userId, form.get('photo') as File));
	}
};
