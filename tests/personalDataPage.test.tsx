import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Flame } from 'lucide-react';
import { BmiMeter } from '../src/components/personal-data/BmiMeter';
import { ProfileSummary } from '../src/components/personal-data/ProfileSummary';
import { RangeField } from '../src/components/personal-data/RangeField';
import { ScheduleEditor } from '../src/components/personal-data/ScheduleEditor';
import { SettingsSection } from '../src/components/personal-data/SettingsSection';
import { ValueHistory } from '../src/components/personal-data/ValueHistory';
import { buildProfileSummary } from '../src/components/personal-data/model';

// Rendered and source checks for the redesigned Personal Data page: information architecture, responsive layout,
// accessibility contracts and the behaviour that must not change. Behaviour with a real DOM is in tests/mounted/personalData.dom.tsx.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const DIR = 'src/components/personal-data';
const FILES = [
  'src/pages/PersonalData.tsx',
  ...readdirSync(new URL(`../${DIR}/`, import.meta.url)).filter((f) => /\.(tsx?|ts)$/.test(f)).map((f) => `${DIR}/${f}`),
];
const page = read('src/pages/PersonalData.tsx');
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (haystack: string, re: RegExp) => (haystack.match(re) ?? []).length;

const PALETTE = /\b(?:bg|text|border|fill|stroke|from|to|ring|divide)-(?:red|green|blue|yellow|orange|amber|emerald|rose|purple|violet|pink|cyan|teal|sky|indigo|lime|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;

describe('Personal Data files follow the shared UI rules', () => {
  for (const file of FILES) {
    const src = read(file);
    test(`${file}: shared controls, semantic colours, 12px floor, reduced motion, no overlays`, () => {
      assert.deepEqual(src.match(/<button\b/g) ?? [], [], 'no raw <button>');
      assert.deepEqual(src.match(PALETTE) ?? [], [], 'no palette colours');
      assert.deepEqual(src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)?.filter((m) => !/^#\d+$/.test(m)) ?? [], [], 'no hex');
      assert.deepEqual([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => parseFloat(m[1]) < 12), [], 'no text below 12px');
      for (const line of src.split('\n')) {
        if (/\banimate-|\btransition-/.test(line) && !/duration-|transition-\[/.test(line)) {
          assert.ok(/motion-reduce:|motion-safe:/.test(line), `motion must respect reduced motion: ${line.trim()}`);
        }
      }
      // The signed-in shell keeps the chat button clear; a page must not add its own fixed or sticky layer on top of it.
      assert.equal(/\b(?:fixed|sticky)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'no fixed/sticky layers');
      assert.equal(/<Label>(?!<)/.test(src), false, 'no <Label> without htmlFor');
      assert.equal(/location\.reload\(/.test(src), false);
    });
  }
});

describe('information architecture', () => {
  test('page order: summary, profile, targets, schedule, ONE save bar, then the separate-save settings', () => {
    const at = (needle: string) => {
      const i = page.indexOf(needle);
      assert.ok(i >= 0, `missing ${needle}`);
      return i;
    };
    const order = [
      '<PageHeader', '<ProfileSummary', 'id="profile"', 'id="targets"', 'id="schedule"',
      'Save profile, targets &amp; schedule', 'title="More settings"', '<RestTimersSection', '<InsightCutoffsSection', '<ApiTokenSection',
    ].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(count(page, /Save profile, targets/g), 1, 'one main save button');
    assert.equal(count(page, /<SettingsSection\b/g), 3, 'three always-open sections on the page itself');
  });
  test('the three core sections are always open; only the occasional ones fold away', () => {
    assert.equal(/<SettingsSection[^>]*\bcollapsible\b/.test(page), false);
    for (const f of ['RestTimersSection', 'InsightCutoffsSection', 'ApiTokenSection']) {
      const src = read(`${DIR}/${f}.tsx`);
      assert.match(src, /collapsible/, f);
      assert.match(src, /summary=\{?/, `${f} keeps its current value in the header`);
      assert.match(src, /headingLevel="h3"/, f);
    }
  });
  test('summary links to the three core sections, and those anchors exist', () => {
    const summary = read(`${DIR}/ProfileSummary.tsx`);
    for (const id of ['profile', 'targets', 'schedule']) {
      assert.match(summary, new RegExp(`editHref="#${id}"`), id);
      assert.match(page, new RegExp(`id="${id}"`), id);
    }
  });
  test('history sits next to its value: target weight and the two calorie ranges, not a section of its own', () => {
    assert.equal(count(page, /<ValueHistory\b/g), 3);
    assert.equal(/title="[^"]*[Hh]istory/.test(page), false);
  });
  test('headings: one h1 (PageHeader), h2 for sections, h3 for the folded settings', () => {
    assert.match(page, /<PageHeader/);
    assert.match(page, /<PageSection\s+title="More settings"/); // h2
    const section = read(`${DIR}/SettingsSection.tsx`);
    assert.match(section, /headingLevel = 'h2'/);
    assert.match(read(`${DIR}/ProfileSummary.tsx`), /headingLevel="h2"/);
  });
});

describe('rendered pieces', () => {
  const summaryModel = buildProfileSummary(
    {
      full_name: 'Alex', dob: null, age: 36, gender: 'F', height_cm: 170, target_weight_kg: null,
      gym_day_calorie_target: 2300, gym_day_calorie_target_max: 2600, rest_day_calorie_target: null, rest_day_calorie_target_max: null,
      protein_multiplier: null, protein_multiplier_max: null, carb_multiplier: null, carb_multiplier_max: null,
      workout_days: [1, 3], workout_day_templates: {},
    },
    70, 2, new Date('2026-10-31T00:00:00Z'),
  );

  test('summary: h2, three h3 groups, definition lists, Edit links, "Not set" in words', () => {
    const out = html(createElement(ProfileSummary, { model: summaryModel }));
    assert.equal(count(out, /<h2\b/g), 1);
    assert.equal(count(out, /<h3\b/g), 3);
    assert.equal(count(out, /<dl\b/g), 3);
    for (const href of ['#profile', '#targets', '#schedule']) assert.ok(out.includes(`href="${href}"`), href);
    assert.match(out, /Not set/);
    assert.match(out, /2,300\u20132,600 kcal/);
    assert.match(out, /2,300 to 2,600 kcal/); // spoken form
    assert.match(out, /Alex \u00b7 36 yrs \u00b7 Female/);
  });
  test('summary: three columns from md, one column on a phone, values wrap instead of overflowing', () => {
    const out = html(createElement(ProfileSummary, { model: summaryModel }));
    assert.match(out, /md:grid-cols-3/);
    assert.match(out, /break-words/);
    assert.match(out, /<dt[^>]*>Profile<\/dt>/);
  });

  test('always-open section: heading, description and a single divider class for the rows', () => {
    const out = html(createElement(SettingsSection, { id: 'x', icon: Flame, title: 'Nutrition targets', description: 'About it' }, createElement('p', null, 'row')));
    assert.match(out, /<section id="x" aria-labelledby=/);
    assert.match(out, /<h2[^>]*>Nutrition targets<\/h2>/);
    assert.match(out, /divide-y/);
    assert.match(out, /row/);
  });
  test('folded section: heading holds the toggle, summary is visible while closed, body is not rendered', () => {
    const out = html(createElement(SettingsSection, { icon: Flame, title: 'Rest timers', headingLevel: 'h3', collapsible: true, summary: '60 s between sets' }, createElement('p', null, 'secret-body')));
    assert.match(out, /<h3[^>]*><button/);
    assert.match(out, /aria-expanded="false"/);
    assert.match(out, /aria-label="Rest timers"/);
    assert.match(out, /aria-describedby=/);
    assert.match(out, /60 s between sets/);
    assert.doesNotMatch(out, /secret-body/);
  });
  test('folded section can start open and then shows its body; the toggle is 44px on touch', () => {
    const out = html(createElement(SettingsSection, { icon: Flame, title: 'T', collapsible: true, defaultOpen: true, summary: 's' }, createElement('p', null, 'visible-body')));
    assert.match(out, /aria-expanded="true"/);
    assert.match(out, /visible-body/);
    assert.match(out, /min-h-11/);
  });

  const range = (over: Record<string, unknown> = {}) => html(createElement(RangeField, {
    label: 'Gym day calories', description: 'On workout days.', unit: 'kcal', min: '2300', max: '2600',
    onMin: () => {}, onMax: () => {}, placeholders: ['a', 'b'], emptyNote: 'Not set.', ...over,
  } as never));
  test('range: one labelled group, min and max both name their unit, the range in use is written out', () => {
    const out = range();
    assert.match(out, /role="group" aria-labelledby=/);
    assert.match(out, />Min \(kcal\)</);
    assert.match(out, />Max \(kcal\)</);
    assert.match(out, /In use:/);
    assert.match(out, /2,300\u20132,600 kcal/);
    assert.doesNotMatch(out, /aria-invalid/);
  });
  test('range: an inverted pair shows a linked text error with an icon, not just a red border', () => {
    const out = range({ max: '2000' });
    assert.equal(count(out, /aria-invalid="true"/g), 2);
    assert.match(out, /Max must be the same as or higher than Min\./);
    assert.match(out, /<svg[^>]*aria-hidden="true"/);
    const errorId = /<p id="([^"]+-error)"/.exec(out)?.[1];
    assert.ok(errorId, 'error has an id');
    assert.ok(out.includes(`aria-describedby="`) && out.includes(errorId!), 'inputs point at the error');
    assert.doesNotMatch(out, /In use:/);
  });
  test('range: protein/carbs show grams a day at the body weight; empty says what happens instead', () => {
    assert.match(range({ unit: 'g/kg', min: '1.8', max: '2.2', bodyWeightKg: 82 }), /about <span aria-hidden="true">148\u2013180 g a day<\/span>.*at 82 kg/);
    assert.match(range({ min: '', max: '', emptyNote: 'Not set. Falls back.' }), /Not set\. Falls back\./);
  });
  test('range: the two inputs sit side by side and can shrink, so 320px never overflows', () => {
    const out = range();
    assert.match(out, /grid grid-cols-2 gap-3 sm:max-w-sm/);
    assert.equal(count(out, /min-w-0 space-y-1\.5/g), 2);
  });

  test('history: current value and date are always shown; earlier ones sit behind one toggle named for the field', () => {
    const rows = [
      { id: 'a', changedAt: '2026-10-01T10:00:00Z', min: 2300, max: 2600 },
      { id: 'b', changedAt: '2026-09-01T10:00:00Z', min: 2200, max: 2500 },
      { id: 'c', changedAt: '2026-08-01T10:00:00Z', min: 2100, max: 2400 },
    ];
    const out = html(createElement(ValueHistory, { rows, unit: 'kcal', label: 'Gym day calories' }));
    assert.match(out, /Current:/);
    assert.match(out, /Oct 1, 2026/);
    assert.match(out, /Show 2 earlier/);
    assert.match(out, /Gym day calories values/);
    assert.match(out, /aria-expanded="false"/);
    assert.doesNotMatch(out, /Sep 1, 2026/); // earlier rows only after opening
  });
  test('history: a long list is previewed, then "Show all"', () => {
    const src = read(`${DIR}/ValueHistory.tsx`);
    assert.match(src, /EARLIER_PREVIEW = 5/);
    assert.match(src, /Show all \{earlier\.length\} earlier/);
    assert.match(src, /Dates are shown in UTC/);
  });

  test('schedule: Monday first, 44px rows, off days say "Rest day" in words, picker only on workout days', () => {
    const out = html(createElement(ScheduleEditor, {
      workoutDays: [1, 3], dayTemplates: { '1': 't1' }, templates: [{ id: 't1', name: 'Push' }], onToggleDay: () => {}, onTemplate: () => {},
    }));
    assert.ok(out.indexOf('Monday') < out.indexOf('Tuesday') && out.indexOf('Saturday') < out.indexOf('Sunday'));
    assert.equal(count(out, /<li\b/g), 7);
    assert.equal(count(out, /min-h-11/g) >= 14, true);
    assert.equal(count(out, /aria-label="Template for /g), 2);
    assert.equal(count(out, /Rest day/g), 5 * 2); // phone label hint + desktop cell, one of each hidden by CSS per breakpoint
  });

  test('BMI: value, band name, glyph, scale and "Your BMI" marker; empty state asks for what is missing', () => {
    const out = html(createElement(BmiMeter, { heightCm: 180, weightKg: 82 }));
    assert.match(out, /25\.3/);
    assert.match(out, /Overweight/);
    assert.match(out, /aria-current="true"/);
    assert.match(out, /Your BMI/);
    assert.match(html(createElement(BmiMeter, { heightCm: null, weightKg: 82 })), /Enter your height and log a weight entry/);
  });
});

describe('responsive layout', () => {
  test('settings rows: label above the control on a phone, fixed label column from md', () => {
    const src = read(`${DIR}/SettingsRow.tsx`);
    assert.match(src, /md:grid-cols-\[minmax\(0,13rem\)_minmax\(0,1fr\)\]/);
    assert.match(src, /min-w-0/);
  });
  test('date of birth and age stack below sm so the native date picker is never clipped', () => {
    assert.match(page, /grid grid-cols-1 gap-3 sm:max-w-md sm:grid-cols-2 \[&>\*\]:min-w-0/);
  });
  test('the page is narrower than the old max-w-6xl and uses the shared container', () => {
    assert.match(page, /<PageContainer className="max-w-4xl">/);
  });
  test('save bar stacks on a phone with a full-width button', () => {
    assert.match(page, /flex flex-col gap-3 [^"]*sm:flex-row sm:items-center sm:justify-between/);
    assert.match(page, /className="w-full sm:w-auto"/);
  });
  test('long text can wrap: token, history and summary values use break-words / break-all', () => {
    assert.match(read(`${DIR}/ApiTokenSection.tsx`), /break-all/);
    assert.match(read(`${DIR}/ValueHistory.tsx`), /break-words/);
  });
  test('nothing in the page sets a fixed width wider than a 320px phone can hold', () => {
    for (const file of FILES) {
      for (const m of read(file).matchAll(/(?<![-\w:])w-\[(\d+)px\]/g)) assert.ok(Number(m[1]) <= 256, `${file}: ${m[0]}`);
    }
  });
});

describe('behaviour that must not change', () => {
  test('main save: validates ranges with the same toast, saves the payload, refreshes history, same messages', () => {
    assert.match(page, /findRangeError\(draft\)/);
    assert.match(page, /toast\.error\(rangeError\)/);
    assert.match(page, /const payload = buildSavePayload\(draft, templateIds\);\s+const \{ error \} = await save\(payload\)/);
    assert.match(page, /toast\.error\('Failed to save personal data'\)/);
    assert.match(page, /toast\.success\('Personal data saved'\)/);
    assert.match(page, /refetchHistory\(\)/);
    assert.match(page, /loading=\{saving\}/);
  });
  test('date of birth still fills in the age, age still accepts only numbers', () => {
    assert.match(page, /handleDobChange/);
    assert.match(page, /numeric\('age'\)/);
  });
  test('API token: same three actions, hash-only wording, confirm before revoke, copy-now notice', () => {
    const src = read(`${DIR}/ApiTokenSection.tsx`);
    assert.match(src, /functions\.invoke\('api-token', \{ body: \{ action \} \}\)/);
    for (const a of ["'status'", "'generate'", "'revoke'"]) assert.ok(src.includes(a), a);
    assert.match(src, /<ConfirmDeleteButton/);
    assert.match(src, /confirmationTitle="Revoke token\?"/);
    assert.match(src, /Copy now — this token will not be shown again/);
    assert.match(src, /SHA-256/);
    assert.match(src, /once every 30 seconds/);
    assert.match(src, /setOpen\(true\)/); // a new token opens the section so it can be copied
  });
  test('rest timers: same 5 to 900 validation and messages, saved through updateRestTimers', () => {
    const src = read(`${DIR}/RestTimersSection.tsx`);
    assert.match(src, /s < 5 \|\| e < 5 \|\| s > 900 \|\| e > 900/);
    assert.match(src, /Enter whole numbers between 5 and 900 seconds in both fields\./);
    assert.match(src, /updateRestTimers\(s, e\)/);
  });
  test('insight cutoffs: same limits, messages, defaults and device storage hook', () => {
    const src = read(`${DIR}/InsightCutoffsSection.tsx`);
    assert.match(src, /r > 0 && r <= 100/);
    assert.match(src, /s > 0 && s <= 24/);
    assert.match(src, /Insight cutoffs saved/);
    assert.match(src, /DEFAULT_RECOVERY_CUTOFF/);
    assert.match(src, /useInsightThresholds/);
  });
  test('no data, hook, database or style files were touched by the redesign', () => {
    assert.equal(/supabase\.from\(/.test(page), false, 'the page itself does not query the database');
    for (const f of ['usePersonalData', 'usePersonalDataHistory']) assert.match(page, new RegExp(`@/hooks/${f}`));
  });
});
