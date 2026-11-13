// Song requests: anyone invited adds songs and ticks the ones they want, so the most wanted rise to the
// top. The host adds the top ones to the event's playlist and marks them as in it.
import { db } from './db.ts';
import { publish } from './realtime.ts';
import { notify } from './notifications.ts';
import { EventError, requireHost, requireMember } from './events.ts';
import { cleanLabel } from './themes.ts';

export const MAX_SONGS = 50;
/** So one person can't fill the list. */
export const MAX_EACH = 5;

/** Spelling, case, accents and punctuation don't make a different song. */
function songKey(title: string, artist: string) {
	const tidy = (s: string) =>
		s
			.normalize('NFKD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim();
	return `${tidy(title)}|${tidy(artist)}`;
}

function requireSong(eventId: number, songId: number) {
	const song = db.prepare('SELECT id, title, suggested_by, added, added_told FROM song_requests WHERE id = ? AND event_id = ?').get(songId, eventId) as
		| { id: number; title: string; suggested_by: number; added: number; added_told: number }
		| undefined;
	if (!song) throw new EventError('That song isn’t on the list any more.');
	return song;
}

/** The requests, most wanted first, with who wants each and a Spotify search link. */
export function listSongs(eventId: number, userId: number) {
	const event = requireMember(eventId, userId);
	const rows = db
		.prepare(
			`SELECT s.id, s.title, s.artist, s.suggested_by, s.added, COUNT(v.user_id) AS votes,
				group_concat(u.name, ', ') AS voters, MAX(v.user_id = ?) AS mine
			 FROM song_requests s
			 LEFT JOIN song_votes v ON v.song_id = s.id
			 LEFT JOIN users u ON u.id = v.user_id
			 WHERE s.event_id = ? GROUP BY s.id ORDER BY votes DESC, s.id`
		)
		.all(userId, eventId) as {
		id: number;
		title: string;
		artist: string;
		suggested_by: number;
		added: number;
		votes: number;
		voters: string | null;
		mine: number | null;
	}[];
	return rows.map((s) => ({
		id: s.id,
		title: s.title,
		artist: s.artist,
		votes: s.votes,
		voters: s.voters ?? '',
		mine: !!s.mine,
		added: !!s.added,
		canRemove: s.suggested_by === userId || event.host_id === userId,
		spotify: `https://open.spotify.com/search/${encodeURIComponent(`${s.title} ${s.artist}`.trim())}`
	}));
}

/** Adds a song. Whoever adds it is counted as wanting it. */
export function requestSong(eventId: number, userId: number, title: string, artist: string) {
	requireMember(eventId, userId);
	title = cleanLabel(title, 'Type the name of the song.');
	artist = artist.trim() ? cleanLabel(artist, 'Type who it’s by, or leave it blank.') : '';
	const { n, mine } = db
		.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(suggested_by = ?), 0) AS mine FROM song_requests WHERE event_id = ?')
		.get(userId, eventId) as { n: number; mine: number };
	if (n >= MAX_SONGS) throw new EventError('The list is full. Tick the ones you want.');
	if (mine >= MAX_EACH) throw new EventError(`You’ve added ${MAX_EACH} already. Tick other people’s, or remove one of yours.`);
	const key = songKey(title, artist);
	if (db.prepare('SELECT 1 FROM song_requests WHERE event_id = ? AND song_key = ?').get(eventId, key)) {
		throw new EventError('That song is already on the list. Tick it instead.');
	}
	const { lastInsertRowid } = db
		.prepare('INSERT INTO song_requests (event_id, title, artist, song_key, suggested_by) VALUES (?, ?, ?, ?, ?)')
		.run(eventId, title, artist, key, userId);
	db.prepare('INSERT INTO song_votes (song_id, user_id) VALUES (?, ?)').run(lastInsertRowid, userId);
	publish(eventId);
}

/** Ticks or unticks a song. Tick as many as you want. */
export function voteSong(eventId: number, userId: number, songId: number, up: boolean) {
	requireMember(eventId, userId);
	requireSong(eventId, songId);
	if (up) db.prepare('INSERT OR IGNORE INTO song_votes (song_id, user_id) VALUES (?, ?)').run(songId, userId);
	else db.prepare('DELETE FROM song_votes WHERE song_id = ? AND user_id = ?').run(songId, userId);
	publish(eventId);
}

/** Whoever added a song, or the host, can take it off the list. */
export function removeSong(eventId: number, userId: number, songId: number) {
	const event = requireMember(eventId, userId);
	const song = requireSong(eventId, songId);
	if (song.suggested_by !== userId && event.host_id !== userId) throw new EventError('Only whoever added it, or the host, can remove it.');
	db.prepare('DELETE FROM song_requests WHERE id = ?').run(songId);
	publish(eventId);
}

/**
 * The host marks a song as in the playlist (or takes the mark off). Whoever asked for it hears the first
 * time it goes in, unless they're the host.
 */
export function markSongAdded(eventId: number, hostId: number, songId: number, added: boolean) {
	const event = requireHost(eventId, hostId);
	const song = requireSong(eventId, songId);
	db.prepare('UPDATE song_requests SET added = ? WHERE id = ?').run(added ? 1 : 0, songId);
	if (added && !song.added_told) {
		db.prepare('UPDATE song_requests SET added_told = 1 WHERE id = ?').run(songId);
		if (song.suggested_by !== hostId) notify(song.suggested_by, eventId, `Your song request “${song.title}” is in the playlist for ${event.title}.`);
	}
	publish(eventId);
}
