import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Static guard for the workout screens: no tiny text, no fixed 80px label column.
const dir = new URL('../src/components/workout/', import.meta.url);
const files = [
  ...readdirSync(dir).map((f) => new URL(f, dir)),
  new URL('../src/components/ActiveWorkoutModal.tsx', import.meta.url),
  new URL('../src/components/EditWorkoutSessionModal.tsx', import.meta.url),
  new URL('../src/components/ExerciseHistoryDialog.tsx', import.meta.url),
  new URL('../src/pages/Gym.tsx', import.meta.url),
];

describe('workout UI source guard', () => {
  for (const url of files) {
    const name = url.pathname.split('/').pop()!;
    const src = readFileSync(url, 'utf8');
    test(`${name}: functional text is at least 12px`, () => {
      const small = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => parseFloat(m[1]) < 12);
      assert.deepEqual(small.map((m) => m[0]), []);
      const chart = [...src.matchAll(/fontSize:\s*(\d+)/g)].filter((m) => parseInt(m[1], 10) < 12);
      assert.deepEqual(chart.map((m) => m[0]), []);
    });
    test(`${name}: no fixed 80px label column`, () => {
      assert.equal(/80px\s+(?:repeat|minmax)/.test(src), false);
    });
  }

  test('set rows keep one row per set with inputs that are 44px tall', () => {
    const row = readFileSync(new URL('WorkoutSetRow.tsx', dir), 'utf8');
    assert.match(row, /SET_COLUMNS_WITH_USE = 'grid-cols-\[2\.75rem_minmax\(0,1fr\)_minmax\(0,1\.5fr\)_4rem\]'/);
    assert.equal((row.match(/h-11/g) ?? []).length >= 2, true);
    assert.match(row, /enterKeyHint=/);
    assert.match(row, /aria-label=\{`\$\{exerciseName\}, \$\{setLabel\}, reps`\}/);
    assert.match(row, /aria-label=\{`\$\{exerciseName\}, \$\{setLabel\}, weight in kilograms`\}/);
  });
});
