import { addPhoto, getAwards, isOver, listPhotos, voteAward } from '#lib/server/after.ts';
import { asAction, getEvent } from '#lib/server/events.ts';
import { listStages } from '#lib/server/night.ts';
import { eventInput } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const event = getEvent(Number(params.id))!;
	return {
		over: isOver(event),
		...getAwards(event.id, locals.user!.id),
		photos: listPhotos(event.id),
		stages: listStages(event.id)
	};
};

export const actions: Actions = {
	vote: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => voteAward(eventId, userId, get('award'), Number(get('nominee'))));
	},
	photo: async (e) => {
		const { userId, eventId, form } = await eventInput(e);
		return asAction(() => addPhoto(eventId, userId, form.get('photo') as File));
	}
};
