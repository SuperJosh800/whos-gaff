import { error, redirect } from '@sveltejs/kit';
import { joinGroupByToken } from '#lib/server/groups.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/signup?next=${encodeURIComponent(url.pathname)}`);
	const groupId = joinGroupByToken(params.token, locals.user.id);
	if (!groupId) error(404, 'This group invite link is not valid.');
	redirect(303, `/groups/${groupId}`);
};
