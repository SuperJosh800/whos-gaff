import { asAction } from '#lib/server/events.ts';
import { addExpense, getKitty, getRounds, recordRound, recordSettlement } from '#lib/server/money.ts';
import { eventInput } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const eventId = Number(params.id);
	return { rounds: getRounds(eventId), kitty: getKitty(eventId) };
};

export const actions: Actions = {
	round: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => recordRound(eventId, userId, Number(get('for')), get('skipped') === '1'));
	},
	expense: async (e) => {
		const { userId, eventId, get, form } = await eventInput(e);
		const shares = form.getAll('share').map(Number);
		return asAction(() => addExpense(eventId, userId, get('description'), get('amount'), shares));
	},
	settle: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => recordSettlement(eventId, userId, Number(get('from')), Number(get('to'))));
	}
};
