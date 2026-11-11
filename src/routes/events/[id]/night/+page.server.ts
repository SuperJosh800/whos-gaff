import { asAction, getEvent } from '#lib/server/events.ts';
import {
	addStage,
	checkInHomeSafe,
	HOME_KINDS,
	homeSafeCutoff,
	listCheckIns,
	listHomePlans,
	listMoves,
	listStages,
	nudgeNoPlan,
	postMove,
	removeStage,
	setHomePlan
} from '#lib/server/night.ts';
import { eventInput } from '#lib/server/form.ts';
import { nowLocal } from '#lib/time.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { address } = await parent();
	const event = getEvent(Number(params.id))!;
	return {
		stages: listStages(event.id),
		moves: listMoves(event.id),
		homePlans: listHomePlans(event.id),
		homeKinds: HOME_KINDS,
		checkIns: listCheckIns(event.id),
		cutoff: event.starts_at ? homeSafeCutoff(event.starts_at) : null,
		now: nowLocal(),
		// No transport API yet: link out to journey planning from the venue (WG-17).
		transitLink: address
			? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(address)}&travelmode=transit`
			: null
	};
};

export const actions: Actions = {
	addStage: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => addStage(eventId, userId, get('name'), get('starts_at'), get('place')));
	},
	removeStage: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => removeStage(eventId, userId, Number(get('stage'))));
	},
	move: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => postMove(eventId, userId, get('place')));
	},
	homePlan: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setHomePlan(eventId, userId, get('kind'), get('details')));
	},
	nudge: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => ({ nudged: nudgeNoPlan(eventId, userId) }));
	},
	homeSafe: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => checkInHomeSafe(eventId, userId));
	}
};
