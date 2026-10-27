import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRecoveryVsGym, analyzeSleepVsNutrition, classifyRecomp, computeBodyRecomposition, sessionVolume } from '../src/lib/crossMetricIntelligence';

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

test('sleep under 6.5h is short; 6.5h exactly is normal; missing carbs are unknown', () => {
  const sleep = [5, 6, 6.4, 6.5, 7, 8].map((hours, i) => ({ date: `2026-10-0${i + 1}`, hours }));
  const meals = sleep.map((s, i) => ({ date: s.date, calories: 2000, carbs: i === 0 ? null : i < 3 ? 300 : 200 }));
  const r = analyzeSleepVsNutrition(sleep, meals, 6.5)!;
  assert.equal(r.shortDays, 3);
  assert.equal(r.normalDays, 3);
  assert.equal(r.shortCarbs, 300);
  assert.equal(r.normalCarbs, 200);
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
