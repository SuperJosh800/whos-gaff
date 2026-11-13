// "Add to calendar": an .ics file for a night out, which phones open straight into their calendar app.
// No Google or Apple account needed. Times are UK wall-clock times, so they're sent as Europe/London.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TIME_ZONE } from '../time.ts';
import { db } from './db.ts';
import { getEvent, isMember } from './events.ts';
import { canSeeAddress, getGaff } from './gaff.ts';

// How long a night lasts in the calendar; events only have a start time.
const HOURS = 5;

// The UK's clock changes, so calendars that don't know Europe/London by name still get the times right.
const LONDON = [
	'BEGIN:VTIMEZONE',
	`TZID:${TIME_ZONE}`,
	'BEGIN:DAYLIGHT',
	'TZOFFSETFROM:+0000',
	'TZOFFSETTO:+0100',
	'TZNAME:BST',
	'DTSTART:19700329T010000',
	'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
	'END:DAYLIGHT',
	'BEGIN:STANDARD',
	'TZOFFSETFROM:+0100',
	'TZOFFSETTO:+0000',
	'TZNAME:GMT',
	'DTSTART:19701025T020000',
	'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
	'END:STANDARD',
	'END:VTIMEZONE'
];

/** Escapes text for an .ics value: backslashes, commas, semicolons and line breaks; drops other control characters. */
const escape = (text: string) =>
	text
		.replace(/\\/g, '\\\\')
		.replace(/([,;])/g, '\\$1')
		.replace(/\r\n?|\n/g, '\\n')
		.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');

/** Splits a line into 75-byte pieces (as .ics requires) without cutting a character in half. */
function fold(line: string) {
	const out: string[] = [];
	let current = '';
	let bytes = 0;
	for (const ch of line) {
		const size = Buffer.byteLength(ch);
		if (bytes + size > (out.length ? 74 : 75)) {
			out.push(current);
			current = '';
			bytes = 0;
		}
		current += ch;
		bytes += size;
	}
	out.push(current);
	return out.join('\r\n ');
}

/** "2026-11-15T20:00" → "20261115T200000" */
const icsTime = (local: string) => local.replace(/[-:]/g, '') + '00';

export function eventIcs(
	event: { id: number; title: string; details: string; starts_at: string; created_at: string },
	opts: { url: string; location: string | null; now?: Date }
) {
	const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
	const description = [event.details.trim(), `Plans, RSVPs and chat: ${opts.url}`].filter(Boolean).join('\n\n');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		"PRODID:-//Who's Gaff//EN",
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		...LONDON,
		'BEGIN:VEVENT',
		// Unique to this night on this server: ids are reused after a deletion and every install starts at 1.
		`UID:event-${event.id}-${event.created_at.replace(/\D/g, '')}@${new URL(opts.url).hostname}`,
		`DTSTAMP:${stamp}`,
		`DTSTART;TZID=${TIME_ZONE}:${icsTime(event.starts_at)}`,
		`DURATION:PT${HOURS}H`,
		`SUMMARY:${escape(event.title)}`,
		...(opts.location ? [`LOCATION:${escape(opts.location)}`] : []),
		`DESCRIPTION:${escape(description)}`,
		`URL:${opts.url}`,
		'END:VEVENT',
		'END:VCALENDAR'
	];
	return lines.map(fold).join('\r\n') + '\r\n';
}

/**
 * The calendar file for someone in an event, or null when they aren't in it or the date isn't decided.
 * The address is only in it for people who can see it on the event page.
 */
export function calendarFile(eventId: number, userId: number, origin: string) {
	const event = getEvent(eventId);
	if (!event?.starts_at || !isMember(eventId, userId)) return null;
	const gaff = event.gaff_id ? getGaff(event.gaff_id) : undefined;
	const location = canSeeAddress(event, userId) ? gaff?.address || event.location : null;
	const ics = eventIcs({ ...event, starts_at: event.starts_at }, { url: `${origin}/events/${eventId}`, location });
	return { ics, title: event.title };
}

// ---- Signed links ----
// An app added to an iPhone home screen keeps its own login, separate from Safari, and can't open
// calendar files itself. So the link carries a signature for this person and opens outside the app.

const LINK_HOURS = 24;
let secret: Buffer | null = null;

function linkSecret() {
	if (secret) return secret;
	db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('calendar_link_secret', ?)`).run(randomBytes(32).toString('hex'));
	const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'calendar_link_secret'`).get() as { value: string };
	return (secret = Buffer.from(row.value, 'hex'));
}

const sign = (eventId: number, userId: number, expires: number) =>
	createHmac('sha256', linkSecret()).update(`calendar:${eventId}:${userId}:${expires}`).digest('base64url');

/** A link to the calendar file that works for this person for a day without being logged in. */
export function calendarLink(eventId: number, userId: number, now = Date.now()) {
	const expires = Math.floor(now / 1000) + LINK_HOURS * 3600;
	return `/events/${eventId}/calendar.ics?u=${userId}&e=${expires}&s=${sign(eventId, userId, expires)}`;
}

/** The person a calendar link was made for, or null if it's missing, altered or expired. */
export function calendarLinkUser(eventId: number, params: URLSearchParams, now = Date.now()) {
	const userId = Number(params.get('u'));
	const expires = Number(params.get('e'));
	const given = Buffer.from(params.get('s') ?? '', 'base64url');
	if (!Number.isInteger(userId) || !Number.isInteger(expires) || expires * 1000 < now) return null;
	const expected = Buffer.from(sign(eventId, userId, expires), 'base64url');
	return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
