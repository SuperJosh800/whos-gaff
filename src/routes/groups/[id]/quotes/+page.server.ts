import { error, redirect } from '@sveltejs/kit';
import { asAction } from '#lib/server/events.ts';
import { isGroupMember, listGroupMembers, requireGroupMember } from '#lib/server/groups.ts';
import { addQuote, getWall, removeQuote, voteQuote } from '#lib/server/quotes.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const groupId = Number(params.id);
	if (!isGroupMember(groupId, locals.user.id)) error(404, 'Group not found');
	const group = requireGroupMember(groupId, locals.user.id);
	const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
	return { group: { id: group.id, name: group.name }, members: listGroupMembers(groupId), sort, ...getWall(groupId, locals.user.id, sort) };
};

async function input({ request, locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Log in first');
	const form = await request.formData();
	return { userId: locals.user.id, groupId: Number(params.id), get: (k: string) => String(form.get(k) ?? '') };
}

export const actions: Actions = {
	add: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => addQuote(groupId, userId, Number(get('said_by')), get('text'), get('night') ? Number(get('night')) : null));
	},
	vote: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => voteQuote(groupId, userId, Number(get('id')), get('on') === '1'));
	},
	remove: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => removeQuote(groupId, userId, Number(get('id'))));
	}
};
