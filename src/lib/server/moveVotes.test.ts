import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { castVote, closeDueVotes, getMoveVote, startVote, VOTE_MS } from './moveVotes.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@move.test`, name, 'correct-horse-9') as User;
// 9pm in London in June (BST) is 8pm UTC.
const START = Date.parse('2099-06-20T20:00:00Z');
const AT = START + 60 * 60_000;

/** Host, Sam and Alex going, Maybe not. */
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
const notes = (userId: number, match: RegExp) => listNotifications(userId, 50).filter((x) => match.test(x.message)).map((x) => x.message);
const liveId = (id: number, userId: number, at = AT) => getMoveVote(id, userId, at).live!.id;

describe('stay or move on', () => {
	it('asks everyone else going, and counts votes for 60 seconds, letting people change their mind', () => {
		const { id, host, sam, alex, maybe } = night();
		startVote(id, sam.id, '  Sub   Club ', AT);
		for (const p of [host, alex]) expect(notes(p.id, /asks/)).toEqual(['Sam asks: stay or move on to Sub Club? Vote in the next 60 seconds. (Night)']);
		expect(notes(sam.id, /asks/)).toEqual([]);
		expect(notes(maybe.id, /asks/)).toEqual([]);
		const vote = liveId(id, sam.id);
		castVote(id, host.id, vote, 'stay', AT + 1000);
		castVote(id, alex.id, vote, 'stay', AT + 2000);
		castVote(id, alex.id, vote, 'move', AT + 3000);
		castVote(id, sam.id, vote, 'move', AT + VOTE_MS - 1);
		expect(getMoveVote(id, alex.id, AT + VOTE_MS - 1).live).toMatchObject({ by: 'Sam', place: 'Sub Club', stay: 1, move: 2, mine: 'move', endsAt: AT + VOTE_MS });
		expect(() => castVote(id, host.id, vote, 'move', AT + VOTE_MS)).toThrow('closed');
		expect(() => castVote(id, maybe.id, vote, 'move', AT + 1000)).toThrow('RSVP “going”');
		expect(() => castVote(id, host.id, vote, 'maybe', AT + 1000)).toThrow('stay or move on');
	});

	it('tells everyone the result once when the time’s up, and stays quiet if nobody voted', () => {
		const { id, host, sam, alex } = night();
		startVote(id, sam.id, 'Sub Club', AT);
		const vote = liveId(id, sam.id);
		castVote(id, host.id, vote, 'move', AT);
		castVote(id, alex.id, vote, 'stay', AT);
		castVote(id, sam.id, vote, 'move', AT);
		closeDueVotes(AT + VOTE_MS - 1);
		expect(notes(sam.id, /Stay or move on:/)).toEqual([]);
		closeDueVotes(AT + VOTE_MS);
		closeDueVotes(AT + VOTE_MS + 5000);
		for (const p of [host, sam, alex]) expect(notes(p.id, /Stay or move on:/)).toEqual(['Stay or move on: move on to Sub Club (2 move, 1 stay). (Night)']);
		expect(getMoveVote(id, alex.id, AT + VOTE_MS)).toMatchObject({ live: null, last: { outcome: 'move', move: 2, stay: 1, place: 'Sub Club', mine: 'stay' }, canStart: true });
		const quiet = night();
		startVote(quiet.id, quiet.sam.id, '', AT);
		closeDueVotes(AT + VOTE_MS);
		expect(notes(quiet.alex.id, /Stay or move on:/)).toEqual([]);
		expect(getMoveVote(quiet.id, quiet.alex.id, AT + VOTE_MS).last).toMatchObject({ stay: 0, move: 0, outcome: 'tie' });
	});

	it('closes quietly after the server was down, counts only people still going, and tells the result before the next question', () => {
		const late = night();
		startVote(late.id, late.sam.id, 'Sub Club', AT);
		castVote(late.id, late.alex.id, liveId(late.id, late.sam.id), 'move', AT);
		closeDueVotes(AT + VOTE_MS + 2 * 60 * 60_000);
		expect(notes(late.alex.id, /Stay or move on:/)).toEqual([]);
		expect(getMoveVote(late.id, late.alex.id, AT + VOTE_MS + 2 * 60 * 60_000).canStart).toBe(true);

		const { id, host, sam, alex, maybe } = night();
		startVote(id, sam.id, '', AT);
		const vote = liveId(id, sam.id);
		castVote(id, alex.id, vote, 'stay', AT);
		castVote(id, host.id, vote, 'move', AT);
		setRsvp(id, alex.id, 'no');
		expect(getMoveVote(id, host.id, AT + 1).live).toMatchObject({ stay: 0, move: 1 });
		startVote(id, host.id, 'Bar', AT + VOTE_MS);
		expect(notes(sam.id, /Stay or move on:|asks/)).toEqual([
			'Host asks: stay or move on to Bar? Vote in the next 60 seconds. (Night)',
			'Stay or move on: move on (1 move, 0 stay). (Night)'
		]);
		expect(notes(maybe.id, /Stay or move on:/)).toEqual([]);
		expect(notes(alex.id, /Stay or move on:/)).toEqual([]);
		expect(() => castVote(id, user('Stranger').id, liveId(id, host.id, AT + VOTE_MS), 'move', AT + VOTE_MS)).toThrow('not invited');
	});

	it('calls stay, move on or a tie', () => {
		const result = (stay: number, move: number) => {
			const { id, host, sam, alex } = night();
			startVote(id, host.id, '', AT);
			const vote = liveId(id, host.id);
			[host, sam, alex].slice(0, stay).forEach((p) => castVote(id, p.id, vote, 'stay', AT));
			[alex, sam, host].slice(0, move).forEach((p) => castVote(id, p.id, vote, 'move', AT));
			closeDueVotes(AT + VOTE_MS);
			return [getMoveVote(id, host.id, AT + VOTE_MS).last!.outcome, notes(sam.id, /Stay or move on:/)[0]];
		};
		expect(result(2, 1)).toEqual(['stay', 'Stay or move on: stay put (1 move, 2 stay). (Night)']);
		expect(result(1, 1)).toEqual(['tie', 'Stay or move on: it’s a tie (1 move, 1 stay). (Night)']);
		expect(result(0, 1)).toEqual(['move', 'Stay or move on: move on (1 move, 0 stay). (Night)']);
	});

	it('runs one at a time, during the night, and each person can ask 3 times an hour', () => {
		const { id, host, sam, maybe } = night();
		expect(() => startVote(id, sam.id, '', START - 1)).toThrow('once the night has started');
		expect(() => startVote(id, sam.id, '', START + 12 * 60 * 60_000)).toThrow('over');
		expect(() => startVote(id, maybe.id, '', AT)).toThrow('RSVP “going”');
		expect(() => startVote(id, user('Stranger').id, '', AT)).toThrow('not invited');
		expect(getMoveVote(id, sam.id, START - 1)).toMatchObject({ canStart: false, over: false });
		expect(getMoveVote(id, sam.id, START + 12 * 60 * 60_000)).toMatchObject({ canStart: false, over: true });
		startVote(id, sam.id, '', START);
		expect(() => startVote(id, host.id, '', START + VOTE_MS - 1)).toThrow('already a vote');
		expect(getMoveVote(id, host.id, START + VOTE_MS - 1).canStart).toBe(false);
		startVote(id, sam.id, '', START + VOTE_MS);
		startVote(id, sam.id, '', START + 2 * VOTE_MS);
		expect(() => startVote(id, sam.id, '', START + 3 * VOTE_MS)).toThrow('3 times this hour');
		startVote(id, host.id, '', START + 3 * VOTE_MS);
		startVote(id, sam.id, '', START + 60 * 60_000 + 1);
	});

	it('shows the last result for an hour, and keeps votes to their own night', () => {
		const { id, sam, alex } = night();
		startVote(id, sam.id, '', AT);
		const vote = liveId(id, sam.id);
		const other = night();
		expect(() => castVote(other.id, other.sam.id, vote, 'move', AT)).toThrow('isn’t on');
		castVote(id, alex.id, vote, 'move', AT);
		expect(getMoveVote(id, alex.id, AT + VOTE_MS + 60 * 60_000 - 1).last).not.toBeNull();
		expect(getMoveVote(id, alex.id, AT + VOTE_MS + 60 * 60_000).last).toBeNull();
	});

	it('removes your votes and the ones you started when you delete your account', () => {
		const { id, host, sam, alex } = night();
		startVote(id, sam.id, '', AT);
		castVote(id, alex.id, liveId(id, sam.id), 'move', AT);
		deleteAccount(sam.id);
		expect(getMoveVote(id, host.id, AT)).toMatchObject({ live: null, last: null });
		startVote(id, host.id, '', AT + 1000);
		castVote(id, alex.id, liveId(id, host.id, AT + 1000), 'stay', AT + 1000);
		deleteAccount(alex.id);
		expect(getMoveVote(id, host.id, AT + 1000).live).toMatchObject({ stay: 0, move: 0 });
	});
});
