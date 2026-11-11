import nodemailer from 'nodemailer';

// Set SMTP_URL (e.g. smtps://user:pass@smtp.example.com) and MAIL_FROM to send real email.
// Without SMTP_URL, emails are written to the server log instead.
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const from = process.env.MAIL_FROM ?? "Who's Gaff <no-reply@whos-gaff.local>";

export async function sendMail(to: string, subject: string, text: string) {
	if (!transport) {
		console.log(`[mail] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
		return;
	}
	try {
		await transport.sendMail({ from, to, subject, text });
	} catch (e) {
		console.error(`[mail] failed to send to ${to}`, e);
	}
}
