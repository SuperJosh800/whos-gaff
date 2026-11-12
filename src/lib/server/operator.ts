const env = process.env;

/** Who runs this copy of Who's Gaff, for the privacy policy and terms. Set OPERATOR_NAME and CONTACT_EMAIL. */
export function operator() {
	return {
		name: env.OPERATOR_NAME?.trim() || null,
		email: env.CONTACT_EMAIL?.trim() || null,
		emailConfigured: !!env.SMTP_URL
	};
}
