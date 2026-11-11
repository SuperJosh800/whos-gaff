import { error, redirect } from '@sveltejs/kit';
import { getInvitePreview, joinByToken } from '#lib/server/events.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	if (locals.user) {
		const eventId = joinByToken(params.token, locals.user.id);
		if (!eventId) error(404, 'This invite link is not valid.');
		redirect(303, `/events/${eventId}`);
	}
	const preview = getInvitePreview(params.token);
	if (!preview) error(404, 'This invite link is not valid.');
	return { preview };
};
