import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readSupplements, findSupplementError } from '../src/components/personal-data/supplements';
import { buildSavePayload, draftFromData, isDraftDirty } from '../src/components/personal-data/model';
import type { PersonalData } from '../src/hooks/usePersonalData';

const profile = {
  full_name: null, dob: null, age: null, gender: null, height_cm: null, target_weight_kg: null,
  gym_day_calorie_target: null, gym_day_calorie_target_max: null, rest_day_calorie_target: null, rest_day_calorie_target_max: null,
  protein_multiplier: null, protein_multiplier_max: null, carb_multiplier: null, carb_multiplier_max: null,
  workout_days: [], workout_day_templates: {},
} satisfies PersonalData;

describe('supplement schedules', () => {
  test('each supplement retains its own dose and weekday schedule through saving and loading', () => {
    const supplements = [
      { id: 'creatine', name: 'Creatine', usage: '2.5 g', days: [1, 3, 5] },
      { id: 'vitamin', name: 'Vitamin D', usage: '1 capsule with food', days: [0, 6] },
    ];
    const draft = { ...draftFromData(profile), supplements };
    const payload = buildSavePayload(draft, []);
    assert.deepEqual(payload.supplements, [supplements[0], { ...supplements[1], days: [6, 0] }]);
    assert.deepEqual(draftFromData(payload).supplements, payload.supplements);
    assert.equal(isDraftDirty(draft, profile, []), true);
    assert.equal(isDraftDirty(draftFromData(payload), payload, []), false);
  });
  test('a supplement needs a name, a dose or usage, and at least one weekday', () => {
    const supplement = { id: 'a', name: '', usage: '', days: [] };
    assert.equal(findSupplementError([supplement]), 'Enter a name for each supplement.');
    assert.equal(findSupplementError([{ ...supplement, name: 'Creatine' }]), 'Enter a dose or usage for Creatine.');
    assert.equal(findSupplementError([{ ...supplement, name: 'Creatine', usage: '5 g' }]), 'Choose at least one day for Creatine.');
    assert.equal(findSupplementError([{ ...supplement, name: 'Creatine', usage: '5 g', days: [1] }]), null);
  });
  test('older profiles have no supplements and loading removes invalid or repeated weekdays', () => {
    assert.deepEqual(draftFromData(profile).supplements, []);
    assert.deepEqual(readSupplements([{ id: 'a', name: 'Creatine', usage: '5 g', days: [1, 1, 0, 7, -1, '2'] }]),
      [{ id: 'a', name: 'Creatine', usage: '5 g', days: [1, 0] }]);
  });
});