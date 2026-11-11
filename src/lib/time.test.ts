import { describe, expect, it } from 'vitest';
import { isJustAfterPayday, nowLocal } from './time.ts';

describe('payday mode', () => {
	it('highlights the week starting on payday, across month ends', () => {
		const after25 = (d: string) => isJustAfterPayday(`${d}T20:00`, 25);
		expect(after25('2026-11-24')).toBe(false);
		expect(after25('2026-11-25')).toBe(true);
		expect(after25('2026-12-01')).toBe(true); // 6 days after 25 Nov
		expect(after25('2026-12-02')).toBe(false);
	});

	it('moves a payday past the end of a short month to its last day', () => {
		expect(isJustAfterPayday('2026-11-30T20:00', 31)).toBe(true);
		expect(isJustAfterPayday('2026-12-06T20:00', 31)).toBe(true);
		expect(isJustAfterPayday('2026-12-07T20:00', 31)).toBe(false);
		expect(isJustAfterPayday('2026-11-29T20:00', 31)).toBe(false);
	});
});

describe('nowLocal', () => {
	it('uses UK time, including British Summer Time', () => {
		expect(nowLocal(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02T00:30');
		expect(nowLocal(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01T23:30');
	});
});
