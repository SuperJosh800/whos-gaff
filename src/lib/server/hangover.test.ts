import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { getHangovers, nudgeHangovers, rateHead } from './hangover.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@hangover.test`, name, 'correct-horse-9') as User;
// The night starts at 9pm; check-ins open at 3am and close 3 days after the start.
const START = '2099-06-20T21:00';
const MORNING = '2099-06-21T09:00';

/** Host, Sam and Alex went; Maybe didn't. */
function night(startsAt = START) {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt });
	const [sam, alex, maybe] = ['Sam', 'Alex', 'Maybe'].map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		setRsvp(id, p.id, name === 'Maybe' ? 'maybe' : 'yes');
		return p;
	});
	return { id, host, sam, alex, maybe };
}
const nudges = (u: User) => listNotifications(u.id, 50).filter((x) => /head/.test(x.message)).map((x) => x.message);

describe('hangover check-in', () => {
	it('opens 6 hours after the start for 3 days, for people who went', () => {
		const { id, sam, maybe } = night();
		expect(() => rateHead(id, sam.id, 3, '2099-06-21T02:59')).toThrow('opens');
		rateHead(id, sam.id, 3, '2099-06-21T03:00');
		rateHead(id, sam.id, 1, '2099-06-23T20:59');
		expect(() => rateHead(id, sam.id, 2, '2099-06-23T21:00')).toThrow('closed');
		expect(() => rateHead(id, maybe.id, 2, MORNING)).toThrow('Only people who went');
		for (const bad of [-1, 6, 2.5, NaN]) expect(() => rateHead(id, sam.id, bad, MORNING)).toThrow('Pick');
		expect(getHangovers(id, sam.id, START, MORNING)).toMatchObject({ state: 'open', mine: 1, heads: [{ name: 'Sam', head: 1 }] });
		expect(getHangovers(id, sam.id, START, '2099-06-21T02:59').state).toBe('soon');
		expect(getHangovers(id, sam.id, START, '2099-06-23T21:00').state).toBe('closed');
	});

	it('gives Worst hangover to the worst heads, sharing ties, and to nobody if everyone is fresh', () => {
		const { id, host, sam, alex } = night();
		rateHead(id, host.id, 0, MORNING);
		rateHead(id, sam.id, 0, MORNING);
		expect(getHangovers(id, sam.id, START, MORNING).worst).toEqual([]);
		rateHead(id, alex.id, 4, MORNING);
		rateHead(id, sam.id, 4, MORNING);
		const h = getHangovers(id, sam.id, START, MORNING);
		expect(h.worst.map((w) => w.name)).toEqual(['Alex', 'Sam']);
		expect(h.heads.map((x) => [x.name, x.head])).toEqual([['Alex', 4], ['Sam', 4], ['Host', 0]]);
		// Someone who's since said they didn't go isn't counted.
		setRsvp(id, alex.id, 'no');
		expect(getHangovers(id, sam.id, START, MORNING).worst.map((w) => w.name)).toEqual(['Sam']);
	});

	it('nudges everyone who went and hasn’t checked in, once, at 10am the morning after', () => {
		const { id, host, sam, alex, maybe } = night();
		rateHead(id, alex.id, 2, MORNING);
		nudgeHangovers('2099-06-21T09:59');
		expect(nudges(sam)).toEqual([]);
		nudgeHangovers('2099-06-21T10:00');
		nudgeHangovers('2099-06-21T10:10');
		for (const u of [host, sam]) expect(nudges(u)).toEqual(['How’s the head? Check in for Night.']);
		expect(nudges(alex)).toEqual([]);
		expect(nudges(maybe)).toEqual([]);
	});

	it('nudges a night that starts just after midnight the next morning, and never once check-ins close', () => {
		const late = night('2099-07-01T00:30');
		nudgeHangovers('2099-07-01T10:00');
		expect(nudges(late.sam)).toEqual([]);
		nudgeHangovers('2099-07-02T10:00');
		expect(nudges(late.sam)).toHaveLength(1);
		// The server was off from the night until after check-ins closed.
		const missed = night('2099-08-01T21:00');
		nudgeHangovers('2099-08-04T21:00');
		expect(nudges(missed.sam)).toEqual([]);
	});

	it('is removed with the account and in the export', () => {
		const { id, sam, alex } = night();
		rateHead(id, sam.id, 5, MORNING);
		expect(exportData(sam.id)).toMatchObject({ hangovers: [{ event_id: id, head: 5 }] });
		deleteAccount(sam.id);
		expect(getHangovers(id, alex.id, START, MORNING).heads).toEqual([]);
	});
});
