// "Add to calendar": an .ics file for a night out, which phones open straight into their calendar app.
// No Google or Apple account needed. Times are UK wall-clock times, so they're sent as Europe/London.
import { TIME_ZONE } from '../time.ts';

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

/** Escapes text for an .ics value: backslashes, commas, semicolons and line breaks. */
const escape = (text: string) =>
	text.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

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
	event: { id: number; title: string; details: string; starts_at: string },
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
		// The same id each time, so calendars that support it update the night rather than adding a copy.
		`UID:event-${event.id}@whos-gaff`,
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
