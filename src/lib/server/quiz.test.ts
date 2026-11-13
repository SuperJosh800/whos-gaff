import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { signUp, type User } from './auth.ts';
import { createGroup, joinGroupByToken } from './groups.ts';
import { addQuestion, answerQuestion, deleteQuestion, getQuiz, QUESTION_CAP, questionsToAnswer } from './quiz.ts';
import { deleteAccount, exportData } from './account.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@quiz.test`, name, 'correct-horse-9') as User;
const token = (id: number) => (db.prepare('SELECT invite_token FROM friend_groups WHERE id = ?').get(id) as { invite_token: string }).invite_token;

/** Ana made the group; Ben, Cal and Dee joined. */
function crew() {
	const [ana, ben, cal, dee] = ['Ana', 'Ben', 'Cal', 'Dee'].map(user);
	const id = createGroup(ana.id, 'Flat 2/1');
	for (const u of [ben, cal, dee]) joinGroupByToken(token(id), u.id);
	return { id, ana, ben, cal, dee };
}
const nextId = (id: number, u: User) => getQuiz(id, u.id).next!.id;

describe('group quiz', () => {
	it('asks everyone but the writer and the person it’s about, once each, and marks the answer', () => {
		const { id, ana, ben, cal, dee } = crew();
		addQuestion(id, ana.id, ben.id, '  What’s   Ben’s go-to drink? ', ' Tennent’s ', ['Guinness', 'Vodka coke', '']);
		for (const u of [ana, ben]) expect(getQuiz(id, u.id).next).toBeNull();
		const next = getQuiz(id, cal.id).next!;
		expect(next).toMatchObject({ author: 'Ana', about: 'Ben', question: 'What’s Ben’s go-to drink?' });
		expect([...next.options].sort()).toEqual(['Guinness', 'Tennent’s', 'Vodka coke']);
		// Everyone sees the answers in the same order.
		expect(getQuiz(id, dee.id).next!.options).toEqual(next.options);
		expect(questionsToAnswer(id, cal.id)).toBe(1);
		expect(() => answerQuestion(id, cal.id, next.id, 'Buckfast')).toThrow('Pick one of the answers');
		expect(answerQuestion(id, cal.id, next.id, 'Tennent’s')).toEqual({ correct: true, answer: 'Tennent’s' });
		expect(() => answerQuestion(id, cal.id, next.id, 'Guinness')).toThrow('already answered');
		expect(answerQuestion(id, dee.id, next.id, 'Guinness')).toEqual({ correct: false, answer: 'Tennent’s' });
		expect(() => answerQuestion(id, ana.id, next.id, 'Guinness')).toThrow('You wrote that one');
		expect(() => answerQuestion(id, ben.id, next.id, 'Guinness')).toThrow('about you');
		expect(getQuiz(id, cal.id)).toMatchObject({ next: null, left: 0 });
		expect(getQuiz(id, ben.id).aboutMe).toMatchObject([{ question: 'What’s Ben’s go-to drink?', author: 'Ana', answered: 2, correct: 1 }]);
		expect(getQuiz(id, ana.id).mine).toMatchObject([{ about: 'Ben', answered: 2, correct: 1 }]);
		expect(getQuiz(id, ana.id).aboutMe).toEqual([]);
	});

	it('ranks people by right answers, fewer tries breaking a tie, and only people still in the group', () => {
		const { id, ana, ben, cal, dee } = crew();
		addQuestion(id, ana.id, ben.id, 'Q1', 'Right', ['Wrong']);
		addQuestion(id, ana.id, ben.id, 'Q2', 'Right', ['Wrong']);
		addQuestion(id, ana.id, ana.id, 'Q3', 'Right', ['Wrong']);
		const answer = (u: User, choices: string[]) => choices.forEach((c) => answerQuestion(id, u.id, nextId(id, u), c));
		answer(cal, ['Right', 'Wrong', 'Right']);
		answer(dee, ['Right', 'Right']);
		answer(ben, ['Right']);
		expect(getQuiz(id, ana.id).scores.map((s) => [s.name, s.place, s.correct, s.answered])).toEqual([
			['Dee', 1, 2, 2],
			['Cal', 2, 2, 3],
			['Ben', 3, 1, 1]
		]);
		db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, dee.id);
		expect(getQuiz(id, ana.id).scores.map((s) => s.name)).toEqual(['Cal', 'Ben']);
	});

	it('wants a question, a right answer and different wrong ones, about someone in the group, up to the cap', () => {
		const { id, ana, ben } = crew();
		const stranger = user('Stranger');
		expect(() => addQuestion(id, ana.id, stranger.id, 'Q', 'A', ['B'])).toThrow('someone in the group');
		expect(() => addQuestion(id, stranger.id, ana.id, 'Q', 'A', ['B'])).toThrow('not in that group');
		expect(() => addQuestion(id, ana.id, ben.id, ' ', 'A', ['B'])).toThrow('What’s the question');
		expect(() => addQuestion(id, ana.id, ben.id, 'Q', ' ', ['B'])).toThrow('right answer');
		expect(() => addQuestion(id, ana.id, ben.id, 'Q', 'A', [' ', ''])).toThrow('at least one wrong');
		expect(() => addQuestion(id, ana.id, ben.id, 'Q', 'Tennent’s', ['tennent’s '])).toThrow('different');
		expect(() => addQuestion(id, ana.id, ben.id, 'Q', 'A', ['B', 'b'])).toThrow('different');
		addQuestion(id, ana.id, ana.id, 'About me', 'A', ['B']);
		for (let i = 1; i < QUESTION_CAP; i++) addQuestion(id, ana.id, ben.id, `Q${i}`, 'A', ['B']);
		expect(() => addQuestion(id, ana.id, ben.id, 'One more', 'A', ['B'])).toThrow(`written ${QUESTION_CAP}`);
		addQuestion(id, ben.id, ana.id, 'Ben can still', 'A', ['B']);
		const other = createGroup(ana.id, 'Work');
		addQuestion(other, ana.id, ana.id, 'Another group', 'A', ['B', 'C', 'D', 'E']);
		// Questions you write about yourself are yours, not "how well they know you"; at most 3 wrong answers.
		expect(getQuiz(id, ana.id).aboutMe.map((q) => q.question)).toEqual(['Ben can still']);
		joinGroupByToken(token(other), ben.id);
		expect(getQuiz(other, ben.id).next!.options).toHaveLength(4);
	});

	it('lets the writer, the person it’s about or the group’s maker delete a question, and keeps groups apart', () => {
		const { id, ana, ben, cal, dee } = crew();
		addQuestion(id, ben.id, cal.id, 'Q1', 'A', ['B']);
		addQuestion(id, ben.id, cal.id, 'Q2', 'A', ['B']);
		addQuestion(id, ben.id, cal.id, 'Q3', 'A', ['B']);
		const [q1, q2, q3] = getQuiz(id, ben.id).mine.map((q) => q.id).reverse();
		expect(() => deleteQuestion(id, dee.id, q1)).toThrow('Only whoever wrote it');
		deleteQuestion(id, ben.id, q1);
		deleteQuestion(id, cal.id, q2);
		deleteQuestion(id, ana.id, q3);
		expect(getQuiz(id, ben.id).mine).toEqual([]);
		const other = crew();
		addQuestion(other.id, other.ben.id, other.cal.id, 'Elsewhere', 'A', ['B']);
		const elsewhere = nextId(other.id, other.ana);
		expect(() => answerQuestion(id, dee.id, elsewhere, 'A')).toThrow('deleted');
		deleteQuestion(id, ana.id, elsewhere);
		expect(getQuiz(other.id, other.ana.id).next).not.toBeNull();
	});

	it('deletes questions by and about you, and your answers, with your account', () => {
		const { id, ana, ben, cal, dee } = crew();
		addQuestion(id, ana.id, ben.id, 'By Ana', 'A', ['B']);
		addQuestion(id, cal.id, ana.id, 'About Ana', 'A', ['B']);
		addQuestion(id, cal.id, ben.id, 'Neither', 'A', ['B']);
		answerQuestion(id, ana.id, nextId(id, ana), 'A');
		expect(exportData(ana.id)).toMatchObject({
			'quiz_questions (author_id)': [{ question: 'By Ana' }],
			'quiz_questions (about_id)': [{ question: 'About Ana' }],
			quiz_answers: [{ correct: 1 }]
		});
		deleteAccount(ana.id);
		expect(getQuiz(id, dee.id).left).toBe(1);
		expect(getQuiz(id, cal.id).mine.map((q) => [q.question, q.answered])).toEqual([['Neither', 0]]);
	});
});
