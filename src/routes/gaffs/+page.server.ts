import { fail, redirect } from '@sveltejs/kit';
import { EventError } from '#lib/server/events.ts';
import { deleteGaff, GAFF_FIELDS, listGaffs, saveGaff, type GaffInput } from '#lib/server/gaff.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { gaffs: listGaffs(locals.user.id) };
};

async function run(locals: App.Locals, fn: (userId: number) => unknown) {
	if (!locals.user) redirect(303, '/login?next=/gaffs');
	try {
		await fn(locals.user.id);
	} catch (e) {
		if (e instanceof EventError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		const input = Object.fromEntries(GAFF_FIELDS.map((f) => [f, String(form.get(f) ?? '')])) as GaffInput;
		return run(locals, (userId) => saveGaff(userId, input, Number(form.get('id')) || undefined));
	},
	delete: async ({ request, locals }) => {
		const form = await request.formData();
		return run(locals, (userId) => deleteGaff(userId, Number(form.get('id'))));
	}
};
