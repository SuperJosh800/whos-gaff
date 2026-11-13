import { error, redirect } from '@sveltejs/kit';
import { isGroupMember, requireGroupMember } from '#lib/server/groups.ts';
import { reviewYears, yearReview } from '#lib/server/yearReview.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const groupId = Number(params.id);
	if (!isGroupMember(groupId, locals.user.id)) error(404, 'Group not found');
	const group = requireGroupMember(groupId, locals.user.id);
	const years = reviewYears(groupId);
	const asked = Number(url.searchParams.get('y'));
	const year = years.includes(asked) ? asked : (years[0] ?? new Date().getFullYear());
	return { group: { id: group.id, name: group.name }, years, review: yearReview(groupId, year) };
};
