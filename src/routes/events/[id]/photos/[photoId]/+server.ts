import { error } from '@sveltejs/kit';
import { readPhoto } from '#lib/server/after.ts';
import { isMember } from '#lib/server/events.ts';
import type { RequestHandler } from './$types';

// Photos are only served to people on the event, and photo drop photos only once they're revealed.
export const GET: RequestHandler = ({ params, locals }) => {
	const eventId = Number(params.id);
	if (!locals.user || !isMember(eventId, locals.user.id)) error(404, 'Not found');
	const photo = readPhoto(eventId, Number(params.photoId), locals.user.id);
	if (!photo) error(404, 'Not found');
	return new Response(photo.bytes, {
		headers: { 'content-type': photo.mime, 'cache-control': 'private, max-age=86400' }
	});
};
