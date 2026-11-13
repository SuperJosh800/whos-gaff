import { error, redirect } from '@sveltejs/kit';
import { asAction } from '#lib/server/events.ts';
import {
	answerPing,
	deletePing,
	hostingLeaderboard,
	isGroupMember,
	listFreeGaffs,
	listGroupMembers,
	listPings,
	markFreeGaff,
	nudgeToHost,
	requireGroupMember,
	seasonLeaderboard,
	sendPing
} from '#lib/server/groups.ts';
import { getProfile } from '#lib/server/auth.ts';
import { reviewYears } from '#lib/server/yearReview.ts';
import { questionsToAnswer } from '#lib/server/quiz.ts';
import { topQuote } from '#lib/server/quotes.ts';
import { upcomingBirthdays } from '#lib/server/birthdays.ts';
import { nowLocal } from '#lib/time.ts';
import type { Plan } from '#lib/plans.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const groupId = Number(params.id);
	if (!isGroupMember(groupId, locals.user.id)) error(404, 'Group not found');
	const group = requireGroupMember(groupId, locals.user.id);
	// Seasons are calendar years; this year's shows even before its first night.
	const thisYear = Number(nowLocal().slice(0, 4));
	const seasons = [...new Set([thisYear, ...reviewYears(groupId)])].sort((a, b) => b - a);
	const asked = Number(url.searchParams.get('season'));
	const season = seasons.includes(asked) ? asked : thisYear;
	return {
		group: { id: group.id, name: group.name, created_by: group.created_by },
		inviteLink: `${url.origin}/groups/join/${group.invite_token}`,
		members: listGroupMembers(groupId),
		freeGaffs: listFreeGaffs(groupId),
		pings: listPings(groupId),
		leaderboard: hostingLeaderboard(groupId),
		seasons,
		season,
		seasonBoard: seasonLeaderboard(groupId, season),
		quizLeft: questionsToAnswer(groupId, locals.user.id),
		topQuote: topQuote(groupId),
		birthdays: upcomingBirthdays(groupId),
		payday: getProfile(locals.user.id).payday,
		today: nowLocal().slice(0, 10)
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
		const { userId, groupId, get } = await input(e);
		return asAction(() => {
			sendPing(groupId, userId, get('plan') as Plan, get('date'));
		});
	},
	deletePing: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => deletePing(groupId, userId, Number(get('ping'))));
	},
	answer: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => answerPing(groupId, userId, Number(get('ping')), (get('answer') || null) as 'yes' | 'no' | null));
	},
	nudge: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => {
			nudgeToHost(groupId, userId, Number(get('user')));
			return { nudged: Number(get('user')) };
		});
	}
};
