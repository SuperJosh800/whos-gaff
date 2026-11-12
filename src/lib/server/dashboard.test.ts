import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, listOptions, setRsvp, setVote } from './events.ts';
import { listDashboardEvents } from './dashboard.ts';

const user = (name: string) => signUp(`${name}@dash.test`, name, 'correct-horse-9') as User;

describe('dashboard', () => {
	it('shows each event with its status, RSVP counts and what the user still has to do', () => {
		const host = user('host');
		const guest = user('guest');
		const join = (id: number) => joinByToken(getEvent(id)!.invite_token, guest.id);
		const now = '2099-06-01T12:00';

		const party = createEvent(host.id, { title: 'Party', mode: 'fixed', startsAt: '2099-06-20T21:00' });
		const old = createEvent(host.id, { title: 'Old', mode: 'fixed', startsAt: '2099-05-01T21:00' });
		const open = createEvent(host.id, { title: 'Open poll', mode: 'poll', options: ['2099-07-01T20:00', '2099-07-02T20:00'] });
		const closed = createEvent(host.id, { title: 'Closed poll', mode: 'poll', options: ['2099-07-03T20:00', '2099-07-04T20:00'] });
		db.prepare('UPDATE events SET vote_deadline = ? WHERE id = ?').run('2099-05-30T18:00', closed);
		[party, old, open, closed].forEach(join);
		setRsvp(party, host.id, 'yes');
		setVote(open, host.id, listOptions(open, host.id)[0].id, true);

		const forHost = listDashboardEvents(host.id, now);
		const forGuest = listDashboardEvents(guest.id, now);
		const summary = (d: typeof forHost) =>
			[...d.upcoming, ...d.past].map((e) => [e.title, e.status, e.todo]);

		// Undecided polls come first (newest first), then dated events by date, past events last.
		expect(summary(forHost)).toEqual([
			['Closed poll', 'voting-closed', 'pick'],
			['Open poll', 'voting', null],
			['Party', 'locked', null],
			['Old', 'past', null]
		]);
		expect(summary(forGuest)).toEqual([
			['Closed poll', 'voting-closed', null],
			['Open poll', 'voting', 'vote'],
			['Party', 'locked', 'rsvp'],
			['Old', 'past', null]
		]);
		expect(forGuest.upcoming.find((e) => e.title === 'Party')).toMatchObject({ going: 1, invited: 2 });
		expect(forGuest.upcoming.find((e) => e.title === 'Open poll')).toMatchObject({ voters: 1 });
	});
});
