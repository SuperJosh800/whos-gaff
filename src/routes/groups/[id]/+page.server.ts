import { error, redirect } from '@sveltejs/kit';
import { asAction } from '#lib/server/events.ts';
import {
	answerPing,
	hostingLeaderboard,
	isGroupMember,
	listFreeGaffs,
	listGroupMembers,
	listPings,
	markFreeGaff,
	nudgeToHost,
	requireGroupMember,
	sendPing
} from '#lib/server/groups.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const groupId = Number(params.id);
	if (!isGroupMember(groupId, locals.user.id)) error(404, 'Group not found');
	const group = requireGroupMember(groupId, locals.user.id);
	return {
		group: { id: group.id, name: group.name },
		inviteLink: `${url.origin}/groups/join/${group.invite_token}`,
		members: listGroupMembers(groupId),
		freeGaffs: listFreeGaffs(groupId),
		pings: listPings(groupId),
		leaderboard: hostingLeaderboard(groupId)
	};
};

async function input({ request, locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Log in first');
	const form = await request.formData();
	return { userId: locals.user.id, groupId: Number(params.id), get: (k: string) => String(form.get(k) ?? '') };
}

export const actions: Actions = {
	freeGaff: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => markFreeGaff(groupId, userId, get('place'), get('from'), get('to')));
	},
	ping: async (e) => {
		const { userId, groupId } = await input(e);
		return asAction(() => {
			sendPing(groupId, userId);
		});
	},
	answer: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => answerPing(groupId, userId, Number(get('ping')), get('answer') as 'yes' | 'no'));
	},
	nudge: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => {
			nudgeToHost(groupId, userId, Number(get('user')));
			return { nudged: Number(get('user')) };
		});
	}
};
