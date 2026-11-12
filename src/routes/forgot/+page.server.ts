import { fail, redirect } from '@sveltejs/kit';
import { createPasswordReset } from '#lib/server/auth.ts';
import { sendMail } from '#lib/server/mail.ts';
import { attemptAll, ipKey, HOUR } from '#lib/server/ratelimit.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/profile');
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (!email) return fail(400, { error: 'Enter your email address.', email });
		// Stop the form being used to flood someone's inbox, without letting a stranger use up the
		// owner's allowance: 3 an hour per address and email, 10 an hour per email from anywhere.
		const ip = ipKey('reset', event);
		const limited = attemptAll([
			{ key: ip ? `${ip}:email:${email}` : `reset:email:${email}`, limit: 3, windowMs: HOUR },
			{ key: `reset:email-any:${email}`, limit: 10, windowMs: HOUR },
			{ key: ip, limit: 10, windowMs: HOUR }
		]);
		if (limited) return fail(429, { error: limited, email });
		const reset = createPasswordReset(email);
		if (reset) {
			const link = `${event.url.origin}/reset/${reset.token}`;
			// Not awaited, so the reply takes as long whether or not the account exists.
			void sendMail(
				email,
				"Reset your Who's Gaff password",
				`Hi ${reset.name},\n\nSomeone asked to reset the password for your Who's Gaff account. ` +
					`If it was you, open this link within ${reset.minutes} minutes:\n\n${link}\n\n` +
					`If it wasn't you, ignore this email. Your password won't change.`
			);
		}
		// Same answer either way, so the form can't be used to find out who has an account.
		return { sent: true, email };
	}
};
