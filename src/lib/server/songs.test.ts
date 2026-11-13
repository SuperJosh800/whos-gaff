import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken } from './events.ts';
import { listSongs, markSongAdded, MAX_EACH, MAX_SONGS, removeSong, requestSong, voteSong } from './songs.ts';
import { listNotifications } from './notifications.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@songs.test`, name, 'correct-horse-9') as User;

function night() {
	const host = user('Host');
	const id = createEvent(host.id, { title: 'Night', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	const [sam, alex] = ['Sam', 'Alex'].map((name) => {
		const p = user(name);
		joinByToken(getEvent(id)!.invite_token, p.id);
		return p;
	});
	return { id, host, sam, alex };
}
const ranked = (id: number, userId: number) => listSongs(id, userId).map((s) => `${s.title}:${s.votes}`);
const songId = (id: number, userId: number, title: string) => listSongs(id, userId).find((s) => s.title === title)!.id;
const notes = (userId: number) => listNotifications(userId, 50).filter((x) => /in the playlist/.test(x.message)).map((x) => x.message);

describe('song requests', () => {
	it('ranks songs by how many want them, counting whoever added it', () => {
		const { id, host, sam, alex } = night();
		requestSong(id, sam.id, 'Mr Brightside', 'The Killers');
		requestSong(id, alex.id, 'Dancing Queen', 'ABBA');
		expect(ranked(id, sam.id)).toEqual(['Mr Brightside:1', 'Dancing Queen:1']);
		voteSong(id, host.id, songId(id, host.id, 'Dancing Queen'), true);
		voteSong(id, host.id, songId(id, host.id, 'Dancing Queen'), true);
		expect(ranked(id, sam.id)).toEqual(['Dancing Queen:2', 'Mr Brightside:1']);
		const [top] = listSongs(id, host.id);
		expect(top).toMatchObject({ voters: expect.stringContaining('Host'), mine: true, artist: 'ABBA' });
		expect(listSongs(id, sam.id)[0].mine).toBe(false);
		voteSong(id, alex.id, top.id, false);
		// A tie goes to whichever was added first.
		expect(ranked(id, sam.id)).toEqual(['Mr Brightside:1', 'Dancing Queen:1']);
	});

	it('spots the same song however it’s typed, but not the same title by someone else', () => {
		const { id, sam, alex } = night();
		requestSong(id, sam.id, 'Mr. Brightside', 'The Killers');
		expect(() => requestSong(id, alex.id, 'mr brightside', 'the killers!')).toThrow('already on the list');
		requestSong(id, alex.id, 'Hallelujah', 'Leonard Cohen');
		requestSong(id, sam.id, 'Hallelujah', 'Jeff Buckley');
		requestSong(id, sam.id, 'Eple', 'Röyksopp');
		expect(() => requestSong(id, alex.id, 'EPLE', 'Royksopp')).toThrow('already on the list');
		expect(listSongs(id, sam.id)).toHaveLength(4);
	});

	it('checks the song and artist', () => {
		const { id, sam } = night();
		expect(() => requestSong(id, sam.id, '  ', 'ABBA')).toThrow('name of the song');
		expect(() => requestSong(id, sam.id, 'x'.repeat(61), '')).toThrow('60 characters');
		expect(() => requestSong(id, sam.id, 'Song', '...')).toThrow('who it’s by');
		requestSong(id, sam.id, '  Wonderwall  ', '   ');
		expect(listSongs(id, sam.id)[0]).toMatchObject({ title: 'Wonderwall', artist: '', spotify: 'https://open.spotify.com/search/Wonderwall' });
		requestSong(id, sam.id, 'Don’t Stop Me Now', 'Queen & Co');
		expect(listSongs(id, sam.id).find((s) => s.artist)!.spotify).toBe(
			`https://open.spotify.com/search/${encodeURIComponent('Don’t Stop Me Now Queen & Co')}`
		);
	});

	it(`caps each person at ${MAX_EACH} and the list at ${MAX_SONGS}`, () => {
		const { id, host, sam } = night();
		for (let i = 0; i < MAX_EACH; i++) requestSong(id, sam.id, `Sam ${i}`, '');
		expect(() => requestSong(id, sam.id, 'One more', '')).toThrow(`added ${MAX_EACH} already`);
		removeSong(id, sam.id, songId(id, sam.id, 'Sam 0'));
		requestSong(id, sam.id, 'One more', '');
		for (let i = MAX_EACH; i < MAX_SONGS; i++) {
			const p = user(`P${i}`);
			joinByToken(getEvent(id)!.invite_token, p.id);
			requestSong(id, p.id, `Song ${i}`, '');
		}
		expect(listSongs(id, host.id)).toHaveLength(MAX_SONGS);
		expect(() => requestSong(id, host.id, 'Too many', '')).toThrow('list is full');
	});

	it('lets only whoever added a song, or the host, remove it', () => {
		const { id, host, sam, alex } = night();
		requestSong(id, sam.id, 'A', '');
		requestSong(id, sam.id, 'B', '');
		expect(() => removeSong(id, alex.id, songId(id, sam.id, 'A'))).toThrow('Only whoever added it');
		expect(listSongs(id, alex.id).map((s) => s.canRemove)).toEqual([false, false]);
		removeSong(id, sam.id, songId(id, sam.id, 'A'));
		removeSong(id, host.id, songId(id, sam.id, 'B'));
		expect(listSongs(id, sam.id)).toEqual([]);
	});

	it('lets the host mark songs as in the playlist, telling whoever asked the first time', () => {
		const { id, host, sam } = night();
		requestSong(id, sam.id, 'Mr Brightside', '');
		requestSong(id, host.id, 'Host pick', '');
		const song = songId(id, sam.id, 'Mr Brightside');
		expect(() => markSongAdded(id, sam.id, song, true)).toThrow('Only the host');
		markSongAdded(id, host.id, song, true);
		expect(listSongs(id, sam.id).find((s) => s.id === song)!.added).toBe(true);
		markSongAdded(id, host.id, song, false);
		expect(listSongs(id, sam.id).find((s) => s.id === song)!.added).toBe(false);
		markSongAdded(id, host.id, song, true);
		expect(notes(sam.id)).toEqual(['Your song request “Mr Brightside” is in the playlist for Night.']);
		markSongAdded(id, host.id, songId(id, host.id, 'Host pick'), true);
		expect(notes(host.id)).toEqual([]);
	});

	it('keeps songs to the people invited, and to their own event', () => {
		const { id, host, sam } = night();
		const other = night();
		requestSong(id, sam.id, 'Mine', '');
		const song = songId(id, sam.id, 'Mine');
		const stranger = user('Stranger');
		expect(() => listSongs(id, stranger.id)).toThrow('not invited');
		expect(() => requestSong(id, stranger.id, 'X', '')).toThrow('not invited');
		expect(() => voteSong(id, stranger.id, song, true)).toThrow('not invited');
		expect(() => voteSong(other.id, other.sam.id, song, true)).toThrow('isn’t on the list');
		expect(() => removeSong(other.id, other.host.id, song)).toThrow('isn’t on the list');
		expect(() => markSongAdded(other.id, other.host.id, song, true)).toThrow('isn’t on the list');
		expect(ranked(id, host.id)).toEqual(['Mine:1']);
	});

	it('is in your data download and goes when you delete your account', () => {
		const { id, host, sam } = night();
		requestSong(id, sam.id, 'Mine', '');
		requestSong(id, host.id, 'Theirs', '');
		voteSong(id, sam.id, songId(id, host.id, 'Theirs'), true);
		const data = exportData(sam.id);
		expect((data.song_requests as { title: string }[]).map((s) => s.title)).toEqual(['Mine']);
		expect(data.song_votes as unknown[]).toHaveLength(2);
		deleteAccount(sam.id);
		expect(ranked(id, host.id)).toEqual(['Theirs:1']);
	});
});
