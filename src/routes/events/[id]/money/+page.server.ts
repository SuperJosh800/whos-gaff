import { asAction } from '#lib/server/events.ts';
import {
	addExpense,
	getKitty,
	getRounds,
	goingPeople,
	leaveRoundGroup,
	listDrivers,
	recordRound,
	recordSettlement,
	saveRoundGroup,
	setDriving
} from '#lib/server/money.ts';
import { eventInput } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const eventId = Number(params.id);
	return { rounds: getRounds(eventId), kitty: getKitty(eventId), going: goingPeople(eventId), drivers: listDrivers(eventId) };
};

export const actions: Actions = {
	round: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		const group = get('group') ? Number(get('group')) : null;
		return asAction(() => recordRound(eventId, userId, group, Number(get('for')), get('skipped') === '1'));
	},
	driving: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setDriving(eventId, userId, Number(get('who')), get('driving') === '1'));
	},
	roundGroup: async (e) => {
		const { userId, eventId, get, form } = await eventInput(e);
		const group = get('group') ? Number(get('group')) : null;
		return asAction(() => saveRoundGroup(eventId, userId, group, form.getAll('member').map(Number)));
	},
	leaveRound: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => leaveRoundGroup(eventId, userId, Number(get('group'))));
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
