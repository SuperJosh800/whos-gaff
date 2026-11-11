import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, listAttendees } from './events.ts';
import {
	answerPing,
	createGroup,
	hostingLeaderboard,
	joinGroupByToken,
	listPings,
	markFreeGaff,
	nudgeToHost,
	sendPing
} from './groups.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@groups.test`, name, 'password123') as User;
const notes = (u: User) =>
	(db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY id').all(u.id) as { message: string }[]).map(
		(r) => r.message
	);

const getGroupToken = (id: number) =>
	(db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;

function crew() {
	const [a, b, c] = [user('A'), user('B'), user('C')];
	const id = createGroup(a.id, 'The lads');
	for (const u of [b, c]) joinGroupByToken(getGroupToken(id), u.id);
	return { id, a, b, c };
}

describe('groups', () => {
	it('tells everyone else about a free gaff', () => {
		const { id, a, b, c } = crew();
		markFreeGaff(id, b.id, '', '2099-03-14', '2099-03-16');
		expect(notes(a)).toEqual(['🏠 Free gaff! B’s is free 14 Mar – 16 Mar. Plan something in The lads?']);
		expect(notes(c)).toHaveLength(1);
		expect(notes(b)).toEqual([]);
		expect(() => markFreeGaff(id, b.id, 'x', '2099-03-16', '2099-03-14')).toThrow('end date is before');
	});

	it('turns a "who\'s out?" ping into an event that invites the whole group', () => {
		const { id, a, b, c } = crew();
		const ping = sendPing(id, a.id);
		answerPing(id, b.id, ping, 'yes');
		answerPing(id, c.id, ping, 'no');
		const [p] = listPings(id);
		expect([p.yes.map((x) => x.name), p.no.map((x) => x.name)]).toEqual([['A', 'B'], ['C']]);

		const eventId = createEvent(a.id, { title: 'Out', mode: 'fixed', startsAt: '2099-03-14T20:00', groupId: id });
		expect(listAttendees(eventId).map((x) => x.name)).toEqual(['A', 'B', 'C']);
		expect(notes(c).at(-1)).toBe('A invited you to Out.');
	});

	it('ranks hosts by dated group events and only nudges people who have never hosted', () => {
		const { id, a, b, c } = crew();
		createEvent(b.id, { title: '1', mode: 'fixed', startsAt: '2099-03-14T20:00', groupId: id });
		createEvent(b.id, { title: '2', mode: 'fixed', startsAt: '2099-03-21T20:00', groupId: id });
		createEvent(c.id, { title: '3', mode: 'fixed', startsAt: '2099-03-28T20:00', groupId: id });
		createEvent(a.id, { title: 'Undated', mode: 'poll', options: ['2099-04-01T20:00', '2099-04-02T20:00'], groupId: id });
		createEvent(a.id, { title: 'Not in group', mode: 'fixed', startsAt: '2099-04-03T20:00' });
		expect(hostingLeaderboard(id).map((r) => [r.name, r.hosted])).toEqual([
			['B', 2],
			['C', 1],
			['A', 0]
		]);
		expect(() => nudgeToHost(id, a.id, b.id)).toThrow('already hosted');
		nudgeToHost(id, b.id, a.id);
		expect(notes(a).at(-1)).toBe('🏠 B says you owe The lads a gaff!');
	});
});
