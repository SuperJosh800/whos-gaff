import { error, redirect } from '@sveltejs/kit';
import {
	addOption,
	asAction,
	getEvent,
	inviteByEmail,
	isMember,
	listAttendees,
	listOptions,
	listPendingInvites,
	pickWinner,
	removeOption,
	setRsvp,
	setVote,
	suggestOption,
	updateOption,
	votingOpen,
	type Rsvp
} from '#lib/server/events.ts';
import { nowLocal } from '#lib/time.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = ({ params, locals, url, depends }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const eventId = Number(params.id);
	const event = getEvent(eventId);
	if (!event || !isMember(eventId, locals.user.id)) error(404, 'Event not found');
	depends(`event:${eventId}`);

	const isHost = event.host_id === locals.user.id;
	return {
		event,
		isHost,
		now: nowLocal(),
		votingOpen: votingOpen(event),
		options: event.mode === 'poll' ? listOptions(eventId, locals.user.id) : [],
		attendees: listAttendees(eventId),
		pendingInvites: isHost ? listPendingInvites(eventId) : [],
		inviteLink: isHost ? `${url.origin}/invite/${event.invite_token}` : null
	};
};

/** Reads the form and the logged-in user for an action on this event. */
async function input({ request, locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Log in first');
	const form = await request.formData();
	const get = (name: string) => String(form.get(name) ?? '');
	return { userId: locals.user.id, eventId: Number(params.id), get };
}

export const actions: Actions = {
	vote: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => setVote(eventId, userId, Number(get('option')), get('available') === '1'));
	},
	suggest: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => suggestOption(eventId, userId, get('starts_at')));
	},
	addOption: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => addOption(eventId, userId, get('starts_at')));
	},
	updateOption: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => updateOption(eventId, userId, Number(get('option')), get('starts_at')));
	},
	removeOption: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => removeOption(eventId, userId, Number(get('option'))));
	},
	pick: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => pickWinner(eventId, userId, Number(get('option')), e.url.origin));
	},
	rsvp: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(() => setRsvp(eventId, userId, get('response') as Rsvp));
	},
	invite: async (e) => {
		const { userId, eventId, get } = await input(e);
		return asAction(async () => ({
			invited: await inviteByEmail(eventId, userId, get('emails'), e.url.origin)
		}));
	}
};
