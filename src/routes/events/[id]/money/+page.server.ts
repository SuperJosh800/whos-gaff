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
import { cancelTakeaway, getTakeaway, placeOrder, removeItem, setItem, setOrderer, startTakeaway } from '#lib/server/takeaway.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const eventId = Number(params.id);
	return { rounds: getRounds(eventId), kitty: getKitty(eventId), going: goingPeople(eventId), drivers: listDrivers(eventId), takeaway: getTakeaway(eventId, locals.user!.id) };
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
	startTakeaway: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => startTakeaway(eventId, userId, get('place')));
	},
	takeawayItem: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		const id = Number(get('takeaway'));
		return asAction(() => (get('takeOut') ? removeItem(eventId, userId, id) : setItem(eventId, userId, id, get('item'), get('price'))));
	},
	takeawayOrderer: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setOrderer(eventId, userId, Number(get('takeaway')), get('ordering') === '1'));
	},
	placeOrder: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => placeOrder(eventId, userId, Number(get('takeaway')), get('total')));
	},
	cancelTakeaway: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => cancelTakeaway(eventId, userId, Number(get('takeaway'))));
	},
	settle: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => recordSettlement(eventId, userId, Number(get('from')), Number(get('to'))));
	}
};
