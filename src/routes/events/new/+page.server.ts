import { fail, redirect } from '@sveltejs/kit';
import { createEvent, EventError } from '#lib/server/events.ts';
import { setRepeat, type RepeatDays } from '#lib/server/repeats.ts';
import { listGaffs } from '#lib/server/gaff.ts';
import { linkPingToEvent, listGroups } from '#lib/server/groups.ts';
import { getProfile } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	// Free gaff alerts and "who's out?" pings link here with the group and details filled in.
	const q = url.searchParams;
	return {
		gaffs: listGaffs(locals.user.id),
		groups: listGroups(locals.user.id),
		payday: getProfile(locals.user.id).payday,
		prefill: { group: q.get('group') ?? '', ping: q.get('ping') ?? '', title: q.get('title') ?? '', date: q.get('date') ?? '' }
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/events/new');
		const form = await request.formData();
		const values = {
			title: String(form.get('title') ?? ''),
			details: String(form.get('details') ?? ''),
			location: String(form.get('location') ?? ''),
			mode: String(form.get('mode') ?? 'fixed') as 'fixed' | 'poll',
			startsAt: String(form.get('starts_at') ?? ''),
			options: form.getAll('option').map(String),
			voteDeadline: String(form.get('vote_deadline') ?? ''),
			gaffId: Number(form.get('gaff')) || null,
			groupId: Number(form.get('group')) || null,
			pingId: Number(form.get('ping')) || null,
			repeat: String(form.get('repeat') ?? '')
		};
		let eventId: number;
		try {
			eventId = createEvent(locals.user.id, values);
			if (values.groupId && values.pingId) linkPingToEvent(values.groupId, values.pingId, eventId);
			if (values.mode === 'fixed' && values.repeat) setRepeat(eventId, locals.user.id, Number(values.repeat) as RepeatDays);
		} catch (e) {
			if (e instanceof EventError) return fail(400, { error: e.message, values });
			throw e;
		}
		redirect(303, `/events/${eventId}`);
	}
};
