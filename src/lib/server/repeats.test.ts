import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setPlaylist, setRsvp } from './events.ts';
import { createGroup, joinGroupByToken } from './groups.ts';
import { lockTheme, listThemes, suggestTheme } from './themes.ts';
import { makeRepeats, nextDate, setRepeat } from './repeats.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@repeats.test`, name, 'correct-horse-9') as User;
const notes = (u: User) =>
	(db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY id').all(u.id) as { message: string }[]).map((r) => r.message);
const members = (id: number) =>
	(db.prepare('SELECT user_id FROM event_members WHERE event_id = ? ORDER BY user_id').all(id) as { user_id: number }[]).map((r) => r.user_id);
// Friday 24 October 2098 at 8pm; the clocks go back on Sunday 26 October.
const FRIDAY = '2098-10-24T20:00';
// Tests share one database, so look up the night made from a given one rather than everything made.
const madeFrom = (id: number) =>
	(db.prepare('SELECT id FROM events WHERE repeated_from = ?').all(id) as { id: number }[]).map((r) => r.id);
const repeatOf = (id: number, now: string) => {
	makeRepeats(now);
	return madeFrom(id);
};

function quiz() {
	const host = user('Host');
	const [a, out] = [user('A'), user('Out')];
	const id = createEvent(host.id, { title: 'Pub quiz', details: 'Back room', location: 'The Ox', mode: 'fixed', startsAt: FRIDAY });
	for (const g of [a, out]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, a.id, 'yes');
	setRsvp(id, out.id, 'no');
	return { id, host, a, out };
}

describe('repeat nights', () => {
	it('only the host sets it, and only on a dated event', () => {
		const { id, host, a } = quiz();
		expect(() => setRepeat(id, a.id, 7)).toThrow('Only the host');
		expect(() => setRepeat(id, host.id, 3 as 7)).toThrow('how often');
		const poll = createEvent(host.id, { title: 'Poll', mode: 'poll', options: ['2099-07-01T20:00', '2099-07-02T20:00'] });
		expect(() => setRepeat(poll, host.id, 7)).toThrow('date first');
		setRepeat(poll, host.id, null); // turning it off is always fine
	});

	it('makes the next night once this one starts, same time a week on, with the same details and people', () => {
		const { id, host, a, out } = quiz();
		setPlaylist(id, host.id, 'https://open.spotify.com/playlist/abc');
		suggestTheme(id, a.id, 'Fancy dress');
		lockTheme(id, host.id, listThemes(id, a.id).options[0].id);
		setRepeat(id, host.id, 7);
		expect(repeatOf(id, '2098-10-24T19:59')).toEqual([]);
		const [next] = repeatOf(id, FRIDAY);
		const e = getEvent(next)!;
		expect(e).toMatchObject({
			title: 'Pub quiz', details: 'Back room', location: 'The Ox', mode: 'fixed', starts_at: '2098-10-31T20:00',
			host_id: host.id, playlist_url: 'https://open.spotify.com/playlist/abc', theme: '', repeat_days: 7, repeated_from: id
		});
		expect(e.invite_token).not.toBe(getEvent(id)!.invite_token);
		expect(getEvent(id)!.repeat_days).toBeNull();
		expect(members(next)).toEqual([host.id, a.id, out.id].sort((x, y) => x - y));
		// Nobody's RSVP carries over: everyone is asked again.
		expect(db.prepare('SELECT COUNT(*) AS n FROM rsvps WHERE event_id = ?').get(next)).toEqual({ n: 0 });
		const told = 'Pub quiz is on again: Fri 31 Oct, 8pm. Are you coming?';
		expect(notes(a).at(-1)).toBe(told);
		expect(notes(out).at(-1)).toBe(told);
		expect(notes(host).filter((m) => m.includes('on again'))).toEqual([]);
	});

	it('makes each night once however often it runs, and the run carries on from the newest one', () => {
		const { id, host } = quiz();
		setRepeat(id, host.id, 14);
		const [second] = repeatOf(id, FRIDAY);
		expect(repeatOf(id, FRIDAY)).toEqual([second]);
		expect(repeatOf(second, '2098-11-06T12:00')).toEqual([]);
		expect(getEvent(second)!.starts_at).toBe('2098-11-07T20:00');
		const [third] = repeatOf(second, '2098-11-07T20:00');
		expect(repeatOf(id, '2098-11-07T20:00')).toEqual([second]);
		expect(getEvent(third)).toMatchObject({ starts_at: '2098-11-21T20:00', repeat_days: 14 });
	});

	it('skips nights missed while the server was off, and stops when the host turns it off', () => {
		const { id, host } = quiz();
		setRepeat(id, host.id, 7);
		const [next] = repeatOf(id, '2098-11-12T09:00'); // the server was off for nearly three weeks
		expect(getEvent(next)!.starts_at).toBe('2098-11-14T20:00');
		setRepeat(next, host.id, null);
		expect(repeatOf(next, '2098-11-14T20:00')).toEqual([]);
		expect(nextDate('2098-03-27T23:30', 7, '2098-03-27T23:30')).toBe('2098-04-03T23:30');
	});

	it('a group night invites whoever is in the group now', () => {
		const host = user('Host');
		const [stays, leaves, joins] = [user('Stays'), user('Leaves'), user('Joins')];
		const group = createGroup(host.id, 'Five-a-side');
		const token = (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(group) as { invite_token: string }).invite_token;
		for (const u of [stays, leaves]) joinGroupByToken(token, u.id);
		const id = createEvent(host.id, { title: 'Football', mode: 'fixed', startsAt: FRIDAY, groupId: group });
		setRepeat(id, host.id, 7);
		db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(group, leaves.id);
		joinGroupByToken(token, joins.id);
		const [next] = repeatOf(id, FRIDAY);
		expect(getEvent(next)!.group_id).toBe(group);
		expect(members(next)).toEqual([host.id, stays.id, joins.id].sort((x, y) => x - y));
	});
});
