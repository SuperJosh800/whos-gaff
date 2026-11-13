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
	nextStageTime,
	nudgeNoPlan,
	postMove,
	removeStage,
	setHomePlan,
	taxiShares
} from '#lib/server/night.ts';
import { eventInput } from '#lib/server/form.ts';
import { canSeeAddress } from '#lib/server/gaff.ts';
import { getDrinks, logDrink, undoDrink, WATER_EVERY } from '#lib/server/drinks.ts';
import { askForHelp, helpWindow, listHelp, onMyWay, readSpot, resolveHelp } from '#lib/server/help.ts';
import { callOut, completeMission, getMissions, swapMission, takeMission } from '#lib/server/missions.ts';
import { nowLocal } from '#lib/time.ts';
import { AWARDS, getPredictions, savePredictions } from '#lib/server/after.ts';
import { dealCard, getBingo, setMoment } from '#lib/server/bingo.ts';
import { getBuddies, pairUp, pingBuddy } from '#lib/server/buddies.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { address } = await parent();
	const event = getEvent(Number(params.id))!;
	// Where people are heading home could give away the gaff, so like the address it's only for people going.
	const going = canSeeAddress(event, locals.user!.id);
	const homePlans = listHomePlans(event.id).map((p) => (going ? p : { ...p, area: null, details: null }));
	return {
		stages: listStages(event.id),
		nextStageAt: nextStageTime(event.id),
		moves: listMoves(event.id),
		homePlans,
		taxiShares: taxiShares(homePlans),
		homeKinds: HOME_KINDS,
		checkIns: listCheckIns(event.id),
		cutoff: event.starts_at ? homeSafeCutoff(event.starts_at) : null,
		now: nowLocal(),
		missions: getMissions(event.id, locals.user!.id),
		predictions: getPredictions(event.id, locals.user!.id),
		awards: AWARDS,
		bingo: getBingo(event.id, locals.user!.id),
		buddies: getBuddies(event.id, locals.user!.id),
		help: listHelp(event.id, locals.user!.id),
		helpWindow: helpWindow(event),
		drinks: getDrinks(event.id, locals.user!.id),
		waterEvery: WATER_EVERY,
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
		return asAction(() => setHomePlan(eventId, userId, get('kind'), get('details'), get('area')));
	},
	nudge: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => ({ nudged: nudgeNoPlan(eventId, userId) }));
	},
	comeGetMe: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => ({ helpSent: askForHelp(eventId, userId, readSpot(get('lat'), get('lng'), get('accuracy')), get('note')) }));
	},
	onMyWay: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => onMyWay(eventId, userId, Number(get('request')), get('coming') !== '0'));
	},
	imOk: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => resolveHelp(eventId, userId));
	},
	drink: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => logDrink(eventId, userId, get('kind'), get('after')));
	},
	undoDrink: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => undoDrink(eventId, userId, get('last')));
	},
	homeSafe: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => checkInHomeSafe(eventId, userId));
	},
	takeMission: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => takeMission(eventId, userId));
	},
	swapMission: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => swapMission(eventId, userId));
	},
	missionDone: async (e) => {
		const { userId, eventId, form } = await eventInput(e);
		return asAction(() => completeMission(eventId, userId, form.get('photo') as File | null));
	},
	predict: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => {
			savePredictions(eventId, userId, Object.fromEntries(Object.keys(AWARDS).map((a) => [a, get(a)])));
			return { predicted: true };
		});
	},
	pairUp: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => pairUp(eventId, userId, get('reshuffle') === '1'));
	},
	pingBuddy: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => ({ pinged: pingBuddy(eventId, userId) }));
	},
	bingoCard: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => dealCard(eventId, userId));
	},
	bingoMark: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setMoment(eventId, userId, get('moment'), get('mark') === '1'));
	},
	callOut: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => ({ callOut: callOut(eventId, userId, Number(get('suspect'))) }));
	}
};
