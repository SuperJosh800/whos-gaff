import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, isMember, joinByToken, listAttendees, setRsvp } from './events.ts';
import {
	answerPing,
	createGroup,
	deletePing,
	hostingLeaderboard,
	joinGroupByToken,
	listPings,
	markFreeGaff,
	nudgeToHost,
	seasonLeaderboard,
	sendPing
} from './groups.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@groups.test`, name, 'correct-horse-9') as User;
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
		expect(notes(a)).toEqual(['Free gaff! B’s is free 14 Mar – 16 Mar. Plan something in The lads?']);
		expect(notes(c)).toHaveLength(1);
		expect(notes(b)).toEqual([]);
		expect(() => markFreeGaff(id, b.id, 'x', '2099-03-16', '2099-03-14')).toThrow('end date is before');
	});

	it('turns a "who\'s out?" ping into an event that invites the whole group', () => {
		const { id, a, b, c } = crew();
		const ping = sendPing(id, a.id, 'club', '2099-03-14');
		answerPing(id, b.id, ping, 'yes');
		answerPing(id, c.id, ping, 'no');
		const [p] = listPings(id);
		expect(p).toMatchObject({ plan: 'club', on_date: '2099-03-14' });
		expect([p.yes.map((x) => x.name), p.no.map((x) => x.name)]).toEqual([['A', 'B'], ['C']]);
		answerPing(id, c.id, ping, null); // C clears their answer
		expect(listPings(id)[0].no).toEqual([]);
		expect(notes(b)).toEqual(["A asks: who's out clubbing on Sat 14 Mar? Answer in The lads."]);

		const eventId = createEvent(a.id, { title: 'Out', mode: 'fixed', startsAt: '2099-03-14T20:00', groupId: id });
		expect(listAttendees(eventId).map((x) => x.name)).toEqual(['A', 'B', 'C']);
		expect(notes(c).at(-1)).toBe('A invited you to Out.');
	});

	it('lists pings for today onwards, soonest night first, and rejects past dates and unknown plans', () => {
		const { id, a, b } = crew();
		const later = sendPing(id, a.id, 'pub', '2099-03-21');
		const sooner = sendPing(id, b.id, 'anything', '2099-03-14');
		// Sent today but for a night that has passed: hidden even though it is recent.
		db.prepare("INSERT INTO pings (group_id, user_id, plan, on_date) VALUES (?, ?, 'pub', '2020-01-01')").run(id, a.id);
		expect(listPings(id).map((p) => p.id)).toEqual([sooner, later]);
		expect(() => sendPing(id, a.id, 'pub', '2020-01-01')).toThrow('already passed');
		expect(() => sendPing(id, a.id, 'toString' as 'pub', '2099-03-14')).toThrow('what kind of night');
	});

	it('allows one open ask each; the asker or the group creator can delete it', () => {
		const { id, a, b, c } = crew(); // A created the group
		const bAsk = sendPing(id, b.id, 'pub', '2099-03-14');
		expect(() => sendPing(id, b.id, 'club', '2099-03-21')).toThrow('already have an ask out');
		// An ask whose night has passed no longer counts.
		db.prepare("UPDATE pings SET on_date = '2020-01-01' WHERE id = ?").run(bAsk);
		const bNext = sendPing(id, b.id, 'club', '2099-03-21');

		expect(() => deletePing(id, c.id, bNext)).toThrow('Only the person who asked');
		deletePing(id, b.id, bNext);
		const cAsk = sendPing(id, c.id, 'food', '2099-03-21');
		deletePing(id, a.id, cAsk);
		expect(listPings(id)).toEqual([]);
		sendPing(id, b.id, 'home', '2099-03-28'); // B can ask again once theirs is gone
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
		expect(notes(a).at(-1)).toBe('B says you owe The lads a gaff!');
	});

	it('adds up game and mission points across the group’s nights in a season, ties sharing a place', () => {
		const { id, a, b, c } = crew();
		const night = (startsAt: string, inGroup = true) => {
			const e = createEvent(a.id, { title: 'Night', mode: 'fixed', startsAt, groupId: inGroup ? id : undefined });
			for (const u of [b, c]) {
				if (!isMember(e, u.id)) joinByToken(getEvent(e)!.invite_token, u.id);
				setRsvp(e, u.id, 'yes');
			}
			return e;
		};
		const game = (e: number, u: User, points: number, done = 1) =>
			db.prepare('INSERT INTO challenge_results (event_id, user_id, challenge, points, done) VALUES (?, ?, ?, ?, ?)').run(e, u.id, 'x', points, done);
		const mission = (e: number, u: User, points: number, status: string, caughtBy: User | null = null) =>
			db.prepare('INSERT INTO missions (event_id, user_id, text, points, status, caught_by) VALUES (?, ?, ?, ?, ?, ?)').run(e, u.id, 'x', points, status, caughtBy?.id ?? null);
		const march = night('2099-03-14T20:00');
		const june = night('2099-06-20T20:00');
		game(march, b, 2);
		game(march, b, 0, 0);
		game(june, c, 1);
		mission(march, a, 3, 'done');
		mission(june, b, 3, 'caught', c);
		mission(june, c, 2, 'swapped');
		mission(june, c, 2, 'live');
		// Not counted: another year, a night not for the group, and a night that hasn't happened yet.
		game(night('2098-12-31T23:00'), c, 5);
		game(night('2099-03-14T21:00', false), c, 5);
		game(night('2099-12-31T22:00'), c, 5);
		game(night('2100-01-01T00:00'), c, 50);
		setRsvp(night('2099-05-01T20:00'), c.id, 'no');
		// Nor are people not in the group: someone at a night who never joined, and someone who left.
		const guest = user('Guest');
		joinByToken(getEvent(march)!.invite_token, guest.id);
		game(march, guest, 9);
		const leaver = user('Leaver');
		joinGroupByToken(getGroupToken(id), leaver.id);
		game(march, leaver, 9);
		db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, leaver.id);
		const board = seasonLeaderboard(id, 2099, '2099-07-01T00:00');
		expect(board.map((r) => [r.name, r.place, r.games, r.missions, r.points, r.nights])).toEqual([
			['A', 1, 0, 3, 3, 3],
			['B', 2, 2, 0, 2, 3],
			['C', 2, 1, 1, 2, 2]
		]);
		expect(seasonLeaderboard(id, 2099, '2100-07-01T00:00').map((r) => [r.name, r.points])).toEqual([
			['C', 7],
			['A', 3],
			['B', 2]
		]);
		expect(seasonLeaderboard(id, 2098, '2099-07-01T00:00').map((r) => [r.name, r.points])).toEqual([
			['C', 5],
			['A', 0],
			['B', 0]
		]);
	});
});
