import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, setRsvp } from './events.ts';
import { createGroup, joinGroupByToken } from './groups.ts';
import { voteAward } from './after.ts';
import { addExpense } from './money.ts';
import { reviewYears, yearReview } from './yearReview.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@year.test`, name, 'correct-horse-9') as User;
const NOW = '2098-12-31T23:00';

function crew() {
	const [ana, ben, cat, dan] = [user('Ana'), user('Ben'), user('Cat'), user('Dan')];
	const id = createGroup(ana.id, 'Crew');
	const token = (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;
	for (const u of [ben, cat, dan]) joinGroupByToken(token, u.id);
	const night = (host: User, startsAt: string, going: User[], maybe: User[] = []) => {
		const e = createEvent(host.id, { title: `Night ${startsAt}`, mode: 'fixed', startsAt, groupId: id });
		for (const u of going) setRsvp(e, u.id, 'yes');
		for (const u of maybe) setRsvp(e, u.id, 'maybe');
		return e;
	};
	return { id, ana, ben, cat, dan, night };
}

describe('year in review', () => {
	it('counts only the group’s nights in that year that have happened', () => {
		const { id, ana, ben, night } = crew();
		const before = night(ana, '2097-12-31T23:30', [ben]); // the year before
		const a = night(ana, '2098-01-01T00:00', [ben]); // first minute of the year
		night(ben, '2098-12-31T23:30', [ana]); // later tonight: hasn't happened yet
		createEvent(ana.id, { title: 'Not a group night', mode: 'fixed', startsAt: '2098-06-01T20:00' });
		createEvent(ana.id, { title: 'Undated', mode: 'poll', options: ['2098-04-01T20:00', '2098-04-02T20:00'], groupId: id });
		const other = createGroup(ana.id, 'Other lot');
		createEvent(ana.id, { title: 'Other group', mode: 'fixed', startsAt: '2098-05-01T20:00', groupId: other });
		const r = yearReview(id, ana.id, 2098, NOW);
		expect(r.nights.map((x) => x.id)).toEqual([a]);
		expect(r.topHost).toEqual({ names: ['Ana'], count: 1 });
		expect(yearReview(id, ana.id, 2097, NOW).nights.map((x) => x.id)).toEqual([before]);
		expect(reviewYears(id, NOW)).toEqual([2098, 2097]);
	});

	it('ranks who came out by the host plus people going, not maybes', () => {
		const { id, ana, ben, cat, dan, night } = crew();
		night(ana, '2098-03-01T20:00', [ben, cat], [dan]);
		night(ben, '2098-04-01T20:00', [cat], [ana]);
		night(cat, '2098-05-01T20:00', [dan]);
		const r = yearReview(id, ana.id, 2098, NOW);
		expect(r.attendance.map(({ name, count }) => ({ name, count }))).toEqual([
			{ name: 'Cat', count: 3 },
			{ name: 'Ben', count: 2 },
			{ name: 'Ana', count: 1 },
			{ name: 'Dan', count: 1 }
		]);
		expect(r.mostOut).toEqual({ names: ['Cat'], count: 3 });
		expect(r.topHost).toEqual({ names: ['Ana', 'Ben', 'Cat'], count: 1 });
		expect(r.biggest?.people).toBe(3);
	});

	it('counts award wins per night with ties shared, and leaves out people who left the group', () => {
		const { id, ana, ben, cat, dan, night } = crew();
		const after = '2098-12-01T00:00';
		const one = night(ana, '2098-06-01T20:00', [ben, cat, dan]);
		voteAward(one, ben.id, 'mvp', ana.id, after);
		voteAward(one, cat.id, 'mvp', dan.id, after); // Ana and Dan tie on night one
		const two = night(ana, '2098-07-01T20:00', [ben, cat, dan]);
		voteAward(two, ana.id, 'mvp', dan.id, after);
		voteAward(two, ben.id, 'mvp', dan.id, after);
		voteAward(two, cat.id, 'mvp', ben.id, after); // Dan wins night two outright
		db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, dan.id);
		const r = yearReview(id, ana.id, 2098, NOW);
		expect(r.awards.find((a) => a.key === 'mvp')!.top).toEqual({ names: ['Ana'], count: 1 });
		expect(r.attendance.map((a) => a.name)).not.toContain('Dan');
	});

	it('totals the kitty and photos, and counts first home only for the earliest check-in', () => {
		const { id, ana, ben, cat, night } = crew();
		const e = night(ana, '2098-08-01T20:00', [ben, cat]);
		const other = night(ana, '2097-08-01T20:00', [ben]);
		addExpense(e, ana.id, 'Cans', '12.50', [ana.id, ben.id]);
		addExpense(other, ana.id, 'Old cans', '99', [ana.id, ben.id]);
		db.prepare(`INSERT INTO event_photos (event_id, user_id, filename, mime) VALUES (?, ?, 'x', 'image/jpeg')`).run(e, ben.id);
		const home = db.prepare('INSERT INTO home_safe (event_id, user_id, at) VALUES (?, ?, ?)');
		home.run(e, cat.id, '2098-08-02T01:00');
		home.run(e, ben.id, '2098-08-02T03:00');
		const r = yearReview(id, ana.id, 2098, NOW);
		expect(r.totals).toEqual({ nights: 1, photos: 1, spentPence: 1250 });
		expect(r.firstHome).toEqual({ names: ['Cat'], count: 1 });
		expect(r.topRounds).toBeNull();
	});

	it('counts rounds bought (not skipped) and moves, only from the year’s nights', () => {
		const { id, ana, ben, cat, night } = crew();
		const e = night(ana, '2098-09-01T20:00', [ben, cat]);
		const old = night(ana, '2097-09-01T20:00', [ben, cat]);
		const round = db.prepare('INSERT INTO rounds (event_id, user_id, skipped) VALUES (?, ?, ?)');
		round.run(e, ben.id, 0);
		round.run(e, cat.id, 1);
		round.run(e, cat.id, 1);
		for (let i = 0; i < 3; i++) round.run(old, cat.id, 0);
		const move = db.prepare(`INSERT INTO moves (event_id, user_id, place) VALUES (?, ?, 'Pub')`);
		move.run(e, ana.id);
		move.run(old, cat.id);
		move.run(old, cat.id);
		const r = yearReview(id, ana.id, 2098, NOW);
		expect(r.topRounds).toEqual({ names: ['Ben'], count: 1 });
		expect(r.mostMoves).toEqual({ names: ['Ana'], count: 1 });
	});

	it('keeps people who share a name apart, and hides nights from before the viewer joined', () => {
		const { id, ana, ben, night } = crew();
		const e = night(ana, '2098-10-01T20:00', [ben]);
		const twin = user('Ben');
		const token = (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;
		joinGroupByToken(token, twin.id);
		night(ana, '2098-11-01T20:00', [twin]);
		const r = yearReview(id, ana.id, 2098, NOW);
		expect(r.attendance.filter((a) => a.name === 'Ben').map((a) => a.id).sort()).toEqual([ben.id, twin.id].sort());
		expect(r.nights.every((n) => n.title)).toBe(true);
		const late = yearReview(id, twin.id, 2098, NOW);
		expect(late.nights.find((n) => n.id === e)!.title).toBeNull();
		expect(late.nights.filter((n) => n.title)).toHaveLength(1);
	});
});
