import { describe, it, expect } from 'bun:test';
import { personalRecords } from '../src/lib/workoutStats';

describe('personalRecords', () => {
  it('keeps the heaviest working set and ignores warmups', () => {
    const prs = personalRecords([
      { exercise: 'Pull Day', date: '2026-10-01', notes: '1.Cable Row: W:12@80kg S1:10@55kg S2:8@57.5kg' },
      { exercise: 'Pull Day', date: '2026-10-08', notes: '1.Cable Row: S1:10@55kg' },
    ]);
    expect(prs[0]).toMatchObject({ exercise: 'Cable Row', weight: 57.5, reps: 8, date: '2026-10-01', sessions: 2 });
  });
  it('breaks equal-weight ties by more reps', () => {
    const prs = personalRecords([
      { exercise: 'A', date: '2026-10-01', notes: 'Squat: S1:5@100kg' },
      { exercise: 'A', date: '2026-10-05', notes: 'Squat: S1:7@100kg' },
    ]);
    expect(prs[0]).toMatchObject({ reps: 7, date: '2026-10-05' });
  });
});
