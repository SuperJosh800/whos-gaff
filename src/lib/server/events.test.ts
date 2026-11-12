import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { addStage, listStages, nextStageTime } from './night.ts';
import {
	claimEmailInvites,
	createEvent,
	getEvent,
	inviteByEmail,
	joinByToken,
	listAttendees,
	listOptions,
	pickWinner,
	setRsvp,
	setVote,
	suggestOption,
	updateOption,
	votingOpen
} from './events.ts';

let n = 0;
function user(name: string) {
	return signUp(`${name.toLowerCase()}${++n}@example.com`, name, 'correct-horse-9') as User;
}

function poll(host: User, options = ['2099-03-14T20:00', '2099-03-15T20:00', '2099-03-21T20:00']) {
	const id = createEvent(host.id, { title: 'Pres', mode: 'poll', options });
	return { id, event: getEvent(id)! };
}

function join(eventId: number, ...users: User[]) {
	for (const u of users) joinByToken(getEvent(eventId)!.invite_token, u.id);
}

describe('date polls', () => {
	it('counts can and cannot votes per option, and a changed vote moves between them', () => {
		const host = user('Host');
		const [a, b, c] = [user('A'), user('B'), user('C')];
		const { id } = poll(host);
		join(id, a, b, c);
		const [fri, sat] = listOptions(id, host.id);

		setVote(id, a.id, sat.id, true);
		setVote(id, b.id, sat.id, true);
		setVote(id, c.id, sat.id, false);
		setVote(id, a.id, fri.id, false);
		setVote(id, b.id, sat.id, false); // B changes their mind

		const byDate = Object.fromEntries(listOptions(id, a.id).map((o) => [o.starts_at, o]));
		expect(byDate['2099-03-15T20:00']).toMatchObject({ can: 1, cant: 2, mine: 1, can_names: 'A' });
		expect(byDate['2099-03-14T20:00']).toMatchObject({ can: 0, cant: 1, mine: 0 });
		expect(byDate['2099-03-21T20:00']).toMatchObject({ can: 0, cant: 0, mine: null });

		setVote(id, a.id, sat.id, null); // A clears their answer
		const after = listOptions(id, a.id).find((o) => o.id === sat.id);
		expect(after).toMatchObject({ can: 0, cant: 2, mine: null });
	});

	it('only lets invited people vote', () => {
		const host = user('Host');
		const outsider = user('Outsider');
		const { id } = poll(host);
		const [opt] = listOptions(id, host.id);
		expect(() => setVote(id, outsider.id, opt.id, true)).toThrow('not invited');
	});

	it('locks to the winning date, closes voting, opens RSVPs and notifies guests', async () => {
		const host = user('Host');
		const guest = user('Guest');
		const { id } = poll(host);
		join(id, guest);
		const sat = listOptions(id, host.id)[1];

		expect(() => setRsvp(id, guest.id, 'yes')).toThrow('RSVPs open once the date is set');
		await expect(pickWinner(id, guest.id, sat.id, 'http://x')).rejects.toThrow('Only the host');

		await pickWinner(id, host.id, sat.id, 'http://x');
		const event = getEvent(id)!;
		expect(event.starts_at).toBe('2099-03-15T20:00');
		expect(votingOpen(event)).toBe(false);
		expect(() => setVote(id, guest.id, sat.id, true)).toThrow('Voting is closed');

		setRsvp(id, guest.id, 'maybe');
		setRsvp(id, guest.id, 'yes');
		expect(listAttendees(id).find((a) => a.id === guest.id)?.response).toBe('yes');

		const notes = db.prepare('SELECT user_id, message FROM notifications WHERE event_id = ?').all(id);
		expect(notes).toEqual([{ user_id: guest.id, message: 'Pres is on Sun 15 Mar, 8pm. RSVPs are open!' }]);
	});

	it('plans the night on the leading date, then moves the stages to the date the host locks', async () => {
		const host = user('Host');
		const guest = user('Guest');
		const { id } = poll(host); // Sat 14, Sun 15 and Sat 21 Mar
		join(id, guest);
		const [, sun, sat21] = listOptions(id, host.id);
		setVote(id, guest.id, sun.id, true);
		expect(nextStageTime(id)).toBe('2099-03-15T20:00');

		addStage(id, host.id, 'Pres', '2099-03-15T20:00', '');
		expect(nextStageTime(id)).toBe('2099-03-15T22:00');
		addStage(id, host.id, 'Club', '2099-03-15T23:30', '');
		expect(nextStageTime(id)).toBe('2099-03-16T01:30');

		await pickWinner(id, host.id, sat21.id, 'http://x');
		expect(listStages(id).map((s) => s.starts_at)).toEqual(['2099-03-21T20:00', '2099-03-21T23:30']);
	});

	it('closes voting once the deadline passes, but the host can still pick a date', async () => {
		const host = user('Host');
		const { id } = poll(host);
		db.prepare('UPDATE events SET vote_deadline = ? WHERE id = ?').run('2099-03-10T18:00', id);
		const event = getEvent(id)!;
		expect(votingOpen(event, '2099-03-10T17:59')).toBe(true);
		expect(votingOpen(event, '2099-03-10T18:00')).toBe(false);

		db.prepare('UPDATE events SET vote_deadline = ? WHERE id = ?').run('2000-01-01T00:00', id);
		const [opt] = listOptions(id, host.id);
		expect(() => setVote(id, host.id, opt.id, true)).toThrow('Voting is closed');
		await pickWinner(id, host.id, opt.id, 'http://x');
		expect(getEvent(id)!.starts_at).toBe(opt.starts_at);
	});

	it('rejects a deadline after the first date option', () => {
		const host = user('Host');
		expect(() =>
			createEvent(host.id, {
				title: 'Late',
				mode: 'poll',
				options: ['2099-03-14T20:00', '2099-03-15T20:00'],
				voteDeadline: '2099-03-14T21:00'
			})
		).toThrow('before the first date option');
	});

	it('lets a guest suggest a date that others can vote on', () => {
		const host = user('Host');
		const [a, b] = [user('A'), user('B')];
		const { id } = poll(host);
		join(id, a, b);
		suggestOption(id, a.id, '2099-03-28T20:00');
		const suggested = listOptions(id, b.id).find((o) => o.starts_at === '2099-03-28T20:00')!;
		expect(suggested.suggested_by_name).toBe('A');
		setVote(id, b.id, suggested.id, true);
		expect(listOptions(id, b.id).find((o) => o.id === suggested.id)?.can).toBe(1);
		expect(() => suggestOption(id, b.id, '2099-03-28T20:00')).toThrow('already an option');
	});

	it('clears votes when the host moves an option to another date', () => {
		const host = user('Host');
		const a = user('A');
		const { id } = poll(host);
		join(id, a);
		const [fri] = listOptions(id, host.id);
		setVote(id, a.id, fri.id, true);
		updateOption(id, host.id, fri.id, '2099-03-13T19:00');
		expect(listOptions(id, a.id).find((o) => o.id === fri.id)).toMatchObject({
			starts_at: '2099-03-13T19:00',
			can: 0,
			mine: null
		});
	});
});

describe('fixed-date events', () => {
	it('open RSVPs straight away', () => {
		const host = user('Host');
		const id = createEvent(host.id, { title: 'Party', mode: 'fixed', startsAt: '2099-05-01T21:00' });
		setRsvp(id, host.id, 'yes');
		expect(listAttendees(id)[0]).toMatchObject({ id: host.id, response: 'yes', is_host: 1 });
	});
});

describe('email invites', () => {
	it('adds existing users straight away and new users when they sign up', async () => {
		const host = user('Host');
		const existing = user('Existing');
		const id = createEvent(host.id, { title: 'Party', mode: 'fixed', startsAt: '2099-05-01T21:00' });
		await inviteByEmail(id, host.id, `${existing.email.toUpperCase()}, newbie@example.com`, 'http://x');
		expect(listAttendees(id).map((a) => a.name)).toEqual(['Host', 'Existing']);

		const newbie = signUp('newbie@example.com', 'Newbie', 'correct-horse-9') as User;
		claimEmailInvites(newbie.id, newbie.email);
		expect(listAttendees(id).map((a) => a.name)).toContain('Newbie');
	});
});
