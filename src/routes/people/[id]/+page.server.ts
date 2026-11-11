import { error, redirect } from '@sveltejs/kit';
import { hallOfFame } from '#lib/server/after.ts';
import { getProfile } from '#lib/server/auth.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const profile = getProfile(Number(params.id));
	if (!profile) error(404, 'Person not found');
	return { name: profile.name, hallOfFame: hallOfFame(profile.id) };
};
