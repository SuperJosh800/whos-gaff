import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { addPhoto, getAwards, getPredictions, hallOfFame, listPhotos, readPhoto, savePredictions, voteAward } from './after.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@after.test`, name, 'correct-horse-9') as User;
const AFTER = '2099-06-21T12:00';

function night(title = 'Night') {
	const host = user('Host');
	const [a, b, maybe] = [user('A'), user('B'), user('Maybe')];
	const id = createEvent(host.id, { title, mode: 'fixed', startsAt: '2099-06-20T21:00' });
	for (const g of [a, b, maybe]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, a.id, 'yes');
	setRsvp(id, b.id, 'yes');
	setRsvp(id, maybe.id, 'maybe');
	return { id, host, a, b, maybe };
}

describe('awards', () => {
	it('opens after the night starts, only for people who went', () => {
		const { id, host, a, maybe } = night();
		expect(() => voteAward(id, a.id, 'mvp', host.id, '2099-06-20T20:59')).toThrow('once the night has started');
		expect(() => voteAward(id, maybe.id, 'mvp', host.id, AFTER)).toThrow('Only people who went');
		expect(() => voteAward(id, a.id, 'mvp', maybe.id, AFTER)).toThrow('someone who was there');
	});

	it('picks the most-voted person per award, shares ties, and adds winners to their hall of fame', () => {
		const { id, host, a, b } = night('Big night');
		voteAward(id, host.id, 'mvp', a.id, AFTER);
		voteAward(id, b.id, 'mvp', a.id, AFTER);
		voteAward(id, a.id, 'mvp', b.id, AFTER);
		voteAward(id, host.id, 'worst-state', a.id, AFTER);
		voteAward(id, a.id, 'worst-state', b.id, AFTER);
		voteAward(id, b.id, 'first-home', host.id, AFTER);
		voteAward(id, b.id, 'first-home', a.id, AFTER); // B changes their vote

		const winners = Object.fromEntries(getAwards(id, host.id).awards.map((x) => [x.key, x.winners.map((w) => w.name)]));
		expect(winners).toEqual({ mvp: ['A'], 'worst-state': ['A', 'B'], 'first-home': ['A'] });
		expect(hallOfFame(a.id).map((h) => h.label).sort()).toEqual(['MVP', 'First to go home', 'Worst state'].sort());
		expect(hallOfFame(host.id)).toEqual([]);
		expect(getAwards(id, b.id).awards.find((x) => x.key === 'first-home')?.myVote).toBe(a.id);
	});
});

describe('photos', () => {
	it('stores real images and rejects other files whatever their name says', async () => {
		const { id, a } = night();
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
		await addPhoto(id, a.id, new File([png], 'pic.png'));
		await expect(addPhoto(id, a.id, new File(['<script>'], 'evil.png', { type: 'image/png' }))).rejects.toThrow('JPEG, PNG');
		const [photo] = listPhotos(id);
		expect(listPhotos(id)).toHaveLength(1);
		expect(readPhoto(id, photo.id)).toMatchObject({ mime: 'image/png' });
		expect(readPhoto(id + 1, photo.id)).toBeNull();
	});
});

describe('predictions', () => {
	const BEFORE = '2099-06-20T18:00';
	const predict = (id: number, userId: number, picks: Record<string, string | number>, now = BEFORE) =>
		savePredictions(id, userId, Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, String(v)])), now);

	it('only take picks from people going, about people going, once the date is set and before the night starts', () => {
		const { id, host, a, maybe } = night();
		expect(() => predict(id, maybe.id, { mvp: a.id })).toThrow('RSVP going');
		expect(() => predict(id, a.id, { mvp: maybe.id })).toThrow('someone who’s going');
		expect(() => predict(id, a.id, { 'best-dancer': host.id })).toThrow('Unknown award');
		expect(() => predict(id, a.id, { mvp: host.id }, '2099-06-20T21:00')).toThrow('closed');
		expect(getPredictions(id, maybe.id, BEFORE).canPredict).toBe(false);

		const poll = createEvent(host.id, { title: 'Poll', mode: 'poll', options: ['2099-07-01T20:00', '2099-07-02T20:00'] });
		expect(() => predict(poll, host.id, { mvp: host.id })).toThrow('once the date is set');
		expect(getPredictions(poll, host.id, BEFORE).open).toBe(false);
	});

	it('save all picks or none, and clear a pick left empty', () => {
		const { id, host, a, b, maybe } = night();
		predict(id, a.id, { mvp: b.id, 'worst-state': b.id });
		expect(() => predict(id, a.id, { mvp: host.id, 'worst-state': maybe.id })).toThrow();
		expect(getPredictions(id, a.id, BEFORE).mine).toEqual({ mvp: b.id, 'worst-state': b.id });
		predict(id, a.id, { mvp: host.id, 'worst-state': '' });
		expect(getPredictions(id, a.id, BEFORE).mine).toEqual({ mvp: host.id });
	});

	it('keep everyone’s picks hidden until the night starts, then mark them against the award winners, ties counting', () => {
		const { id, host, a, b } = night();
		predict(id, a.id, { mvp: host.id, 'worst-state': b.id });
		predict(id, b.id, { mvp: b.id, 'first-home': host.id });

		const before = getPredictions(id, host.id, BEFORE);
		expect(before).toMatchObject({ locked: false, count: 2, table: [], mine: {} });
		const during = getPredictions(id, host.id, AFTER);
		expect(during).toMatchObject({ locked: true, decided: false });
		expect(during.table.map((r) => r.name)).toEqual(['A', 'B']);

		// MVP: Host 2 votes, B 1 (B's own pick only got a vote, not the award). Worst state: A and B tie. First home: nobody.
		voteAward(id, a.id, 'mvp', host.id, AFTER);
		voteAward(id, host.id, 'mvp', host.id, AFTER);
		voteAward(id, b.id, 'mvp', b.id, AFTER);
		voteAward(id, a.id, 'worst-state', a.id, AFTER);
		voteAward(id, b.id, 'worst-state', b.id, AFTER);
		const after = getPredictions(id, host.id, AFTER);
		expect(after.decided).toBe(true);
		expect(after.table.map((r) => [r.name, r.score])).toEqual([['A', 2], ['B', 0]]);
		expect(after.table[0].cells).toEqual([
			{ award: 'mvp', nominee: 'Host', right: true },
			{ award: 'first-home', nominee: null, right: false },
			{ award: 'worst-state', nominee: 'B', right: true }
		]);
		expect(after.table[1].cells[0]).toEqual({ award: 'mvp', nominee: 'B', right: false });
	});

	it('drop picks by or about someone who stops going', () => {
		const { id, host, a, b } = night();
		predict(id, a.id, { mvp: b.id, 'first-home': host.id });
		predict(id, b.id, { mvp: host.id });
		setRsvp(id, b.id, 'no');
		const p = getPredictions(id, host.id, AFTER);
		expect(p.count).toBe(1);
		expect(p.table.map((r) => [r.name, r.cells.map((c) => c.nominee)])).toEqual([['A', [null, 'Host', null]]]);
		expect(getPredictions(id, a.id, BEFORE).mine).toEqual({ 'first-home': host.id });
	});

	it('only show up in your export as picks about you once the night has started', () => {
		const { id, host, a } = night();
		predict(id, host.id, { mvp: a.id });
		expect(exportData(a.id)['predictions (nominee_id)']).toEqual([]);
		expect(exportData(host.id).predictions).toEqual([{ event_id: id, user_id: host.id, award: 'mvp', nominee_id: a.id }]);
		const past = createEvent(host.id, { title: 'Past', mode: 'fixed', startsAt: '2099-01-01T20:00' });
		joinByToken(getEvent(past)!.invite_token, a.id);
		setRsvp(past, a.id, 'yes');
		predict(past, host.id, { mvp: a.id }, '2098-12-31T20:00');
		// exportData uses the real clock, so move the night into the past.
		db.prepare("UPDATE events SET starts_at = '2000-01-01T20:00' WHERE id = ?").run(past);
		expect(exportData(a.id)['predictions (nominee_id)']).toEqual([{ event_id: past, award: 'mvp' }]);
	});

	it('are forgotten with the account of whoever made them or was picked', () => {
		const { id, host, a, b } = night();
		predict(id, a.id, { mvp: b.id, 'first-home': host.id });
		predict(id, b.id, { mvp: a.id });
		predict(id, host.id, { mvp: a.id });
		deleteAccount(b.id);
		expect(db.prepare('SELECT user_id, award, nominee_id FROM predictions WHERE event_id = ? ORDER BY user_id').all(id)).toEqual([
			{ user_id: host.id, award: 'mvp', nominee_id: a.id },
			{ user_id: a.id, award: 'first-home', nominee_id: host.id }
		].sort((x, y) => x.user_id - y.user_id));
	});
});
