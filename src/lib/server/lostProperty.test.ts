import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { listLost, postItem, removeItem, reply, sortItem, unreply } from './lostProperty.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@lost.test`, name, 'correct-horse-9') as User;
const BEFORE = '2099-06-20T20:59';
const AFTER = '2099-06-21T11:00';
const AT = Date.parse('2099-06-21T10:00:00Z');

/** Host, Sam and Alex went; Maybe didn't. */
function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const [sam, alex, maybe] = ['Sam', 'Alex', 'Maybe'].map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		setRsvp(id, p.id, name === 'Maybe' ? 'maybe' : 'yes');
		return p;
	});
	return { id, host, sam, alex, maybe };
}
const notes = (u: User) => listNotifications(u.id, 50).filter((x) => /Lost property/.test(x.message)).map((x) => x.message);
const itemId = (id: number, u: User, text: string) => listLost(id, u.id).items.find((i) => i.text === text)!.id;

describe('lost property', () => {
	it('tells everyone else who went, and tells the poster once per person who replies', () => {
		const { id, host, sam, alex, maybe } = night();
		postItem(id, sam.id, 'lost', '  black   denim jacket ', AFTER, AT);
		postItem(id, alex.id, 'found', 'a set of keys', AFTER, AT);
		expect(notes(host)).toEqual(['Lost property: Alex found a set of keys. Yours? (Night)', 'Lost property: Sam lost black denim jacket. Seen it? (Night)']);
		expect(notes(maybe)).toEqual([]);
		expect(notes(sam)).toEqual(['Lost property: Alex found a set of keys. Yours? (Night)']);
		const jacket = itemId(id, sam, 'black denim jacket');
		reply(id, alex.id, jacket, AFTER);
		reply(id, alex.id, jacket, AFTER);
		reply(id, host.id, itemId(id, sam, 'a set of keys'), AFTER);
		expect(notes(sam).filter((m) => /has got/.test(m))).toEqual(['Lost property: Alex has got black denim jacket. (Night)']);
		expect(notes(alex).filter((m) => /theirs/.test(m))).toEqual(['Lost property: Host says it’s theirs: a set of keys. (Night)']);
		expect(() => reply(id, sam.id, jacket, AFTER)).toThrow('your own post');
		expect(() => reply(id, maybe.id, jacket, AFTER)).toThrow('Only people who went');
		expect(listLost(id, alex.id)).toMatchObject({
			items: [
				{ text: 'a set of keys', kind: 'found', name: 'Alex', replies: ['Host'], replied: false, canManage: true },
				{ text: 'black denim jacket', kind: 'lost', name: 'Sam', replies: ['Alex'], replied: true, canManage: false }
			],
			canPost: true
		});
		unreply(id, alex.id, jacket);
		expect(listLost(id, sam.id).items[1]).toMatchObject({ replies: [], replied: false });
	});

	it('opens once the night starts, for people who went, three posts an hour each', () => {
		const { id, sam, maybe } = night();
		expect(() => postItem(id, sam.id, 'lost', 'Phone', BEFORE, AT)).toThrow('once the night starts');
		expect(() => postItem(id, maybe.id, 'lost', 'Phone', AFTER, AT)).toThrow('Only people who went');
		expect(() => postItem(id, user('Stranger').id, 'lost', 'Phone', AFTER, AT)).toThrow('not invited');
		expect(() => postItem(id, sam.id, 'stolen', 'Phone', AFTER, AT)).toThrow('Lost or found');
		expect(() => postItem(id, sam.id, 'found', ' ', AFTER, AT)).toThrow('What did you find');
		expect(listLost(id, maybe.id).canPost).toBe(false);
		for (let i = 0; i < 3; i++) postItem(id, sam.id, 'lost', `Thing ${i}`, AFTER, AT + i);
		expect(() => postItem(id, sam.id, 'lost', 'One more', AFTER, AT + 3)).toThrow('posted 3 this hour');
		postItem(id, sam.id, 'lost', 'An hour later', AFTER, AT + 60 * 60_000);
	});

	it('lets the poster or host mark it sorted or take it down, and keeps nights apart', () => {
		const { id, host, sam, alex } = night();
		postItem(id, sam.id, 'lost', 'Phone', AFTER, AT);
		postItem(id, sam.id, 'lost', 'Wallet', AFTER, AT);
		const phone = itemId(id, sam, 'Phone');
		expect(() => sortItem(id, alex.id, phone, true)).toThrow('Only whoever posted it or the host');
		expect(() => removeItem(id, alex.id, phone)).toThrow('Only whoever posted it or the host');
		const wallet = itemId(id, sam, 'Wallet');
		sortItem(id, sam.id, wallet, true);
		expect(() => reply(id, alex.id, wallet, AFTER)).toThrow('been sorted');
		// Open posts come first, even when a sorted one is newer.
		expect(listLost(id, alex.id).items.map((i) => [i.text, i.sorted])).toEqual([
			['Phone', false],
			['Wallet', true]
		]);
		sortItem(id, host.id, wallet, false);
		removeItem(id, host.id, wallet);
		expect(listLost(id, alex.id).items.map((i) => i.text)).toEqual(['Phone']);
		const other = night();
		expect(() => reply(other.id, other.alex.id, phone, AFTER)).toThrow('taken down');
		expect(() => removeItem(other.id, other.host.id, phone)).toThrow('taken down');
	});

	it('goes with your account', () => {
		const { id, sam, alex } = night();
		postItem(id, sam.id, 'lost', 'Phone', AFTER, AT);
		postItem(id, alex.id, 'found', 'Keys', AFTER, AT);
		reply(id, sam.id, itemId(id, sam, 'Keys'), AFTER);
		expect(exportData(sam.id)).toMatchObject({ lost_items: [{ text: 'Phone' }], lost_replies: [{}] });
		deleteAccount(sam.id);
		expect(listLost(id, alex.id).items).toMatchObject([{ text: 'Keys', replies: [] }]);
	});
});
