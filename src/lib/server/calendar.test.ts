import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { calendarFile, calendarLink, calendarLinkUser, eventIcs } from './calendar.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';

const event = { id: 7, title: 'Pres; then town, maybe', details: 'Bring cans\nNo glass', starts_at: '2026-11-15T20:30', created_at: '2026-11-01 18:04:05' };
const opts = { url: 'https://gaff.example/events/7', location: '12 Main St, Belfast', now: new Date('2026-11-13T09:05:07Z') };
/** The file with folded lines joined back up, as calendar apps read it. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@calendar.test`, name, 'correct-horse-9') as User;

describe('eventIcs', () => {
	it('gives the start in UK time, an id unique to this night and server, and escaped text', () => {
		const lines = unfold(eventIcs(event, opts)).split('\r\n');
		expect(lines).toContain('DTSTART;TZID=Europe/London:20261115T203000');
		expect(lines).toContain('DTSTAMP:20261113T090507Z');
		expect(lines).toContain('UID:event-7-20261101180405@gaff.example');
		expect(lines).toContain('SUMMARY:Pres\\; then town\\, maybe');
		expect(lines).toContain('LOCATION:12 Main St\\, Belfast');
		expect(lines).toContain('DESCRIPTION:Bring cans\\nNo glass\\n\\nPlans\\, RSVPs and chat: https://gaff.example/events/7');
		expect(lines.at(-1)).toBe(''); // ends with CRLF
	});

	it('keeps a stray carriage return or control character from starting a new line', () => {
		const ics = eventIcs({ ...event, title: 'Pres\rLOCATION:fake\u0007' }, opts);
		expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n\x07]/);
		expect(unfold(ics)).toContain('SUMMARY:Pres\\nLOCATION:fake\r\n');
	});

	it('folds long lines at 75 bytes without splitting a character', () => {
		const ics = eventIcs({ ...event, details: '𝄞é'.repeat(60) }, opts);
		for (const line of ics.split('\r\n')) {
			expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
			expect(line.isWellFormed()).toBe(true);
		}
		expect(unfold(ics)).toContain('DESCRIPTION:' + '𝄞é'.repeat(60) + '\\n\\nPlans');
	});
});

describe('calendarFile', () => {
	function night() {
		const [host, going, unsure, stranger] = [user('Host'), user('Going'), user('Unsure'), user('Stranger')];
		const id = createEvent(host.id, { title: 'Pres', location: '1 Secret Lane', mode: 'fixed', startsAt: '2099-06-20T21:00' });
		for (const g of [going, unsure]) joinByToken(getEvent(id)!.invite_token, g.id);
		setRsvp(id, going.id, 'yes');
		return { id, host, going, unsure, stranger };
	}
	const file = (id: number, userId: number) => calendarFile(id, userId, 'https://gaff.example')?.ics;

	it('only has the address for the host and people going, and nothing for people not invited', () => {
		const { id, host, going, unsure, stranger } = night();
		expect(file(id, host.id)).toContain('LOCATION:1 Secret Lane');
		expect(file(id, going.id)).toContain('LOCATION:1 Secret Lane');
		expect(file(id, unsure.id)).toContain('SUMMARY:Pres');
		expect(file(id, unsure.id)).not.toContain('Secret Lane');
		expect(file(id, stranger.id)).toBeUndefined();
	});

	it('has nothing while the date is still being voted on', () => {
		const host = user('Host');
		const id = createEvent(host.id, { title: 'Xmas', mode: 'poll', options: ['2099-12-18T20:00', '2099-12-19T20:00'] });
		expect(file(id, host.id)).toBeUndefined();
	});
});

describe('calendar links', () => {
	const params = (link: string) => new URL(link, 'https://gaff.example').searchParams;
	const now = Date.parse('2026-11-13T12:00:00Z');

	it('work for a day, for that person and that night only', () => {
		const link = calendarLink(5, 42, now);
		expect(calendarLinkUser(5, params(link), now)).toBe(42);
		expect(calendarLinkUser(5, params(link), now + 23 * 3600_000)).toBe(42);
		expect(calendarLinkUser(5, params(link), now + 25 * 3600_000)).toBeNull();
		expect(calendarLinkUser(6, params(link), now)).toBeNull();
		expect(calendarLinkUser(5, params(link.replace('u=42', 'u=43')), now)).toBeNull();
		expect(calendarLinkUser(5, params(link.replace(/e=\d+/, (e) => `e=${Number(e.slice(2)) + 86400}`)), now)).toBeNull();
		expect(calendarLinkUser(5, new URLSearchParams(), now)).toBeNull();
	});
});
