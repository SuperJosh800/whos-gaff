import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { armDrop, cancelDrop, DROP_MS, fireDueDrops, getDrops, MAX_DROPS, sendDropPhoto } from './photoDrops.ts';
import { listNotifications } from './notifications.ts';
import { listPhotos } from './after.ts';
import { deleteAccount } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@drops.test`, name, 'correct-horse-9') as User;
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'drop.png');
// 9pm in London in June (BST) is 8pm UTC.
const START = Date.parse('2099-06-20T20:00:00Z');
const MIN = 60_000;

/** Host, Sam and Alex going, Maybe not, on a night starting at START. */
function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const [sam, alex, maybe] = ['Sam', 'Alex', 'Maybe'].map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		return p;
	});
	setRsvp(id, sam.id, 'yes');
	setRsvp(id, alex.id, 'yes');
	setRsvp(id, maybe.id, 'maybe');
	return { id, host, sam, alex, maybe };
}
const notes = (userId: number) => listNotifications(userId, 50).filter((x) => /Photo drop!/.test(x.message)).map((x) => x.message);
const liveId = (id: number, userId: number, at: number) => getDrops(id, userId, at).live!.id;

describe('photo drop', () => {
	it('goes off at a random moment between 15 minutes and 2 hours after the start, keeping the time secret', () => {
		const early = START - 60 * MIN;
		const a = night();
		armDrop(a.id, a.host.id, 'random', early, () => 0);
		expect(getDrops(a.id, a.sam.id, START + 15 * MIN - 1)).toMatchObject({ waiting: true, live: null, done: [] });
		expect(getDrops(a.id, a.sam.id, START + 15 * MIN).live).not.toBeNull();
		expect(JSON.stringify(getDrops(a.id, a.sam.id, early))).not.toContain(String(START + 15 * MIN));
		const b = night();
		armDrop(b.id, b.host.id, 'random', START + 30 * MIN, () => 1);
		expect(getDrops(b.id, b.sam.id, START + 150 * MIN - 1).waiting).toBe(true);
		expect(getDrops(b.id, b.sam.id, START + 150 * MIN).live).not.toBeNull();
	});

	it('is only for the host, once there’s a date, until 12 hours after the start', () => {
		const { id, host, sam } = night();
		expect(() => armDrop(id, sam.id, 'now', START)).toThrow('Only the host');
		expect(() => armDrop(id, host.id, 'now', START - MIN)).toThrow('once the night has started');
		expect(() => armDrop(id, host.id, 'random', START + 12 * 60 * MIN)).toThrow('over');
		const poll = createEvent(host.id, { title: 'Poll', mode: 'poll', options: ['2099-06-20T21:00', '2099-06-21T21:00'] });
		expect(() => armDrop(poll, host.id, 'random', START)).toThrow('Set a date');
	});

	it('tells everyone going once when it goes off, and nobody if it was missed', () => {
		const { id, host, sam, alex, maybe } = night();
		armDrop(id, host.id, 'random', START, () => 0);
		const at = START + 15 * MIN;
		fireDueDrops(at - 1);
		expect(notes(sam.id)).toEqual([]);
		fireDueDrops(at);
		fireDueDrops(at + 10_000);
		for (const p of [host, sam, alex]) expect(notes(p.id)).toEqual(['Photo drop! Take a photo in the next 2 minutes. (Night)']);
		expect(notes(maybe.id)).toEqual([]);
		const missed = night();
		armDrop(missed.id, missed.host.id, 'random', START, () => 0);
		fireDueDrops(at + DROP_MS);
		expect(notes(missed.sam.id)).toEqual([]);
	});

	it('takes one photo each from people going, only during the 2 minutes (plus 30 seconds to upload)', async () => {
		const { id, host, sam, alex, maybe } = night();
		armDrop(id, host.id, 'random', START, () => 0);
		const at = START + 15 * MIN;
		const drop = liveId(id, sam.id, at);
		await expect(sendDropPhoto(id, sam.id, drop, png(), at - 1)).rejects.toThrow('hasn’t started');
		await sendDropPhoto(id, sam.id, drop, png(), at + 1000);
		await expect(sendDropPhoto(id, sam.id, drop, png(), at + 2000)).rejects.toThrow('already sent');
		await expect(sendDropPhoto(id, maybe.id, drop, png(), at + 2000)).rejects.toThrow('RSVP “going”');
		await expect(sendDropPhoto(id, user('Stranger').id, drop, png(), at + 2000)).rejects.toThrow('not invited');
		await expect(sendDropPhoto(id, alex.id, drop, null, at + 2000)).rejects.toThrow('Take a photo');
		await sendDropPhoto(id, alex.id, drop, png(), at + DROP_MS + 30_000);
		await expect(sendDropPhoto(id, host.id, drop, png(), at + DROP_MS + 30_001)).rejects.toThrow('Too late');
		const other = night();
		await expect(sendDropPhoto(other.id, other.sam.id, drop, png(), at + 1000)).rejects.toThrow('hasn’t started');
	});

	it('keeps the photos hidden until the time’s up, then shows them together and in the recap', async () => {
		const { id, host, sam, alex } = night();
		armDrop(id, host.id, 'now', START + 60 * MIN);
		const at = START + 60 * MIN;
		const drop = liveId(id, sam.id, at);
		await sendDropPhoto(id, sam.id, drop, png(), at + 1000);
		expect(getDrops(id, alex.id, at + 2000)).toMatchObject({ live: { sent: 1, mine: false }, done: [] });
		expect(getDrops(id, sam.id, at + 2000).live!.mine).toBe(true);
		const after = getDrops(id, alex.id, at + DROP_MS);
		expect(after.live).toBeNull();
		expect(after.done).toEqual([{ id: drop, at: '2099-06-20T22:00', photos: [{ id: expect.any(Number), name: 'Sam' }] }]);
		expect(listPhotos(id).map((p) => p.name)).toEqual(['Sam']);
		expect(notes(sam.id)).toHaveLength(1);
	});

	it(`runs one at a time, up to ${MAX_DROPS} a night, and the host can call off one that hasn’t gone off`, () => {
		const { id, host, sam } = night();
		armDrop(id, host.id, 'random', START, () => 0);
		expect(() => armDrop(id, host.id, 'now', START)).toThrow('already a photo drop');
		expect(() => cancelDrop(id, sam.id)).toThrow('Only the host');
		cancelDrop(id, host.id, START);
		expect(getDrops(id, sam.id, START).waiting).toBe(false);
		let at = START;
		for (let i = 0; i < MAX_DROPS; i++) {
			armDrop(id, host.id, 'now', at);
			expect(() => armDrop(id, host.id, 'now', at + DROP_MS - 1)).toThrow('already a photo drop');
			cancelDrop(id, host.id, at + 1); // too late to call off a drop that's running
			expect(getDrops(id, sam.id, at + 1).live).not.toBeNull();
			at += DROP_MS;
		}
		expect(getDrops(id, host.id, at).canArm).toBe(false);
		expect(() => armDrop(id, host.id, 'now', at)).toThrow(`${MAX_DROPS} photo drops`);
	});

	it('drops your photo from the drop when you delete your account', async () => {
		const { id, host, sam } = night();
		armDrop(id, host.id, 'now', START);
		const drop = liveId(id, sam.id, START);
		await sendDropPhoto(id, sam.id, drop, png(), START);
		await sendDropPhoto(id, host.id, drop, png(), START);
		deleteAccount(sam.id);
		expect(getDrops(id, host.id, START + DROP_MS).done[0].photos.map((p) => p.name)).toEqual(['Host']);
	});
});
