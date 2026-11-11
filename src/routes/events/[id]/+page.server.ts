import { error } from '@sveltejs/kit';
import {
	addOption,
	asAction,
	getEvent,
	inviteByEmail,
	listMessages,
	listOptions,
	listPendingInvites,
	pickWinner,
	postMessage,
	removeOption,
	setPlaylist,
	setRsvp,
	setVote,
	suggestOption,
	updateOption,
	type Rsvp
} from '#lib/server/events.ts';
import { attachGaff, listGaffs } from '#lib/server/gaff.ts';
import { eventInput } from '#lib/server/form.ts';
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
		pendingInvites: isHost ? listPendingInvites(event.id) : [],
		messages: listMessages(event.id),
		inviteLink: isHost ? `${url.origin}/invite/${event.invite_token}` : null,
		myGaffs: isHost ? listGaffs(userId) : []
	};
};

export const actions: Actions = {
	vote: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => setVote(eventId, userId, Number(get('option')), get('available') === '1'));
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
		return asAction(() => setRsvp(eventId, userId, get('response') as Rsvp));
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
	settings: async (e) => {
		const { userId, eventId, get } = await eventInput(e);
		return asAction(() => {
			setPlaylist(eventId, userId, get('playlist_url'));
			attachGaff(eventId, userId, Number(get('gaff')) || null);
			return { saved: true };
		});
	}
};
