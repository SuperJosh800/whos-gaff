import { error, redirect } from '@sveltejs/kit';
import { asAction } from '#lib/server/events.ts';
import { isGroupMember, listGroupMembers, requireGroupMember } from '#lib/server/groups.ts';
import { addQuestion, answerQuestion, deleteQuestion, getQuiz } from '#lib/server/quiz.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const groupId = Number(params.id);
	if (!isGroupMember(groupId, locals.user.id)) error(404, 'Group not found');
	const group = requireGroupMember(groupId, locals.user.id);
	return { group: { id: group.id, name: group.name }, members: listGroupMembers(groupId), quiz: getQuiz(groupId, locals.user.id) };
};

async function input({ request, locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Log in first');
	const form = await request.formData();
	return { userId: locals.user.id, groupId: Number(params.id), form, get: (k: string) => String(form.get(k) ?? '') };
}

export const actions: Actions = {
	add: async (e) => {
		const { userId, groupId, get, form } = await input(e);
		return asAction(() => addQuestion(groupId, userId, Number(get('about')), get('question'), get('answer'), form.getAll('wrong').map(String)));
	},
	answer: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => ({ result: answerQuestion(groupId, userId, Number(get('id')), get('choice')) }));
	},
	delete: async (e) => {
		const { userId, groupId, get } = await input(e);
		return asAction(() => deleteQuestion(groupId, userId, Number(get('id'))));
	}
};
