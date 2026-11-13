import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { listThemes, lockTheme, MAX_THEMES, removeTheme, reopenTheme, suggestTheme, voteTheme } from './themes.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@themes.test`, name, 'correct-horse-9') as User;
const notes = (u: User) =>
	(db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY id').all(u.id) as { message: string }[]).map((r) => r.message);
const labels = (eventId: number, u: User) => listThemes(eventId, u.id).options.map((o) => [o.label, o.votes]);

function night() {
	const host = user('Host');
	const [a, b, no, maybe] = [user('A'), user('B'), user('No'), user('Maybe')];
	const id = createEvent(host.id, { title: 'Halloween', mode: 'fixed', startsAt: '2099-10-31T21:00' });
	for (const g of [a, b, no, maybe]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, a.id, 'yes');
	setRsvp(id, no.id, 'no');
	setRsvp(id, maybe.id, 'maybe');
	return { id, host, a, b, no, maybe };
}

describe('dress code poll', () => {
	it('takes suggestions from anyone invited, without repeats, and up to a limit', () => {
		const { id, a, b } = night();
		const stranger = user('Stranger');
		suggestTheme(id, a.id, '  Double   denim ');
		expect(() => suggestTheme(id, b.id, 'double DENIM')).toThrow('already on the list');
		expect(() => suggestTheme(id, b.id, '   ')).toThrow('Type a dress code');
		expect(() => suggestTheme(id, b.id, '\u200B')).toThrow('Type a dress code');
		expect(() => suggestTheme(id, b.id, '!!!')).toThrow('Type a dress code');
		expect(() => suggestTheme(id, b.id, 'Double\u200B denim')).toThrow('already on the list');
		expect(() => suggestTheme(id, b.id, 'x'.repeat(61))).toThrow('to 60');
		suggestTheme(id, b.id, 'y'.repeat(60));
		expect(() => suggestTheme(id, stranger.id, 'Togas')).toThrow('not invited');
		expect(() => listThemes(id, stranger.id)).toThrow('not invited');
		for (let i = 2; i < MAX_THEMES; i++) suggestTheme(id, b.id, `Idea ${i}`);
		expect(() => suggestTheme(id, b.id, 'One more')).toThrow('plenty of ideas');
		expect(listThemes(id, a.id).options[0].label).toBe('Double denim');
	});

	it('gives everyone one vote they can move or take back, and sorts by votes', () => {
		const { id, host, a, b } = night();
		suggestTheme(id, a.id, 'Black tie');
		suggestTheme(id, b.id, 'Pyjamas');
		const [tie, pj] = listThemes(id, a.id).options.map((o) => o.id);
		voteTheme(id, a.id, tie);
		voteTheme(id, b.id, pj);
		voteTheme(id, host.id, pj);
		expect(labels(id, a)).toEqual([['Pyjamas', 2], ['Black tie', 1]]);
		voteTheme(id, host.id, tie); // moves the vote rather than adding one
		voteTheme(id, host.id, tie); // a double tap changes nothing
		expect(labels(id, a)).toEqual([['Black tie', 2], ['Pyjamas', 1]]);
		expect(listThemes(id, a.id).options.map((o) => o.mine)).toEqual([true, false]);
		voteTheme(id, a.id, null);
		const view = listThemes(id, a.id);
		expect(view.options.map((o) => [o.label, o.votes, o.mine])).toEqual([['Black tie', 1, false], ['Pyjamas', 1, false]]);
		expect(view.options.find((o) => o.label === 'Black tie')!.voters).toBe('Host');
	});

	it('only lets whoever suggested it, or the host, remove a theme, and its votes go too', () => {
		const { id, host, a, b } = night();
		suggestTheme(id, a.id, 'Neon');
		const neon = listThemes(id, a.id).options[0];
		expect(neon.canRemove).toBe(true);
		expect(listThemes(id, b.id).options[0].canRemove).toBe(false);
		expect(listThemes(id, host.id).options[0].canRemove).toBe(true);
		voteTheme(id, b.id, neon.id);
		expect(() => removeTheme(id, b.id, neon.id)).toThrow('Only whoever suggested it');
		removeTheme(id, host.id, neon.id);
		expect(listThemes(id, a.id).options).toEqual([]);
		expect(db.prepare('SELECT COUNT(*) AS n FROM theme_votes WHERE event_id = ?').get(id)).toEqual({ n: 0 });
		expect(() => voteTheme(id, b.id, neon.id)).toThrow('isn’t on the list');
	});

	it('keeps votes and removals inside their own event, and strangers out', () => {
		const one = night();
		const two = night();
		suggestTheme(two.id, two.a.id, 'Togas');
		const toga = listThemes(two.id, two.a.id).options[0].id;
		expect(() => voteTheme(one.id, one.a.id, toga)).toThrow('isn’t on the list');
		expect(() => removeTheme(one.id, one.host.id, toga)).toThrow('isn’t on the list');
		expect(() => lockTheme(one.id, one.host.id, toga)).toThrow('isn’t on the list');
		expect(() => voteTheme(two.id, one.a.id, toga)).toThrow('not invited');
		expect(labels(two.id, two.a)).toEqual([['Togas', 0]]);
	});

	it('the host locks one in, which closes the poll and tells everyone not out, once per choice', () => {
		const { id, host, a, b, no, maybe } = night();
		const elsewhere = night(); // someone going to a different night hears nothing
		suggestTheme(id, a.id, 'Pyjamas');
		suggestTheme(id, a.id, 'Anything but clothes');
		const [pj, abc] = listThemes(id, a.id).options.map((o) => o.id);
		expect(() => lockTheme(id, a.id, pj)).toThrow('Only the host');
		lockTheme(id, host.id, pj);
		expect(getEvent(id)!.theme).toBe('Pyjamas');
		expect(() => suggestTheme(id, b.id, 'Togas')).toThrow('locked in');
		expect(() => voteTheme(id, b.id, pj)).toThrow('locked in');
		expect(() => removeTheme(id, a.id, pj)).toThrow('locked in');
		expect(notes(a)).toEqual(['Dress code for Halloween: Pyjamas']);
		expect(notes(b)).toEqual(['Dress code for Halloween: Pyjamas']); // no reply yet: might come
		expect(notes(maybe)).toEqual(['Dress code for Halloween: Pyjamas']);
		expect(notes(no)).toEqual([]);
		expect(notes(host)).toEqual([]);
		expect(notes(elsewhere.a)).toEqual([]);
		expect(() => lockTheme(id, host.id, abc)).toThrow('locked in');
		// Reopening and locking the same one again doesn't re-announce; a different one does.
		expect(() => reopenTheme(id, a.id)).toThrow('Only the host');
		reopenTheme(id, host.id);
		voteTheme(id, b.id, pj);
		lockTheme(id, host.id, pj);
		expect(notes(a)).toHaveLength(1);
		reopenTheme(id, host.id);
		lockTheme(id, host.id, abc);
		expect(notes(a)).toEqual(['Dress code for Halloween: Pyjamas', 'Dress code for Halloween: Anything but clothes']);
	});

	it('exports and deletes your votes, and keeps your suggestions without your name', () => {
		const { id, a, b } = night();
		suggestTheme(id, a.id, 'Cowboys');
		const opt = listThemes(id, a.id).options[0].id;
		voteTheme(id, a.id, opt);
		voteTheme(id, b.id, opt);
		expect(exportData(a.id)).toMatchObject({ theme_votes: [{ event_id: id, option_id: opt }], theme_options: [{ label: 'Cowboys' }] });
		deleteAccount(a.id);
		expect(labels(id, b)).toEqual([['Cowboys', 1]]);
	});
});
