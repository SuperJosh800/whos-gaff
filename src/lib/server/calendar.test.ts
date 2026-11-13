import { describe, expect, it } from 'vitest';
import { eventIcs } from './calendar.ts';

const event = { id: 7, title: 'Pres; then town, maybe', details: 'Bring cans\nNo glass', starts_at: '2026-11-15T20:30' };
const opts = { url: 'https://gaff.example/events/7', location: '12 Main St, Belfast', now: new Date('2026-11-13T09:05:07Z') };
/** The file with folded lines joined back up, as calendar apps read it. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('eventIcs', () => {
	it('gives the start in UK time, a fixed id and escaped text', () => {
		const lines = unfold(eventIcs(event, opts)).split('\r\n');
		expect(lines).toContain('DTSTART;TZID=Europe/London:20261115T203000');
		expect(lines).toContain('DTSTAMP:20261113T090507Z');
		expect(lines).toContain('UID:event-7@whos-gaff');
		expect(lines).toContain('SUMMARY:Pres\\; then town\\, maybe');
		expect(lines).toContain('LOCATION:12 Main St\\, Belfast');
		expect(lines).toContain('DESCRIPTION:Bring cans\\nNo glass\\n\\nPlans\\, RSVPs and chat: https://gaff.example/events/7');
		expect(lines.at(-1)).toBe(''); // ends with CRLF
	});

	it('leaves the address out when the person can’t see it', () => {
		expect(eventIcs(event, { ...opts, location: null })).not.toContain('LOCATION');
	});

	it('folds long lines at 75 bytes without splitting a character', () => {
		const ics = eventIcs({ ...event, details: '𝄞é'.repeat(60) }, opts);
		for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
		expect(ics).not.toContain('\uFFFD');
		expect(unfold(ics)).toContain('DESCRIPTION:' + '𝄞é'.repeat(60) + '\\n\\nPlans');
	});
});
