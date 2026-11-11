import { fail, redirect } from '@sveltejs/kit';
import { createEvent, EventError } from '#lib/server/events.ts';
import { listGaffs } from '#lib/server/gaff.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { gaffs: listGaffs(locals.user.id) };
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
			gaffId: Number(form.get('gaff')) || null
		};
		let eventId: number;
		try {
			eventId = createEvent(locals.user.id, values);
		} catch (e) {
			if (e instanceof EventError) return fail(400, { error: e.message, values });
			throw e;
		}
		redirect(303, `/events/${eventId}`);
	}
};
