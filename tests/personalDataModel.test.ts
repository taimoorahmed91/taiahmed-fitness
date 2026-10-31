import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import type { PersonalData } from '../src/hooks/usePersonalData';
import {
  buildProfileSummary, buildSavePayload, calcAge, computeBmi, bmiBandIndex, bmiMarkerPercent, draftFromData, effectiveRange,
  findRangeError, formatChangedAt, formatRangeText, gramsPerDay, isDraftDirty, isRangeInverted, parseNumber,
  rangeHistoryRows, sanitizeNumericInput, singleHistoryRows, WEEKDAYS,
} from '../src/components/personal-data/model';

// Pure rules behind the Personal Data page: parsing, the exact save payload, the "unsaved changes" check,
// history merging and the summary at the top. No React, no network, and the clock is always passed in.
const NOW = new Date('2026-10-31T12:00:00Z');

const saved = (over: Partial<PersonalData> = {}): PersonalData => ({
  full_name: 'Alex Test', dob: '1990-10-31', age: null, gender: 'M', height_cm: 180, target_weight_kg: 78,
  gym_day_calorie_target: 2300, gym_day_calorie_target_max: 2600, rest_day_calorie_target: 1900, rest_day_calorie_target_max: 2200,
  protein_multiplier: 1.8, protein_multiplier_max: 2.2, carb_multiplier: 3, carb_multiplier_max: 4,
  workout_days: [3, 1, 5], workout_day_templates: { '1': 't1', '5': 'gone' },
  ...over,
});

describe('typed numbers', () => {
  test('comma becomes a dot, letters are refused, empty is allowed', () => {
    assert.equal(sanitizeNumericInput('2,5'), '2.5');
    assert.equal(sanitizeNumericInput(''), '');
    assert.equal(sanitizeNumericInput('2.5.1'), null);
    assert.equal(sanitizeNumericInput('abc'), null);
  });
  test('parseNumber treats blank and junk as null', () => {
    assert.equal(parseNumber(''), null);
    assert.equal(parseNumber('.'), null);
    assert.equal(parseNumber('2,5'), 2.5);
    assert.equal(parseNumber(null), null);
  });
});

describe('ranges', () => {
  test('a blank max means the min is used', () => {
    assert.deepEqual(effectiveRange('2300', ''), { min: 2300, max: 2300 });
    assert.deepEqual(effectiveRange('2300', '2600'), { min: 2300, max: 2600 });
    assert.equal(effectiveRange('', '2600'), null);
  });
  test('max below min is the blocking error; equal or blank is fine', () => {
    assert.equal(isRangeInverted('2300', '2000'), true);
    assert.equal(isRangeInverted('2300', '2300'), false);
    assert.equal(isRangeInverted('2300', ''), false);
    assert.equal(isRangeInverted('', '2000'), false);
  });
  test('text draws an en dash and speaks "to"; one number has no dash', () => {
    assert.deepEqual(formatRangeText({ min: 2300, max: 2600 }, 'kcal'), { text: '2,300\u20132,600 kcal', spoken: '2,300 to 2,600 kcal' });
    assert.deepEqual(formatRangeText({ min: 2300, max: 2300 }, 'kcal'), { text: '2,300 kcal', spoken: '2,300 kcal' });
  });
  test('grams a day needs a weight and rounds', () => {
    assert.deepEqual(gramsPerDay({ min: 1.8, max: 2.2 }, 82), { min: 148, max: 180 });
    assert.equal(gramsPerDay({ min: 1.8, max: 2.2 }, null), null);
    assert.equal(gramsPerDay(null, 82), null);
  });
});

describe('age is counted on UTC calendar days', () => {
  test('birthday today counts, the day before does not', () => {
    assert.equal(calcAge('1990-10-31', NOW), 36);
    assert.equal(calcAge('1990-11-01', NOW), 35);
  });
  test('invalid, empty and future dates give null', () => {
    assert.equal(calcAge('1990-02-31', NOW), null);
    assert.equal(calcAge('', NOW), null);
    assert.equal(calcAge(null, NOW), null);
    assert.equal(calcAge('2030-01-01', NOW), null);
  });
  test('late evening west of UTC does not shift the day', () => {
    // 2026-10-31T23:30 in UTC-5 is already 2026-11-01 in UTC: UTC is the app convention.
    assert.equal(calcAge('1990-11-01', new Date('2026-11-01T04:30:00Z')), 36);
  });
});

describe('save payload keeps the old semantics', () => {
  const templates = ['t1', 't2'];
  test('maps every field, ints for calories and floats for the rest', () => {
    const p = buildSavePayload(draftFromData(saved(), NOW), templates);
    assert.equal(p.full_name, 'Alex Test');
    assert.equal(p.age, 36);
    assert.equal(p.height_cm, 180);
    assert.equal(p.gym_day_calorie_target, 2300);
    assert.equal(p.gym_day_calorie_target_max, 2600);
    assert.equal(p.protein_multiplier, 1.8);
    assert.equal(p.carb_multiplier_max, 4);
  });
  test('a blank max is saved as the min; both blank saves null', () => {
    const d = { ...draftFromData(saved(), NOW), gymMax: '', proteinMax: '', restMin: '', restMax: '' };
    const p = buildSavePayload(d, templates);
    assert.equal(p.gym_day_calorie_target_max, 2300);
    assert.equal(p.protein_multiplier_max, 1.8);
    assert.equal(p.rest_day_calorie_target, null);
    assert.equal(p.rest_day_calorie_target_max, null);
  });
  test('template picks survive only for days that are on and templates that still exist', () => {
    const p = buildSavePayload(draftFromData(saved(), NOW), templates);
    assert.deepEqual(p.workout_day_templates, { '1': 't1' });
    const off = buildSavePayload({ ...draftFromData(saved(), NOW), workoutDays: [3] }, templates);
    assert.deepEqual(off.workout_day_templates, {});
  });
  test('empty text becomes null, not 0 or NaN', () => {
    const p = buildSavePayload(draftFromData({ ...saved(), full_name: null, dob: null, age: null, height_cm: null }, NOW), templates);
    assert.equal(p.full_name, null);
    assert.equal(p.dob, null);
    assert.equal(p.age, null);
    assert.equal(p.height_cm, null);
  });
  test('findRangeError uses the original toast wording, first inverted range wins', () => {
    const d = draftFromData(saved(), NOW);
    assert.equal(findRangeError(d), null);
    assert.equal(findRangeError({ ...d, restMax: '1000' }), 'Rest day calories: Max must be greater than or equal to Min');
    assert.equal(findRangeError({ ...d, gymMax: '1', carbMax: '1' }), 'Gym day calories: Max must be greater than or equal to Min');
    assert.equal(findRangeError({ ...d, carbMax: '1' }), 'Carb multiplier: Max must be greater than or equal to Min');
  });
});

describe('unsaved changes', () => {
  const ids = ['t1'];
  test('a fresh draft is clean, a real edit is dirty, and going back is clean again', () => {
    const d = draftFromData(saved(), NOW);
    assert.equal(isDraftDirty(d, saved(), ids, NOW), false);
    assert.equal(isDraftDirty({ ...d, height: '181' }, saved(), ids, NOW), true);
    assert.equal(isDraftDirty({ ...d, height: '180' }, saved(), ids, NOW), false);
  });
  test('typing only a blank max where the min is the saved max is not a change', () => {
    const s = saved({ gym_day_calorie_target_max: 2300 });
    assert.equal(isDraftDirty({ ...draftFromData(s, NOW), gymMax: '' }, s, ids, NOW), false);
  });
  test('a template pick for a deleted template is not a change', () => {
    const d = draftFromData(saved(), NOW);
    assert.equal(isDraftDirty({ ...d, dayTemplates: { ...d.dayTemplates, '5': 'other-gone' } }, saved(), ids, NOW), false);
  });
});

describe('BMI', () => {
  test('needs both numbers; bands are half-open', () => {
    assert.equal(computeBmi(null, 80), null);
    assert.equal(computeBmi(180, 0), null);
    assert.equal(bmiBandIndex(null), -1);
    assert.equal(bmiBandIndex(18.4), 0);
    assert.equal(bmiBandIndex(18.5), 1);
    assert.equal(bmiBandIndex(25), 2);
    assert.equal(bmiBandIndex(30), 3);
  });
  test('marker is clamped to the ends of the scale', () => {
    assert.equal(bmiMarkerPercent(10), 0);
    assert.equal(bmiMarkerPercent(25), 50);
    assert.equal(bmiMarkerPercent(50), 100);
  });
});

describe('history timelines', () => {
  const p = (id: string, value: number, at: string) => ({ id, value, changed_at: at });
  test('single values: newest first', () => {
    const rows = singleHistoryRows([p('a', 80, '2026-08-01T10:00:00Z'), p('c', 76, '2026-10-01T10:00:00Z'), p('b', 78, '2026-09-01T10:00:00Z')]);
    assert.deepEqual(rows.map((r) => [r.id, r.min, r.max]), [['c', 76, null], ['b', 78, null], ['a', 80, null]]);
  });
  test('min and max logged by the same save become ONE change', () => {
    const rows = rangeHistoryRows(
      [p('m1', 2200, '2026-09-01T10:00:00.100Z'), p('m2', 2300, '2026-10-01T10:00:00.100Z')],
      [p('x1', 2500, '2026-09-01T10:00:00.400Z'), p('x2', 2600, '2026-10-01T10:00:00.400Z')],
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => [r.min, r.max]), [[2300, 2600], [2200, 2500]]);
  });
  test('a change to one side carries the other side forward', () => {
    const rows = rangeHistoryRows(
      [p('m1', 2200, '2026-09-01T10:00:00Z')],
      [p('x1', 2500, '2026-09-01T10:00:00Z'), p('x2', 2700, '2026-10-05T10:00:00Z')],
    );
    assert.deepEqual(rows.map((r) => [r.min, r.max]), [[2200, 2700], [2200, 2500]]);
  });
  test('a max that was never logged stays null; a lone max with no min is not a row', () => {
    assert.deepEqual(rangeHistoryRows([p('m1', 2200, '2026-09-01T10:00:00Z')], []).map((r) => [r.min, r.max]), [[2200, null]]);
    assert.deepEqual(rangeHistoryRows([], [p('x1', 2500, '2026-09-01T10:00:00Z')]), []);
  });
  test('dates are UTC calendar days', () => {
    assert.equal(formatChangedAt('2026-10-01T23:30:00-05:00'), 'Oct 2, 2026');
    assert.equal(formatChangedAt('not a date'), 'not a date');
  });
});

describe('summary at the top', () => {
  const s = buildProfileSummary(saved(), 82, 3, NOW);
  const by = (list: { label: string }[], label: string) => list.find((i) => i.label === label)!;

  test('three groups in reading order', () => {
    assert.deepEqual(s.body.map((i) => i.label), ['Profile', 'Height', 'Latest weight', 'BMI']);
    assert.deepEqual(s.nutrition.map((i) => i.label), ['Gym days', 'Rest days', 'Protein', 'Carbs']);
    assert.deepEqual(s.training.map((i) => i.label), ['Workout days', 'Templates']);
  });
  test('profile line, target weight and BMI band are written out', () => {
    assert.equal(by(s.body, 'Profile') && (by(s.body, 'Profile') as { value: string }).value, 'Alex Test \u00b7 36 yrs \u00b7 Male');
    assert.equal((by(s.body, 'Latest weight') as { detail?: string }).detail, 'Target 78 kg');
    const bmi = by(s.body, 'BMI') as { value: string; detail?: string };
    assert.equal(bmi.value, '25.3');
    assert.equal(bmi.detail, 'Overweight');
  });
  test('ranges draw a dash and speak "to"; macros add grams a day at the latest weight', () => {
    const gym = by(s.nutrition, 'Gym days') as { value: string; spoken?: string };
    assert.equal(gym.value, '2,300\u20132,600 kcal');
    assert.equal(gym.spoken, '2,300 to 2,600 kcal');
    const protein = by(s.nutrition, 'Protein') as { value: string; detail?: string };
    assert.equal(protein.value, '1.8\u20132.2 g/kg');
    assert.match(protein.detail ?? '', /148\u2013180 g a day at 82 kg/);
  });
  test('workout days are Monday first with full names for assistive tech', () => {
    const days = by(s.training, 'Workout days') as { value: string; spoken?: string; detail?: string };
    assert.equal(days.value, 'Mon \u00b7 Wed \u00b7 Fri');
    assert.equal(days.spoken, 'Monday, Wednesday, Friday');
    assert.equal(days.detail, '3 a week');
    assert.equal((by(s.training, 'Templates') as { value: string }).value, '2 of 3 days');
    assert.deepEqual(WEEKDAYS.map((d) => d.v), [1, 2, 3, 4, 5, 6, 0]);
  });
  test('nothing saved says "Not set" in words and never invents numbers', () => {
    const empty = buildProfileSummary({
      full_name: null, dob: null, age: null, gender: null, height_cm: null, target_weight_kg: null,
      gym_day_calorie_target: null, gym_day_calorie_target_max: null, rest_day_calorie_target: null, rest_day_calorie_target_max: null,
      protein_multiplier: null, protein_multiplier_max: null, carb_multiplier: null, carb_multiplier_max: null,
      workout_days: [], workout_day_templates: {},
    }, null, 0, NOW);
    for (const i of [...empty.body, ...empty.nutrition, ...empty.training]) {
      assert.equal(i.value, 'Not set', i.label);
      assert.equal(i.set, false, i.label);
    }
  });
  test('without a weight, macros show only grams per kg', () => {
    const noWeight = buildProfileSummary(saved(), null, 3, NOW);
    assert.equal((by(noWeight.nutrition, 'Protein') as { detail?: string }).detail, undefined);
  });
});
