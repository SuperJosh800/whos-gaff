import { asAction } from '#lib/server/events.ts';
import {
	addBringItem,
	addDamage,
	listBringItems,
	listDamage,
	removeBringItem,
	toggleClaim
} from '#lib/server/gaff.ts';
import { eventInput } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const eventId = Number(params.id);
	return { items: listBringItems(eventId), damage: listDamage(eventId) };
};

export const actions: Actions = {
	addItem: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => addBringItem(eventId, userId, get('name')));
	},
	claim: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => toggleClaim(eventId, userId, Number(get('item'))));
	},
	removeItem: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => removeBringItem(eventId, userId, Number(get('item'))));
	},
	damage: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => addDamage(eventId, userId, get('culprit'), get('what')));
	}
};
