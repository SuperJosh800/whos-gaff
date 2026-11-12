import { error } from '@sveltejs/kit';
import { exportData } from '#lib/server/account.ts';
import type { RequestHandler } from './$types';

// Everything we hold about you, as a JSON file (your right of access under UK GDPR).
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Log in first');
	const body = JSON.stringify(exportData(locals.user.id), null, 2);
	return new Response(body, {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="whos-gaff-data-${new Date().toISOString().slice(0, 10)}.json"`,
			'cache-control': 'private, no-store'
		}
	});
};
