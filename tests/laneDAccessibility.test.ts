import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static guards for the "Wave 3 lane D" screens: shared controls, semantic colours,
// 12px text floor, linked labels and reduced-motion spinners. Reads the real source.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const OWNED = [
  'src/components/MealForm.tsx',
  'src/components/ConfirmDeleteButton.tsx',
  'src/components/workout/WorkoutExerciseCard.tsx',
  'src/components/EditWorkoutSessionModal.tsx',
  'src/components/PersonalRecordsList.tsx',
  'src/pages/PersonalData.tsx',
  'src/pages/ExtraActivities.tsx',
  'src/pages/OAuthConsent.tsx',
  'src/pages/Compare.tsx',
  'src/pages/Calendar.tsx',
  'src/pages/WhoopData.tsx',
  'src/components/ui/progress.tsx',
  'src/components/MealsTodayCard.tsx',
];

const PALETTE = /\b(?:bg|text|border|fill|stroke|from|to|ring|divide)-(?:red|green|blue|yellow|orange|amber|emerald|rose|purple|violet|pink|cyan|teal|sky|indigo|lime|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;

describe('lane D: owned files', () => {
  for (const file of OWNED) {
    const src = read(file);
    test(`${file}: no raw <button> elements`, () => {
      assert.deepEqual(src.match(/<button\b/g) ?? [], []);
    });
    test(`${file}: no hard-coded palette colours or hex values`, () => {
      assert.deepEqual(src.match(PALETTE) ?? [], []);
      assert.deepEqual(src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)?.filter((m) => !/^#\d+$/.test(m)) ?? [], []);
    });
    test(`${file}: no text smaller than 12px`, () => {
      const small = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => parseFloat(m[1]) < 12);
      assert.deepEqual(small.map((m) => m[0]), []);
    });
    test(`${file}: every animate-spin respects reduced motion`, () => {
      for (const line of src.split('\n')) {
        if (line.includes('animate-spin')) assert.ok(line.includes('motion-reduce:animate-none'), line.trim());
      }
    });
    test(`${file}: no page reloads`, () => {
      assert.equal(/location\.reload\(/.test(src), false);
    });
  }
});

describe('meal quick-add chips', () => {
  const src = read('src/components/MealForm.tsx');
  test('are a named group with 44px targets and a pressed state', () => {
    assert.match(src, /role="group" aria-labelledby="meal-quick-add-heading"/);
    assert.equal((src.match(/h-11 /g) ?? []).length >= 2, true);
    assert.match(src, /aria-pressed=\{fav\}/);
    assert.match(src, /fill-primary/);
  });
  test('use shared Button / IconButton, not stray <Label> without a control', () => {
    assert.match(src, /<IconButton/);
    assert.equal(/<Label className="text-xs uppercase/.test(src), false);
  });
});

describe('ConfirmDeleteButton keeps its protections', () => {
  const src = read('src/components/ConfirmDeleteButton.tsx');
  test('arming delay, single flight and outside-dismiss guard are intact', () => {
    assert.match(src, /350/);
    assert.match(src, /busy\.current/);
    assert.match(src, /Date\.now\(\) - openedAt\.current < 350/);
    assert.match(src, /onEscapeKeyDown/);
  });
  test('arming timer is cleared so it cannot arm a later opening early', () => {
    assert.match(src, /clearTimeout/);
  });
  test('shows a visible readiness cue and a 44px target', () => {
    assert.match(src, /Getting ready/);
    assert.match(src, /min-h-11/);
    assert.match(src, /aria-disabled=\{!ready \|\| pending/);
  });
  test('cancel stays first and receives initial focus (no preventDefault on open)', () => {
    const open = src.slice(src.indexOf('onOpenAutoFocus'));
    assert.equal(/preventDefault/.test(open.slice(0, open.indexOf('onEscapeKeyDown'))), false);
    assert.ok(src.indexOf('AlertDialogCancel') < src.indexOf('variant="destructive"'));
  });
});

describe('semantic colours and non-colour cues', () => {
  test('progress track uses the semantic token', () => {
    const src = read('src/components/ui/progress.tsx');
    assert.match(src, /bg-progress-track/);
    assert.equal(/bg-secondary/.test(src), false);
    assert.match(src, /value=\{value\}/);
  });
  test('meal split and intensity bars use bg-progress-track', () => {
    assert.match(read('src/components/MealsTodayCard.tsx'), /bg-progress-track/);
    assert.match(read('src/pages/ExtraActivities.tsx'), /bg-progress-track/);
  });
  test('BMI bands use chart roles and carry a glyph plus a name', () => {
    // The bands (colour role, glyph, name) live in the Personal Data model; the meter draws them.
    const bands = read('src/components/personal-data/model.ts');
    for (const role of ['bg-chart-warn', 'bg-chart-min', 'bg-chart-1', 'bg-chart-max']) assert.ok(bands.includes(role), role);
    const meter = read('src/components/personal-data/BmiMeter.tsx');
    assert.match(meter, /aria-current/);
    assert.match(meter, /Your BMI/);
  });
  test('intensity shows number, word and a meter, not only a tint', () => {
    const src = read('src/pages/ExtraActivities.tsx');
    assert.match(src, /IntensityMeter/);
    assert.match(src, /Intensity \{a\.intensity\} of 5/);
  });
  test('recovery adds a word band (High / Medium / Low) next to the number, in a chip that is never colour-only', () => {
    const lib = read('src/lib/bodyHistory.ts');
    assert.match(lib, /'High' : score >= 34 \? 'Medium' : 'Low'/);
    const list = read('src/components/history/WhoopHistoryList.tsx');
    assert.match(list, /<BandChip label=\{core\.band\} tone=\{recoveryTone\(core\.band\)\}/);
  });
});

describe('forms: labels, descriptions and validation', () => {
  test('ExtraActivities validates inline and keeps UTC "today"', () => {
    const src = read('src/pages/ExtraActivities.tsx');
    assert.match(src, /aria-invalid=\{errors\.activity/);
    assert.match(src, /aria-describedby=\{errors\.activity/);
    assert.match(src, /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/);
    assert.match(src, /setUTCDate/);
  });
  test('PersonalData min/max fields link labels, hints and errors', () => {
    const src = read('src/components/personal-data/RangeField.tsx');
    assert.match(src, /htmlFor=\{`\$\{uid\}-min`\}/);
    assert.match(src, /aria-invalid=\{invalid \|\| undefined\}/);
    for (const file of ['src/pages/PersonalData.tsx', 'src/components/personal-data/RangeField.tsx']) {
      assert.equal(/<Label>(?!<)/.test(read(file)), false, `${file}: no <Label> without htmlFor`);
    }
  });
  test('WHOOP URL validates and links its error', () => {
    const src = read('src/pages/WhoopData.tsx');
    assert.match(src, /whoop-url-error/);
    assert.match(src, /isWebUrl/);
  });
});

describe('OAuthConsent retry', () => {
  const src = read('src/pages/OAuthConsent.tsx');
  test('retries in-app with a clear label and does not hard reload', () => {
    assert.equal(/location\.reload/.test(src), false);
    assert.match(src, /Try loading the request again/);
    assert.match(src, /Back to the request/);
    assert.match(src, /setAttempt/);
  });
  test('keeps the redirect allowlist', () => {
    assert.match(src, /hostname !== "chatgpt\.com"/);
  });
});
