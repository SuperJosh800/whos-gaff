// Games people make themselves. Anyone on an event with the game's owner can play it there.
import { db } from './db.ts';
import { EventError } from './events.ts';
import { CUSTOM, DEFAULT_COVER, isSetting, type Card, type Setting } from '../activities.ts';

export type CustomGame = {
	id: number;
	owner_id: number;
	owner: string;
	name: string;
	emoji: string;
	setting: Setting;
	rules: string;
	scored: boolean;
	cards: Card[];
};

type Row = Omit<CustomGame, 'scored' | 'cards'> & { scored: number; cards: string };

const SELECT = `SELECT g.id, g.owner_id, u.name AS owner, g.name, g.emoji, g.setting, g.rules, g.scored, g.cards
	FROM custom_games g JOIN users u ON u.id = g.owner_id`;

const toGame = (row: Row): CustomGame => ({ ...row, scored: !!row.scored, cards: JSON.parse(row.cards) });

/**
 * Reads the cards box: one card per line. A line starting "secret:" is only shown to the player it names;
 * text after a "|" is the fake task everyone else sees instead.
 */
export function parseCards(text: string, scored: boolean): Card[] {
	const cards: Card[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		const secret = /^secret\s*:/i.exec(line);
		if (secret) {
			const [mission, cover] = line.slice(secret[0].length).split('|').map((s) => s.trim());
			if (!mission) continue;
			// Secret cards are about one player, so make sure they name someone.
			const named = /\{1\}/.test(mission) ? mission : `{1}: ${mission}`;
			cards.push({ text: named, secret: true, cover: cover || DEFAULT_COVER, ...(scored ? { points: 2 } : {}) });
		} else {
			cards.push({ text: line, ...(scored ? { points: 1 } : {}) });
		}
	}
	return cards;
}

/** Turns cards back into the text the edit box shows. */
export function cardsToText(cards: Card[]) {
	return cards.map((c) => (c.secret ? `secret: ${c.text}${c.cover ? ` | ${c.cover}` : ''}` : c.text)).join('\n');
}

export type CustomGameInput = { name: string; emoji: string; setting: string; rules: string; scored: boolean; cards: string };

/** Reads the make/edit game form. */
export function readGame(form: FormData): CustomGameInput {
	const get = (name: string) => String(form.get(name) ?? '');
	return { name: get('name'), emoji: get('emoji'), setting: get('setting'), rules: get('rules'), scored: get('scored') === 'on', cards: get('cards') };
}

export function saveCustomGame(ownerId: number, input: CustomGameInput, id?: number) {
	const name = input.name.trim();
	const emoji = [...input.emoji.trim()].slice(0, 4).join('') || '🎲';
	const rules = input.rules.trim();
	if (!name) throw new EventError('Give your game a name.');
	if (name.length > CUSTOM.name) throw new EventError(`Keep the name under ${CUSTOM.name} characters.`);
	if (!isSetting(input.setting)) throw new EventError('Pick where the game is played.');
	if (rules.length > CUSTOM.rules) throw new EventError(`Keep the rules under ${CUSTOM.rules} characters.`);
	const cards = parseCards(input.cards, input.scored);
	if (cards.length < 3) throw new EventError('Add at least 3 cards, one per line.');
	if (cards.length > CUSTOM.maxCards) throw new EventError(`That’s too many cards. The most is ${CUSTOM.maxCards}.`);
	if (cards.some((c) => c.text.length > CUSTOM.card || (c.cover?.length ?? 0) > CUSTOM.card)) {
		throw new EventError(`Keep each card under ${CUSTOM.card} characters.`);
	}
	const values = [name, emoji, input.setting, rules, input.scored ? 1 : 0, JSON.stringify(cards)];
	if (id) {
		const existing = getCustomGame(id);
		if (!existing || existing.owner_id !== ownerId) throw new EventError('Game not found.');
		db.prepare('UPDATE custom_games SET name = ?, emoji = ?, setting = ?, rules = ?, scored = ?, cards = ? WHERE id = ?').run(...values, id);
		return id;
	}
	const count = db.prepare('SELECT COUNT(*) AS n FROM custom_games WHERE owner_id = ?').get(ownerId) as { n: number };
	if (count.n >= CUSTOM.maxGames) throw new EventError(`You can make up to ${CUSTOM.maxGames} games. Delete one first.`);
	const { lastInsertRowid } = db
		.prepare('INSERT INTO custom_games (name, emoji, setting, rules, scored, cards, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.run(...values, ownerId);
	return Number(lastInsertRowid);
}

export function getCustomGame(id: number) {
	const row = db.prepare(`${SELECT} WHERE g.id = ?`).get(id) as Row | undefined;
	return row ? toGame(row) : null;
}

export function deleteCustomGame(ownerId: number, id: number) {
	const game = getCustomGame(id);
	if (!game || game.owner_id !== ownerId) throw new EventError('Game not found.');
	db.prepare('DELETE FROM custom_games WHERE id = ?').run(id);
}

export function listOwnGames(ownerId: number) {
	return (db.prepare(`${SELECT} WHERE g.owner_id = ? ORDER BY g.name`).all(ownerId) as Row[]).map(toGame);
}

/** Games made by anyone on the event, for its Games tab. */
export function listGamesForEvent(eventId: number) {
	return (
		db
			.prepare(`${SELECT} WHERE g.owner_id IN (SELECT user_id FROM event_members WHERE event_id = ?) ORDER BY g.name`)
			.all(eventId) as Row[]
	).map(toGame);
}

/** A custom game that can be played at this event, or null. */
export function customGameForEvent(eventId: number, gameId: number) {
	return listGamesForEvent(eventId).find((g) => g.id === gameId) ?? null;
}
