import { gameInvites } from '#lib/server/activities.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url, depends }) => {
	// Rerun on every page change and when the layout polls, so a game invite shows up wherever you are.
	void url.pathname;
	depends('app:games');
	return { user: locals.user, games: locals.user ? gameInvites(locals.user.id) : [] };
};
