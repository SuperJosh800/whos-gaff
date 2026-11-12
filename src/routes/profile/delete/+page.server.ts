import { fail, redirect } from '@sveltejs/kit';
import { deleteAccount } from '#lib/server/account.ts';
import { checkPassword, SESSION_COOKIE } from '#lib/server/auth.ts';
import { attemptAll, MINUTE } from '#lib/server/ratelimit.ts';
import { db } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login?next=/profile/delete');
	const hosting = db
		.prepare(`SELECT COUNT(*) AS n FROM events WHERE host_id = ?`)
		.get(locals.user.id) as { n: number };
	return { hosting: hosting.n };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');
		const limited = attemptAll([{ key: `delete:user:${locals.user.id}`, limit: 5, windowMs: 15 * MINUTE }]);
		if (limited) return fail(429, { error: limited });
		const form = await request.formData();
		if (!checkPassword(locals.user.id, String(form.get('password') ?? ''))) {
			return fail(400, { error: 'That password is wrong.' });
		}
		if (form.get('confirm') !== 'DELETE') return fail(400, { error: 'Type DELETE in capitals to confirm.' });
		deleteAccount(locals.user.id);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/?deleted=1');
	}
};
