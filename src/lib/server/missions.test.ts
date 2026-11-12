import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { callOut, completeMission, getMissions, swapMission, takeMission } from './missions.ts';
import { listNotifications } from './notifications.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@missions.test`, name, 'correct-horse-9') as User;
// The smallest valid PNG header, enough for the upload's type check.
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'proof.png');

function night() {
	const host = user('Host');
	const [a, b, maybe] = [user('Ana'), user('Ben'), user('Maybe')];
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	for (const g of [a, b, maybe]) joinByToken(getEvent(id)!.invite_token, g.id);
	setRsvp(id, a.id, 'yes');
	setRsvp(id, b.id, 'yes');
	return { id, host, a, b, maybe };
}

/** Gives someone a specific live mission, so tests don't depend on the random deal. */
function setMission(eventId: number, userId: number, text: string, photo = false) {
	db.prepare(`UPDATE missions SET text = ?, photo = ?, points = 3 WHERE event_id = ? AND user_id = ? AND status = 'live'`).run(
		text,
		photo ? 1 : 0,
		eventId,
		userId
	);
}

describe('secret missions', () => {
	it('gives each person going one private mission that nobody else can see', () => {
		const { id, host, a, b, maybe } = night();
		expect(() => takeMission(id, maybe.id)).toThrow(/RSVP/);
		takeMission(id, a.id);
		expect(() => takeMission(id, a.id)).toThrow(/already got/);
		setMission(id, a.id, 'Get Ben to say banana');

		expect(getMissions(id, a.id).mine).toMatchObject({ text: 'Get Ben to say banana', points: 3 });
		for (const viewer of [host, b, maybe]) {
			const view = getMissions(id, viewer.id);
			expect(view.mine).toBeNull();
			expect(view.live).toBe(1);
			expect(JSON.stringify(view)).not.toContain('banana');
		}
	});

	it('names someone else going in the mission, never the person themselves', () => {
		const { id, a } = night();
		for (let i = 0; i < 2; i++) {
			takeMission(id, a.id);
			expect(getMissions(id, a.id).mine!.text).not.toContain('Ana');
			expect(getMissions(id, a.id).mine!.text).not.toContain('{');
			db.prepare(`UPDATE missions SET status = 'swapped' WHERE event_id = ? AND user_id = ?`).run(id, a.id);
		}
	});

	it('needs a photo for photo missions, scores it, and tells everyone', async () => {
		const { id, host, a } = night();
		takeMission(id, a.id);
		setMission(id, a.id, 'Get a photo of Ben mid-dance', true);
		await expect(completeMission(id, a.id, null)).rejects.toThrow(/needs a photo/);
		await completeMission(id, a.id, png());

		const view = getMissions(id, host.id);
		expect(view.settled).toEqual([expect.objectContaining({ user_id: a.id, status: 'done', points: 3, photo_id: expect.any(Number) })]);
		expect(view.scores).toEqual([{ id: a.id, name: 'Ana', points: 3 }]);
		expect(listNotifications(host.id)[0].message).toContain('pulled off a secret mission: “Get a photo of Ben mid-dance”');
		expect(getMissions(id, a.id).mine).toBeNull();
	});

	it('catches the person on a mission and scores the catcher; a wrong guess catches nobody', async () => {
		const { id, host, a, b } = night();
		takeMission(id, a.id);
		setMission(id, a.id, 'Swap seats with Ben');
		expect(() => callOut(id, a.id, a.id)).toThrow(/yourself/);

		expect(callOut(id, b.id, host.id)).toEqual({ caught: false }); // the host has no mission
		expect(() => callOut(id, b.id, host.id)).toThrow(/15 minutes/);
		expect(callOut(id, b.id, a.id)).toEqual({ caught: true });

		const view = getMissions(id, host.id);
		expect(view.settled).toEqual([expect.objectContaining({ user_id: a.id, status: 'caught', caught_by: 'Ben' })]);
		expect(view.misses).toEqual([{ name: 'Ben', suspect: 'Host' }]);
		expect(view.scores).toEqual([{ id: b.id, name: 'Ben', points: 1 }]);
		await expect(completeMission(id, a.id, null)).rejects.toThrow(/haven’t got a mission/);
		takeMission(id, a.id); // caught people can take a new one
	});

	it('allows two swaps a night', () => {
		const { id, a } = night();
		takeMission(id, a.id);
		swapMission(id, a.id);
		swapMission(id, a.id);
		expect(getMissions(id, a.id).swapsLeft).toBe(0);
		expect(() => swapMission(id, a.id)).toThrow(/No swaps/);
		expect(getMissions(id, a.id).mine).not.toBeNull();
	});
});
