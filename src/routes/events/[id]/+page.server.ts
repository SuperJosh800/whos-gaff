import { error } from '@sveltejs/kit';
import {
	addOption,
	asAction,
	getEvent,
	inviteByEmail,
	listMessages,
	listOptions,
	listVotes,
	listPendingInvites,
	pickWinner,
	postMessage,
	removeOption,
	setPlaylist,
	checkGuestLimit,
	setGuestLimit,
	setRsvp,
	listWaitlist,
	setVote,
	suggestOption,
	updateOption,
	type Rsvp
} from '#lib/server/events.ts';
import { attachGaff, listGaffs } from '#lib/server/gaff.ts';
import { eventInput } from '#lib/server/form.ts';
import { getProfile } from '#lib/server/auth.ts';
import { getTickets, nudgeTickets, setHaveTicket, setTickets } from '#lib/server/tickets.ts';
import { repeatedInto, setRepeat } from '#lib/server/repeats.ts';
import { listVenues, lockVenue, removeVenue, reopenVenue, suggestVenue, voteVenue } from '#lib/server/venues.ts';
import { listThemes, lockTheme, removeTheme, reopenTheme, suggestTheme, voteTheme } from '#lib/server/themes.ts';
import type { Actions, PageServerLoad } from './$types';

// The layout load has already checked that the user is logged in and invited.
export const load: PageServerLoad = async ({ params, locals, url, parent }) => {
	await parent();
	const userId = locals.user!.id;
	const event = getEvent(Number(params.id));
	if (!event) error(404, 'Event not found');
	const isHost = event.host_id === userId;
	return {
		options: event.mode === 'poll' ? listOptions(event.id, userId) : [],
		votes: event.mode === 'poll' && !event.starts_at ? listVotes(event.id) : [],
		pendingInvites: isHost ? listPendingInvites(event.id) : [],
		messages: listMessages(event.id),
		inviteLink: isHost ? `${url.origin}/invite/${event.invite_token}` : null,
		myGaffs: isHost ? listGaffs(userId) : [],
		repeatedInto: isHost ? repeatedInto(event.id) : null,
		waitlist: event.starts_at ? listWaitlist(event.id) : [],
		payday: getProfile(userId).payday,
		tickets: event.starts_at ? getTickets(event.id, userId) : null,
		themes: listThemes(event.id, userId),
		venues: listVenues(event.id, userId)
	};
};

export const actions: Actions = {
	vote: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setVote(eventId, userId, Number(get('option')), get('available') === '' ? null : get('available') === '1'));
	},
	suggest: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => suggestOption(eventId, userId, get('starts_at')));
	},
	addOption: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => addOption(eventId, userId, get('starts_at')));
	},
	updateOption: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => updateOption(eventId, userId, Number(get('option')), get('starts_at')));
	},
	removeOption: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => removeOption(eventId, userId, Number(get('option'))));
	},
	pick: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => pickWinner(eventId, userId, Number(get('option')), e.url.origin));
	},
	rsvp: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => {
			setRsvp(eventId, userId, get('response') as Rsvp);
		});
	},
	message: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => postMessage(eventId, userId, get('body')));
	},
	invite: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(async () => ({
			invited: await inviteByEmail(eventId, userId, get('emails'), e.url.origin)
		}));
	},
	tickets: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setTickets(eventId, userId, { url: get('url'), price: get('price'), note: get('note') }));
	},
	ticket: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setHaveTicket(eventId, userId, get('have') === '1'));
	},
	nudgeTickets: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => ({ nudged: nudgeTickets(eventId, userId) }));
	},
	suggestTheme: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => suggestTheme(eventId, userId, get('label')));
	},
	voteTheme: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => voteTheme(eventId, userId, get('option') ? Number(get('option')) : null));
	},
	removeTheme: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => removeTheme(eventId, userId, Number(get('option'))));
	},
	lockTheme: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => lockTheme(eventId, userId, Number(get('option'))));
	},
	reopenTheme: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => reopenTheme(eventId, userId));
	},
	suggestVenue: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => suggestVenue(eventId, userId, get('name'), get('link')));
	},
	voteVenue: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => voteVenue(eventId, userId, Number(get('option')), get('up') === '1'));
	},
	removeVenue: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => removeVenue(eventId, userId, Number(get('option'))));
	},
	lockVenue: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => lockVenue(eventId, userId, Number(get('option'))));
	},
	reopenVenue: async (e) => {
		const { userId, eventId } = await eventInput(e);
		return asAction(() => reopenVenue(eventId, userId));
	},
	settings: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => {
			// The repeat goes first: it's the one most likely to be refused, and nothing is saved if it is.
			const limit = get('guest_limit') ? Number(get('guest_limit')) : null;
			checkGuestLimit(limit);
			setRepeat(eventId, userId, get('repeat') ? Number(get('repeat')) : null);
			setGuestLimit(eventId, userId, limit);
			setPlaylist(eventId, userId, get('playlist_url'));
			attachGaff(eventId, userId, Number(get('gaff')) || null);
			return { saved: true };
		});
	}
};
