import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRecoveryVsGym, analyzeSleepVsNutrition, classifyRecomp, computeBodyRecomposition, sessionVolume,
  recoveryGymCopy, sleepNutritionCopy, OBSERVED_DIFFERENCE, MIN_COHORT_DAYS,
} from '../src/lib/crossMetricIntelligence';

test('session volume counts working sets only', () => {
  assert.equal(sessionVolume('1.Row: W:10@20kg S1:10@55kg S2:8@57,5kg'), 550 + 460);
});

test('recovery split uses >= cutoff as high and needs 3 days per side', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
  const recovery = days.map((date, i) => ({ date, recovery_score: i < 3 ? 66 : 40 }));
  const sessions = days.map((date, i) => ({ date, duration: i < 3 ? 60 : 50 }));
  const r = analyzeRecoveryVsGym(recovery, sessions, 66)!;
  assert.equal(r.highDays, 3);
  assert.equal(r.highDuration, 60);
  assert.equal(Math.round(r.durationDeltaPct), 20);
  assert.equal(analyzeRecoveryVsGym(recovery.slice(0, 5), sessions, 66), null);
});

test('sleep under 6.5h is short; 6.5h exactly is normal; unknown carbs are excluded from the carb average', () => {
  const sleep = [5, 6, 6.4, 6.5, 7, 8].map((hours, i) => ({ date: `2026-10-0${i + 1}`, hours }));
  // Day 1 carbs unknown (short cohort), days 2-3 300g; normal cohort all 200g.
  const meals = sleep.map((s, i) => ({ date: s.date, calories: 2000, carbs: i === 0 ? null : i < 3 ? 300 : 200 }));
  const r = analyzeSleepVsNutrition(sleep, meals, 6.5)!;
  assert.equal(r.shortDays, 3);
  assert.equal(r.normalDays, 3);
  assert.deepEqual(r.evidence.normal.map(d => d.date), ['2026-10-04', '2026-10-05', '2026-10-06']);
  // Only 2 short days have carbs: below MIN_COHORT_DAYS, so no carb claim, but calories (known on every day) remain.
  assert.equal(r.shortCarbDays, 2);
  assert.equal(r.shortCarbs, null);
  assert.equal(r.normalCarbs, null);   // not comparable, so neither side is presented
  assert.equal(r.normalCarbDays, 3);
  assert.equal(r.carbDeltaPct, null);
  assert.equal(r.calorieDelta, 0);
});

const sleepFixture = () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  const hours = [5, 6, 6, 6.4, 7.5, 8, 6.5, 7];
  const sleep = dates.map((date, i) => ({ date, hours: hours[i] }));
  const meals = dates.map((date, i) => ({ date, calories: 2000 + i * 100, carbs: 250 + i * 10 }));
  return { dates, sleep, meals };
};

test('sleep evidence: denominators are known-carb days, not all sleep days', () => {
  const { sleep, meals } = sleepFixture();
  // 10-02 (short) has one meal with carbs and one without: the whole day is unknown, never a partial sum.
  meals.push({ date: '2026-10-02', calories: 300, carbs: null as unknown as number });
  // 10-03 (short) has no carbs at all.
  meals.find(m => m.date === '2026-10-03')!.carbs = null as unknown as number;
  const r = analyzeSleepVsNutrition(sleep, meals, 6.5)!;
  assert.equal(r.shortDays, 4);                       // 10-01 .. 10-04
  assert.equal(r.normalDays, 4);                      // 10-05 .. 10-08 (6.5 exactly is normal)
  assert.equal(r.shortCarbDays, 2);
  assert.equal(r.normalCarbDays, 4);
  assert.equal(r.evidence.coverage.shortCarbDays, r.shortCarbDays);
  assert.equal(r.evidence.coverage.normalCarbDays, r.normalCarbDays);
  assert.equal(r.evidence.short.filter(d => d.carbs != null).length, 2);
  const partial = r.evidence.short.find(d => d.date === '2026-10-02')!;
  assert.equal(partial.carbs, null);
  assert.equal(partial.mealCount, 2);
  assert.equal(partial.carbMealCount, 1);
  assert.equal(partial.calories, 2100 + 300);          // calories still count every meal that day
  // 2 known short days < MIN_COHORT_DAYS: no carb comparison, calories remain.
  assert.equal(r.shortCarbs, null);
  assert.equal(r.normalCarbs, null);
  assert.equal(r.carbDeltaPct, null);
  assert.equal(r.evidence.differences.carbsPct, null);
  assert.match(sleepNutritionCopy(r).description, /carbs not compared \(known on 2 of 4 and 4 of 4 days/);
  // With every day known the comparison appears, averaged over exactly the known days.
  const full = analyzeSleepVsNutrition(sleep, sleepFixture().meals, 6.5)!;
  assert.equal(full.shortCarbDays, 4);
  assert.equal(full.normalCarbDays, 4);
  assert.equal(full.shortCarbs, (250 + 260 + 270 + 280) / 4);
  assert.equal(full.normalCarbs, (290 + 300 + 310 + 320) / 4);
  assert.equal(full.evidence.averages.short.carbs, full.shortCarbs);
  const desc = sleepNutritionCopy(full).description;
  assert.match(desc, /carbs known on 4 of 4 and 4 of 4 days/);
  assert.match(desc, /Based on 4 shorter-sleep and 4 longer-sleep days/);
  // Three known short days is enough.
  const three = sleepFixture().meals;
  three.find(m => m.date === '2026-10-04')!.carbs = null as unknown as number;
  const t = analyzeSleepVsNutrition(sleep, three, 6.5)!;
  assert.equal(t.shortCarbDays, 3);
  assert.equal(t.shortCarbs, (250 + 260 + 270) / 3);
});

test('sleep date D pairs with meals on date D only (no shifting); days without meals are left out and counted', () => {
  const { sleep, meals } = sleepFixture();
  const shifted = meals.filter(m => m.date !== '2026-10-04').concat({ date: '2026-10-09', calories: 9999, carbs: 999 });
  const r = analyzeSleepVsNutrition(sleep, shifted, 6.5)!;
  assert.equal(r.evidence.coverage.sleepDates, 8);
  assert.equal(r.evidence.coverage.noMealDays, 1);
  assert.equal(r.evidence.coverage.usedDays, 7);
  assert.ok(![...r.evidence.short, ...r.evidence.normal].some(d => d.date === '2026-10-04' || d.date === '2026-10-09'));
});

test('duplicate sleep dates use the longest record once, matching the weekly digest rule', () => {
  const { sleep, meals } = sleepFixture();
  const dupes = [...sleep, { date: '2026-10-01', hours: 1 }, { date: '2026-10-04', hours: 3 }, { date: '2026-10-02', hours: 7.9 }];
  const r = analyzeSleepVsNutrition(dupes, meals, 6.5)!;
  const all = [...r.evidence.short, ...r.evidence.normal];
  assert.equal(new Set(all.map(d => d.date)).size, all.length, 'one row per date');
  assert.equal(all.find(d => d.date === '2026-10-01')!.hours, 5);
  assert.equal(all.find(d => d.date === '2026-10-04')!.hours, 6.4);
  assert.equal(all.find(d => d.date === '2026-10-02')!.hours, 7.9);   // the longer record moves the date to the normal cohort
  assert.equal(r.evidence.coverage.duplicateSleepDates, 3);
  assert.equal(r.shortDays, 3);
  assert.equal(r.normalDays, 5);
  // Input order never changes the answer.
  const reversed = analyzeSleepVsNutrition([...dupes].reverse(), meals, 6.5)!;
  assert.deepEqual(reversed.evidence.short, r.evidence.short);
  assert.deepEqual(reversed.evidence.normal, r.evidence.normal);
});

test('sleep: window limits sleep and meals; either cohort under the minimum gives no result', () => {
  const { sleep, meals } = sleepFixture();
  const r = analyzeSleepVsNutrition(sleep, meals, 6.5, { from: '2026-10-02' })!;
  assert.deepEqual(r.evidence.window, { from: '2026-10-02', to: null });
  assert.equal(r.evidence.coverage.sleepDates, 7);
  assert.ok([...r.evidence.short, ...r.evidence.normal].every(d => d.date >= '2026-10-02'));
  assert.equal(analyzeSleepVsNutrition(sleep, meals, 6.5, { from: '2026-10-03' }), null);   // short cohort would have 1 day
  assert.equal(analyzeSleepVsNutrition(sleep, meals, 6.5, { to: '2026-10-06' }), null);     // normal cohort would have 2 days
  assert.equal(analyzeSleepVsNutrition([], [], 6.5), null);
  assert.equal(analyzeSleepVsNutrition(sleep, meals, 99), null);   // every night is short: no comparison group
});

const recoveryFixture = () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
  const scores = [80, 70, 66, 65, 40, 30, 90];
  const recovery = dates.map((date, i) => ({ date, recovery_score: scores[i] }));
  const sessions = dates.map((date, i) => ({ date, duration: 50 + i, notes: i === 5 ? undefined : `1.Row: S1:10@${50 + i}kg` }));
  return { dates, recovery, sessions };
};

test('recovery evidence: one row per distinct date, cohort membership, values and exact counts', () => {
  const { recovery, sessions } = recoveryFixture();
  // A second workout on 10-01 is summed into the same day, not a second day.
  const withExtra = [...sessions, { date: '2026-10-01', duration: 20, notes: 'S1:5@100kg' }];
  const r = analyzeRecoveryVsGym(recovery, withExtra, 66)!;
  const ev = r.evidence;
  assert.deepEqual(ev.high.map(d => d.date), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-07']);
  assert.deepEqual(ev.low.map(d => d.date), ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(r.highDays, ev.high.length);
  assert.equal(r.lowDays, ev.low.length);
  assert.equal(ev.coverage.usedDays, 7);
  assert.equal(ev.coverage.workoutDays, 7);
  assert.equal(ev.coverage.noRecoveryDays, 0);
  const first = ev.high[0];
  assert.equal(first.sessions, 2);
  assert.equal(first.durationMin, 70);
  assert.equal(first.volumeKg, 10 * 50 + 5 * 100);
  assert.equal(first.recovery, 80);
  assert.equal(ev.high.find(d => d.date === '2026-10-03')!.recovery, 66);   // exactly the cutoff is high
  // 10-06 has no working sets in notes: unknown volume, excluded from the volume average and its count.
  assert.equal(ev.low.find(d => d.date === '2026-10-06')!.volumeKg, null);
  assert.equal(ev.coverage.lowVolumeDays, 2);
  assert.equal(ev.coverage.lowDurationDays, 3);
  assert.equal(r.lowVolume, (10 * 53 + 10 * 54) / 2);
  assert.equal(ev.averages.low.volumeKg, r.lowVolume);
  assert.equal(ev.differences.volumePct, r.volumeDeltaPct);
  assert.equal(ev.cutoff, 66);
  assert.equal(ev.minCohortDays, MIN_COHORT_DAYS);
});

test('recovery: workouts without a recovery score are left out and counted; window filters both sources', () => {
  const { recovery, sessions } = recoveryFixture();
  const r = analyzeRecoveryVsGym(recovery.filter(x => x.date !== '2026-10-07'), sessions, 66)!;
  assert.equal(r.evidence.coverage.noRecoveryDays, 1);
  assert.equal(r.evidence.coverage.workoutDays, 7);
  assert.equal(r.evidence.coverage.usedDays, 6);
  assert.ok(![...r.evidence.high, ...r.evidence.low].some(d => d.date === '2026-10-07'));
  const windowed = analyzeRecoveryVsGym(recovery, sessions, 66, { from: '2026-10-02', to: '2026-10-07' })!;
  assert.deepEqual(windowed.evidence.window, { from: '2026-10-02', to: '2026-10-07' });
  assert.equal(windowed.evidence.coverage.workoutDays, 6);
  assert.equal(windowed.highDays, 3);
  assert.equal(windowed.lowDays, 3);
  assert.ok([...windowed.evidence.high, ...windowed.evidence.low].every(d => d.date >= '2026-10-02'));
  // 2 high days (<3) once the window narrows further.
  assert.equal(analyzeRecoveryVsGym(recovery, sessions, 66, { from: '2026-10-03', to: '2026-10-07' }), null);
  assert.equal(analyzeRecoveryVsGym(recovery, sessions, 66, { to: '2026-10-05' }), null);
});

test('recovery: duplicate WHOOP rows for a date use the latest row, independent of order; null scores are ignored', () => {
  const { recovery, sessions } = recoveryFixture();
  const dupes = [
    ...recovery,
    { date: '2026-10-05', recovery_score: 95, stamp: '2026-10-05T09:00:00Z' },
    { date: '2026-10-05', recovery_score: 20, stamp: '2026-10-05T10:00:00Z' },
    { date: '2026-10-06', recovery_score: null, stamp: '2026-10-06T10:00:00Z' },
  ];
  const a = analyzeRecoveryVsGym(dupes, sessions, 66)!;
  const b = analyzeRecoveryVsGym([...dupes].reverse(), sessions, 66)!;
  assert.deepEqual(a.evidence, b.evidence);
  assert.equal([...a.evidence.high, ...a.evidence.low].find(d => d.date === '2026-10-05')!.recovery, 20);
  assert.equal(a.evidence.coverage.duplicateRecoveryDates, 1);
  assert.equal([...a.evidence.high, ...a.evidence.low].find(d => d.date === '2026-10-06')!.recovery, 30);
});

test('recovery with no recorded volume anywhere yields duration only and never a 0-vs-0 volume claim', () => {
  const { recovery, sessions } = recoveryFixture();
  const r = analyzeRecoveryVsGym(recovery, sessions.map(s => ({ ...s, notes: undefined })), 66)!;
  assert.equal(r.highVolume, null);
  assert.equal(r.volumeDeltaPct, null);
  const copy = recoveryGymCopy(r);
  assert.equal(copy.valueLabel, 'duration');
  assert.ok(!/volume \(/.test(copy.description) && !/ kg /.test(copy.description));
});

test('copy leads with the neutral phrase, matches evidence counts and avoids judgment words', () => {
  const { recovery, sessions } = recoveryFixture();
  const r = analyzeRecoveryVsGym(recovery, sessions, 66)!;
  const c = recoveryGymCopy(r);
  assert.ok(c.description.startsWith(`${OBSERVED_DIFFERENCE}:`));
  assert.match(c.description, new RegExp(`Based on ${r.evidence.high.length} higher-recovery and ${r.evidence.low.length} lower-recovery workout days`));
  assert.match(c.description, new RegExp(`Volume is known for ${r.evidence.coverage.highVolumeDays} of ${r.highDays} higher and ${r.evidence.coverage.lowVolumeDays} of ${r.lowDays} lower`));
  const { sleep, meals } = sleepFixture();
  const s = sleepNutritionCopy(analyzeSleepVsNutrition(sleep, meals, 6.5)!);
  assert.ok(s.description.startsWith(`${OBSERVED_DIFFERENCE}:`));
  for (const text of [c.description, s.description]) {
    assert.ok(!/\b(better|worse|healthier|boost|improv|cause[sd]?|because|more volume|fewer carbs|good|bad|poor)\b/i.test(text), text);
  }
});

test('recomposition classification', () => {
  assert.equal(classifyRecomp(0, -2), 'recomp');
  assert.equal(classifyRecomp(-2, -2), 'fat_loss');
  assert.equal(classifyRecomp(2, 2), 'surplus');
  assert.equal(classifyRecomp(-2, 0), 'muscle_loss_risk');
  assert.equal(classifyRecomp(0.5, -0.5), 'stable');
});

test('recomposition needs two entries of each in the window', () => {
  const today = '2026-10-30';
  const weight = [{ date: '2026-10-02', value: 80 }, { date: '2026-10-29', value: 80 }];
  const waist = [{ date: '2026-10-05', value: 90 }, { date: '2026-10-28', value: 88 }];
  assert.equal(computeBodyRecomposition(weight, waist, 30, today).status, 'recomp');
  assert.equal(computeBodyRecomposition(weight, waist.slice(0, 1), 30, today).status, 'insufficient');
  assert.equal(computeBodyRecomposition(weight, waist, 30, '2026-11-30').status, 'insufficient');
});
