import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { addPhoto, getAwards, getPredictions, hallOfFame, listPhotos, predictAward, readPhoto, voteAward } from './after.ts';
import { deleteAccount } from './account.ts';

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

	it('only take picks from people going, about people going, before the night starts', () => {
		const { id, host, a, maybe } = night();
		expect(() => predictAward(id, maybe.id, 'mvp', a.id, BEFORE)).toThrow('RSVP going');
		expect(() => predictAward(id, a.id, 'mvp', maybe.id, BEFORE)).toThrow('someone who’s going');
		expect(() => predictAward(id, a.id, 'best-dancer', host.id, BEFORE)).toThrow('Unknown award');
		expect(() => predictAward(id, a.id, 'mvp', host.id, '2099-06-20T21:00')).toThrow('closed');
		expect(getPredictions(id, maybe.id, BEFORE).canPredict).toBe(false);
	});

	it('keep everyone’s picks hidden until the night starts, then mark them against the award votes, ties counting', () => {
		const { id, host, a, b } = night();
		predictAward(id, a.id, 'mvp', b.id, BEFORE);
		predictAward(id, a.id, 'mvp', host.id, BEFORE); // changes their mind
		predictAward(id, a.id, 'worst-state', b.id, BEFORE);
		predictAward(id, b.id, 'mvp', b.id, BEFORE);
		predictAward(id, b.id, 'first-home', host.id, BEFORE);

		const before = getPredictions(id, host.id, BEFORE);
		expect(before).toMatchObject({ locked: false, count: 2, table: [], mine: {} });
		expect(getPredictions(id, a.id, BEFORE).mine).toEqual({ mvp: host.id, 'worst-state': b.id });

		const during = getPredictions(id, host.id, AFTER);
		expect(during.locked).toBe(true);
		expect(during.decided).toBe(false);
		expect(during.table.map((r) => r.name)).toEqual(['A', 'B']);

		// MVP: Host. Worst state: tie between A and B. First home: nobody voted.
		voteAward(id, a.id, 'mvp', host.id, AFTER);
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
	});

	it('are forgotten with the account of whoever made them or was picked', () => {
		const { id, host, a, b } = night();
		predictAward(id, a.id, 'mvp', b.id, BEFORE);
		predictAward(id, host.id, 'mvp', a.id, BEFORE);
		predictAward(id, host.id, 'first-home', b.id, BEFORE);
		deleteAccount(b.id);
		expect(getPredictions(id, host.id, BEFORE).count).toBe(1);
		expect(getPredictions(id, host.id, BEFORE).mine).toEqual({ mvp: a.id });
	});
});
