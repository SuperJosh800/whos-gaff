// Group quiz: members write multiple-choice questions about each other ("What's Sam's go-to drink?"),
// and everyone else answers them once each. A table shows who knows the group best, and each person sees
// how well the group knows them.
import { createHash } from 'node:crypto';
import { db } from './db.ts';
import { EventError } from './events.ts';
import { requireGroupMember, isGroupMember } from './groups.ts';

/** Each person can have this many questions in a group. */
export const QUESTION_CAP = 30;

type Question = { id: number; author_id: number; author: string; about_id: number; about: string; question: string; answer: string; wrong: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const tidy = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/** The right answer and the wrong ones, in an order that's the same for everyone but doesn't give the answer away. */
function options(q: Pick<Question, 'id' | 'answer' | 'wrong'>) {
	const key = (o: string) => createHash('sha256').update(`${q.id}:${o}`).digest('hex');
	return [q.answer, ...(JSON.parse(q.wrong) as string[])].sort((a, b) => key(a).localeCompare(key(b)));
}

const SELECT = `SELECT q.id, q.author_id, a.name AS author, q.about_id, b.name AS about, q.question, q.answer, q.wrong
	FROM quiz_questions q JOIN users a ON a.id = q.author_id JOIN users b ON b.id = q.about_id`;

export function addQuestion(groupId: number, userId: number, aboutId: number, question: string, answer: string, wrong: string[]) {
	requireGroupMember(groupId, userId);
	if (!isGroupMember(groupId, aboutId)) throw new EventError('Pick someone in the group to ask about.');
	question = tidy(question, 140);
	answer = tidy(answer, 60);
	const wrongs = wrong.map((w) => tidy(w, 60)).filter(Boolean);
	if (!question) throw new EventError('What’s the question?');
	if (!answer) throw new EventError('What’s the right answer?');
	if (!wrongs.length) throw new EventError('Add at least one wrong answer.');
	const all = [answer, ...wrongs];
	if (all.some((o, i) => all.findIndex((p) => same(o, p)) !== i)) throw new EventError('The answers need to be different from each other.');
	const { n } = db.prepare('SELECT COUNT(*) AS n FROM quiz_questions WHERE group_id = ? AND author_id = ?').get(groupId, userId) as { n: number };
	if (n >= QUESTION_CAP) throw new EventError(`You’ve written ${QUESTION_CAP} already. Delete one to add another.`);
	db.prepare('INSERT INTO quiz_questions (group_id, author_id, about_id, question, answer, wrong) VALUES (?, ?, ?, ?, ?, ?)').run(
		groupId,
		userId,
		aboutId,
		question,
		answer,
		JSON.stringify(wrongs.slice(0, 3))
	);
}

/** Whoever wrote it, whoever it's about, or whoever made the group can delete a question. */
export function deleteQuestion(groupId: number, userId: number, questionId: number) {
	const group = requireGroupMember(groupId, userId);
	const q = db.prepare('SELECT author_id, about_id FROM quiz_questions WHERE id = ? AND group_id = ?').get(questionId, groupId) as
		| { author_id: number; about_id: number }
		| undefined;
	if (!q) return;
	if (![q.author_id, q.about_id, group.created_by].includes(userId)) {
		throw new EventError('Only whoever wrote it, whoever it’s about, or whoever made the group can delete it.');
	}
	db.prepare('DELETE FROM quiz_questions WHERE id = ?').run(questionId);
}

/** Answers a question, once. Not your own, and not one about you. Returns whether you got it, with the question and right answer. */
export function answerQuestion(groupId: number, userId: number, questionId: number, choice: string) {
	requireGroupMember(groupId, userId);
	const q = db.prepare(`${SELECT} WHERE q.id = ? AND q.group_id = ?`).get(questionId, groupId) as Question | undefined;
	if (!q) throw new EventError('That question’s been deleted.');
	if (q.author_id === userId) throw new EventError('You wrote that one.');
	if (q.about_id === userId) throw new EventError('That one’s about you.');
	if (!options(q).includes(choice)) throw new EventError('Pick one of the answers.');
	const correct = choice === q.answer;
	const { changes } = db.prepare('INSERT OR IGNORE INTO quiz_answers (question_id, user_id, correct) VALUES (?, ?, ?)').run(questionId, userId, correct ? 1 : 0);
	if (!changes) throw new EventError('You’ve already answered that one.');
	return { correct, question: q.question, answer: q.answer };
}

/** How many questions are waiting for someone in a group. */
export function questionsToAnswer(groupId: number, userId: number) {
	return (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM quiz_questions q WHERE q.group_id = ? AND q.author_id != ? AND q.about_id != ?
				 AND NOT EXISTS (SELECT 1 FROM quiz_answers a WHERE a.question_id = q.id AND a.user_id = ?)`
			)
			.get(groupId, userId, userId, userId) as { n: number }
	).n;
}

/**
 * The quiz as someone sees it: the next question for them (oldest first), who knows the group best,
 * how the group did on questions about them, and the questions they wrote.
 */
export function getQuiz(groupId: number, viewerId: number) {
	const group = requireGroupMember(groupId, viewerId);
	const next = db
		.prepare(
			`${SELECT} WHERE q.group_id = ? AND q.author_id != ? AND q.about_id != ?
			 AND NOT EXISTS (SELECT 1 FROM quiz_answers x WHERE x.question_id = q.id AND x.user_id = ?) ORDER BY q.id LIMIT 1`
		)
		.get(groupId, viewerId, viewerId, viewerId) as Question | undefined;
	const stats = (where: string, ...params: number[]) =>
		db
			.prepare(
				`SELECT q.id, q.question, q.answer, a.name AS author, b.name AS about,
					(SELECT COUNT(*) FROM quiz_answers x WHERE x.question_id = q.id) AS answered,
					(SELECT COALESCE(SUM(x.correct), 0) FROM quiz_answers x WHERE x.question_id = q.id) AS correct
				 FROM quiz_questions q JOIN users a ON a.id = q.author_id JOIN users b ON b.id = q.about_id
				 WHERE q.group_id = ? AND ${where} ORDER BY q.id DESC`
			)
			.all(groupId, ...params) as { id: number; question: string; answer: string; author: string; about: string; answered: number; correct: number }[];
	// Only people still in the group are ranked.
	const scores = db
		.prepare(
			`SELECT u.id, u.name, COUNT(*) AS answered, SUM(x.correct) AS correct FROM quiz_answers x
			 JOIN quiz_questions q ON q.id = x.question_id JOIN users u ON u.id = x.user_id
			 WHERE q.group_id = ? AND x.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
			 GROUP BY u.id ORDER BY correct DESC, answered ASC, u.name`
		)
		.all(groupId, groupId) as { id: number; name: string; answered: number; correct: number }[];
	// Whoever made the group can delete any question, so they see them all, without the answers.
	const all =
		group.created_by === viewerId
			? stats('q.author_id != ? AND q.about_id != ?', viewerId, viewerId).map(({ id, question, author, about }) => ({ id, question, author, about }))
			: null;
	const { total } = db.prepare('SELECT COUNT(*) AS total FROM quiz_questions WHERE group_id = ?').get(groupId) as { total: number };
	return {
		total,
		all,
		next: next ? { id: next.id, author: next.author, about: next.about, question: next.question, options: options(next) } : null,
		left: questionsToAnswer(groupId, viewerId),
		scores: scores.map((s) => ({ ...s, place: scores.findIndex((o) => o.correct === s.correct && o.answered === s.answered) + 1 })),
		aboutMe: stats('q.about_id = ? AND q.author_id != ?', viewerId, viewerId),
		mine: stats('q.author_id = ?', viewerId)
	};
}
