import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createGroup, joinGroupByToken } from './groups.ts';
import { createEvent } from './events.ts';
import { addQuote, getWall, QUOTES_PER_HOUR, removeQuote, topQuote, voteQuote } from './quotes.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@quotes.test`, name, 'correct-horse-9') as User;
const token = (id: number) => (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;
const AT = Date.parse('2099-06-21T10:00:00Z');

/** Ana made the group; Ben, Cal and Dee joined. */
function crew() {
	const [ana, ben, cal, dee] = ['Ana', 'Ben', 'Cal', 'Dee'].map(user);
	const id = createGroup(ana.id, 'Flat 2/1');
	for (const u of [ben, cal, dee]) joinGroupByToken(token(id), u.id);
	return { id, ana, ben, cal, dee };
}
const notes = (u: User) => listNotifications(u.id, 50).filter((x) => /quotes wall/.test(x.message)).map((x) => x.message);
const texts = (id: number, u: User, sort: 'top' | 'new' = 'top') => getWall(id, u.id, sort).quotes.map((q) => q.text);
const quoteId = (id: number, u: User, text: string) => getWall(id, u.id, 'new').quotes.find((q) => q.text === text)!.id;

describe('quotes wall', () => {
	it('posts a tidied quote, tells whoever said it, and tags one of the group’s nights', () => {
		const { id, ana, ben, cal } = crew();
		const night = createEvent(ana.id, { title: 'Pub crawl', mode: 'fixed', startsAt: '2099-06-20T21:00', groupId: id });
		addQuote(id, ana.id, ben.id, '  “I’m only   staying for one.”  ', night, AT);
		addQuote(id, cal.id, cal.id, 'I said what I said', null, AT);
		expect(notes(ben)).toEqual(['Ana put you on the quotes wall in Flat 2/1: “I’m only staying for one.”']);
		expect(notes(cal)).toEqual([]);
		expect(getWall(id, ben.id, 'new', '2099-06-21T00:00')).toMatchObject({
			nights: [{ id: night, title: 'Pub crawl' }],
			quotes: [
				{ text: 'I said what I said', said_by_name: 'Cal', night: null },
				{ text: 'I’m only staying for one.', said_by_name: 'Ben', poster: 'Ana', night: 'Pub crawl' }
			]
		});
		// Nights that haven't happened yet aren't offered.
		expect(getWall(id, ben.id, 'new', '2099-06-20T20:59').nights).toEqual([]);
	});

	it('refuses outsiders, people not in the group, other groups’ nights and empty quotes', () => {
		const { id, ana, ben } = crew();
		const stranger = user('Stranger');
		const other = crew();
		const theirs = createEvent(other.ana.id, { title: 'Theirs', mode: 'fixed', startsAt: '2099-06-20T21:00', groupId: other.id });
		expect(() => addQuote(id, stranger.id, ana.id, 'Hi', null, AT)).toThrow('not in that group');
		expect(() => addQuote(id, ana.id, stranger.id, 'Hi', null, AT)).toThrow('Pick who said it');
		expect(() => addQuote(id, ana.id, ben.id, 'Hi', theirs, AT)).toThrow('group’s nights');
		expect(() => addQuote(id, ana.id, ben.id, ' “” ', null, AT)).toThrow('What did they say');
		addQuote(id, ana.id, ben.id, 'Mine', null, AT);
		const q = quoteId(id, ana, 'Mine');
		expect(() => voteQuote(other.id, other.ben.id, q, true)).toThrow('taken down');
		expect(() => voteQuote(id, stranger.id, q, true)).toThrow('not in that group');
		expect(() => removeQuote(other.id, other.ana.id, q)).toThrow('taken down');
	});

	it('counts one vote each, not from whoever posted or said it, and sorts by votes then newest', () => {
		const { id, ana, ben, cal, dee } = crew();
		addQuote(id, ana.id, ben.id, 'Old', null, AT);
		addQuote(id, ana.id, ben.id, 'Middle', null, AT);
		addQuote(id, ana.id, ben.id, 'New', null, AT);
		const old = quoteId(id, ana, 'Old');
		voteQuote(id, cal.id, old, true);
		voteQuote(id, cal.id, old, true);
		voteQuote(id, dee.id, quoteId(id, ana, 'Middle'), true);
		voteQuote(id, dee.id, old, true);
		expect(() => voteQuote(id, ana.id, old, true)).toThrow('your own');
		expect(() => voteQuote(id, ben.id, old, true)).toThrow('your own');
		expect(getWall(id, cal.id, 'top').quotes.map((q) => [q.text, q.votes, q.voted])).toEqual([
			['Old', 2, true],
			['Middle', 1, false],
			['New', 0, false]
		]);
		expect(texts(id, cal, 'new')).toEqual(['New', 'Middle', 'Old']);
		expect(topQuote(id)).toMatchObject({ text: 'Old', votes: 2 });
		voteQuote(id, cal.id, old, false);
		voteQuote(id, dee.id, old, false);
		// A tie goes to the newest.
		expect(texts(id, cal)).toEqual(['Middle', 'New', 'Old']);
		voteQuote(id, cal.id, quoteId(id, ana, 'Old'), true);
		expect(topQuote(id)).toMatchObject({ text: 'Middle', votes: 1 });
		expect(getWall(id, ana.id, 'top').quotes.find((q) => q.text === 'Old')).toMatchObject({ canVote: false, voted: false, votes: 1 });
	});

	it('lets whoever posted it, whoever said it or the group’s creator take a quote down, and it still counts to the limit', () => {
		const { id, ana, ben, cal, dee } = crew();
		for (const t of ['A', 'B', 'C']) addQuote(id, ben.id, cal.id, t, null, AT);
		expect(() => removeQuote(id, dee.id, quoteId(id, dee, 'A'))).toThrow('Only whoever posted it');
		removeQuote(id, ben.id, quoteId(id, dee, 'A'));
		removeQuote(id, cal.id, quoteId(id, dee, 'B'));
		const c = quoteId(id, dee, 'C');
		removeQuote(id, ana.id, c);
		expect(texts(id, dee)).toEqual([]);
		expect(topQuote(id)).toBeNull();
		expect(() => voteQuote(id, dee.id, c, true)).toThrow('taken down');
		for (let i = 3; i < QUOTES_PER_HOUR; i++) addQuote(id, ben.id, cal.id, `Q${i}`, null, AT + 1000);
		expect(() => addQuote(id, ben.id, cal.id, 'One too many', null, AT + 2000)).toThrow(`posted ${QUOTES_PER_HOUR}`);
		addQuote(id, ben.id, cal.id, 'An hour later', null, AT + 60 * 60_000);
		expect(notes(cal)).toHaveLength(QUOTES_PER_HOUR + 1);
	});

	it('removes quotes someone posted or said, and their votes, with their account, and exports them', () => {
		const { id, ana, ben, cal, dee } = crew();
		addQuote(id, ana.id, ben.id, 'Said by Ben', null, AT);
		addQuote(id, ben.id, cal.id, 'Posted by Ben', null, AT);
		addQuote(id, cal.id, dee.id, 'Neither', null, AT);
		voteQuote(id, ben.id, quoteId(id, ana, 'Neither'), true);
		expect(exportData(ben.id)).toMatchObject({ 'quotes (poster_id)': [{ text: 'Posted by Ben' }], 'quotes (said_by)': [{ text: 'Said by Ben' }], quote_votes: [{}] });
		deleteAccount(ben.id);
		expect(getWall(id, ana.id, 'top').quotes.map((q) => [q.text, q.votes])).toEqual([['Neither', 0]]);
	});
});
