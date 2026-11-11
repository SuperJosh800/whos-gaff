import { error, type RequestEvent } from '@sveltejs/kit';

/** Reads the form and the logged-in user for a form action on /events/[id]/…. */
export async function eventInput({ request, locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Log in first');
	const form = await request.formData();
	const get = (name: string) => String(form.get(name) ?? '');
	return { userId: locals.user.id, eventId: Number((params as { id: string }).id), get, form };
}
