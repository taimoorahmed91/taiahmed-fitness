import { test, expect } from 'bun:test';
import { daysSinceTemplate, isRecentlyDone } from '../src/lib/recentTemplate';

const s = [{ exercise: 'Push Day', date: '2026-10-25' }, { exercise: 'Push Day', date: '2026-10-20' }];

test('days since latest matching session, case-insensitive', () => {
  expect(daysSinceTemplate(s, 'push day', '2026-10-27')).toBe(2);
  expect(daysSinceTemplate(s, 'Pull Day', '2026-10-27')).toBe(null);
});

test('1 or 2 days ago is recent; today and 3 days are not', () => {
  expect(isRecentlyDone(1)).toBe(true);
  expect(isRecentlyDone(2)).toBe(true);
  expect(isRecentlyDone(0)).toBe(false);
  expect(isRecentlyDone(3)).toBe(false);
});
