import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source guards for the Compare and Calendar workspaces: the rules that keep them accessible, honest and
// consistent with the shared primitives, checked where a mounted test cannot (class names, imports, wiring).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const COMPARE = [
  'src/pages/Compare.tsx',
  'src/components/compare/compareModel.ts',
  'src/components/compare/StepSection.tsx',
  'src/components/compare/CategoryPicker.tsx',
  'src/components/compare/RecordPicker.tsx',
  'src/components/compare/ComparisonResults.tsx',
];
const CALENDAR = [
  'src/pages/Calendar.tsx',
  'src/components/calendar/calendarModel.ts',
  'src/components/calendar/GroupMark.tsx',
  'src/components/calendar/MonthGrid.tsx',
  'src/components/calendar/MonthStats.tsx',
  'src/components/calendar/DayDetail.tsx',
];
const PALETTE = /\b(?:bg|text|border|fill|stroke|from|to|ring|divide)-(?:red|green|blue|yellow|orange|amber|emerald|rose|purple|violet|pink|cyan|teal|sky|indigo|lime|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;

describe('Compare and Calendar: shared rules', () => {
  for (const file of [...COMPARE, ...CALENDAR]) {
    const src = read(file);
    test(`${file}: semantic colours only, nothing under 12px, no raw <button>`, () => {
      assert.deepEqual(src.match(PALETTE) ?? [], []);
      assert.deepEqual(src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g) ?? [], []);
      const small = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => parseFloat(m[1]) < 12);
      assert.deepEqual(small.map((m) => m[0]), []);
      assert.deepEqual(src.match(/<button\b/g) ?? [], []);
    });
    test(`${file}: motion respects reduced-motion, no page reloads, no swipe gestures`, () => {
      for (const line of src.split('\n')) {
        if (/animate-(?:spin|pulse|bounce)/.test(line)) assert.ok(line.includes('motion-reduce:animate-none'), line.trim());
        if (/\btransition(?:-\w+)?\b/.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          assert.ok(/motion-reduce:transition-none|motion-safe:/.test(line), line.trim());
        }
      }
      assert.equal(/location\.reload\(/.test(src), false);
      assert.equal(/onTouch(?:Start|Move|End)|onDrag|onPointerMove/.test(src), false);
    });
  }
});

describe('dates: plain calendar days in UTC', () => {
  for (const file of [...COMPARE, ...CALENDAR]) {
    const src = read(file);
    test(`${file}: no local-time date parsing or date-fns formatting of a YYYY-MM-DD`, () => {
      assert.equal(/from 'date-fns'/.test(src), false);
      assert.equal(/new Date\((?:[a-z]+\.)?date\)/.test(src), false);
    });
  }
  test('the models format in UTC and take "today" from the shared UTC helper', () => {
    assert.match(read('src/components/compare/compareModel.ts'), /timeZone: 'UTC'/);
    const cal = read('src/components/calendar/calendarModel.ts');
    assert.match(cal, /timeZone: 'UTC'/);
    assert.match(cal, /defaultToday/);
    assert.equal(/new Date\(\)/.test(cal), false);
    assert.equal(/getMonth\(|getDate\(|getDay\(|getFullYear\(/.test(cal), false);
  });
});

describe('Compare: honest, neutral changes', () => {
  const src = COMPARE.map(read).join('\n');
  test('no red/green change colours and no judgement words', () => {
    // The change itself (chips, rows, headline) is neutral. The warning triangle of a failed source may use chart-warn.
    const change = ['src/components/compare/ComparisonResults.tsx', 'src/components/compare/compareModel.ts'].map(read).join('\n');
    assert.equal(/chart-min|chart-max|chart-warn|text-destructive|bg-destructive/.test(change), false);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const prose = [...code.matchAll(/'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2]).join(' ');
    assert.equal(/\b(?:better|worse|improved|declined|good|bad|great|poor)\b/i.test(prose), false);
  });
  test('the page keeps real checkboxes inside labels, a radio group for the metric, and a polite status', () => {
    const picker = read('src/components/compare/RecordPicker.tsx');
    assert.match(picker, /<Checkbox/);
    assert.match(picker, /<label/);
    assert.match(picker, /aria-live="polite"/);
    assert.match(read('src/components/compare/CategoryPicker.tsx'), /RadioGroupPrimitive\.Root/);
  });
  test('selection rules are not re-implemented in the page', () => {
    const page = read('src/pages/Compare.tsx');
    assert.match(page, /toggleSelection/);
    assert.match(page, /swapSelection/);
    assert.match(page, /resultsState/);
  });
  test('the change columns are labelled for assistive tech, the visual header is not duplicated', () => {
    const res = read('src/components/compare/ComparisonResults.tsx');
    assert.match(res, /md:sr-only/);
    assert.match(res, /aria-hidden="true" className=\{cn\('hidden border-b/);
    assert.match(res, /<dl>/);
  });
  test('steps are real sections with an h2 each, and the jump target takes focus', () => {
    const step = read('src/components/compare/StepSection.tsx');
    assert.match(step, /<section/);
    assert.match(step, /<h2/);
    assert.match(step, /tabIndex=\{-1\}/);
    assert.match(read('src/pages/Compare.tsx'), /prefers-reduced-motion/);
  });
});

describe('Calendar: scannable, accessible month', () => {
  const grid = read('src/components/calendar/MonthGrid.tsx');
  const page = read('src/pages/Calendar.tsx');
  test('day cells are shared Buttons with a pressed state, a current-date marker and a full accessible name', () => {
    assert.match(grid, /<Button/);
    assert.match(grid, /aria-pressed=\{isSelected\}/);
    assert.match(grid, /aria-current=\{isToday \? 'date' : undefined\}/);
    assert.match(grid, /aria-label=\{dayAriaLabel\(/);
  });
  test('today, selected and has-data differ by shape and weight, not only colour', () => {
    assert.match(grid, /rounded-full bg-primary|bg-primary font-bold/);
    assert.match(grid, /ring-2 ring-inset ring-primary/);
    assert.match(grid, /sm:hidden/);
    assert.match(grid, /hidden min-w-0 flex-col[^']*sm:flex/);
  });
  test('area shapes differ in form as well as colour', () => {
    const marks = read('src/components/calendar/GroupMark.tsx');
    for (const hint of ['rounded-full bg-primary', 'rounded-[2px]', 'rotate-45', 'clip-path', 'border-2 border-destructive']) assert.ok(marks.includes(hint), hint);
  });
  test('the grid fits 320px: seven equal columns, minimum-size cells, no fixed widths', () => {
    assert.match(grid, /grid grid-cols-7 gap-px/);
    assert.match(grid, /bg-border/);
    assert.match(grid, /min-w-0/);
    assert.equal(/\bw-\[\d+px\]|min-w-\[\d{3,}/.test(grid), false);
  });
  test('month navigation uses IconButton (44px on touch) and the month is a live heading', () => {
    assert.match(page, /<IconButton label="Previous month"/);
    assert.match(page, /<IconButton label="Next month"/);
    assert.match(page, /id="calendar-month-heading" aria-live="polite"/);
  });
  test('the agenda reuses the history primitives instead of a card per event', () => {
    const detail = read('src/components/calendar/DayDetail.tsx');
    assert.match(detail, /HistoryGroup/);
    assert.match(detail, /HistoryList/);
    assert.match(detail, /HistoryRow/);
    assert.equal(/<Card\b/.test(detail), false);
  });
  test('the page keeps the filter, the UTC today and the loading guard', () => {
    assert.match(page, /FILTER_OPTIONS/);
    assert.match(page, /todayIso\(\)/);
    assert.match(page, /resolveCalendarAvailability\(displayFilter/);
    for (const table of ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'daily_notes']) assert.match(page, new RegExp(`useSharedTableState\\('${table}'\\)`));
    assert.match(page, /prefers-reduced-motion/);
  });
});

describe('load, failure and stale states use the shared feedback primitives', () => {
  const compare = read('src/pages/Compare.tsx');
  const calendar = read('src/pages/Calendar.tsx');
  test('Compare reads the real table state for all four sources and retries through each hook', () => {
    for (const table of ['meals', 'gym_sessions', 'weight', 'sleep']) assert.match(compare, new RegExp(`useSharedTableState\\('${table}'\\)`));
    assert.match(compare, /PartialDataNotice/);
    assert.match(compare, /DataLoadError/);
    assert.match(compare, /refetch: refetchMeals/);
    assert.equal(/loading: (?:meals|gym|weight|sleep)Loading/.test(compare), false, 'the hooks\' loading flag alone cannot tell a failed load from an empty one');
  });
  test('Compare never derives "none logged" from a bare empty list', () => {
    assert.match(compare, /availability\[id\]\.view === 'ready'/);
    assert.match(read('src/components/compare/CategoryPicker.tsx'), /tileCountText/);
  });
  test('Calendar gates the grid, totals and agenda, and keeps the header controls', () => {
    assert.match(calendar, /unavailable \? \(/);
    assert.match(calendar, /DataLoadError/);
    assert.match(calendar, /PartialDataNotice/);
    assert.match(calendar, /missing=\{availability\.missing\}/);
    assert.match(read('src/components/calendar/DayDetail.tsx'), /SectionUnavailable/);
    // The month and filter controls sit above the gate.
    assert.ok(calendar.indexOf('Previous month') < calendar.indexOf('unavailable ? ('));
    assert.ok(calendar.indexOf('Filter calendar entries') < calendar.indexOf('unavailable ? ('));
  });
  test('Calendar no longer reads the hooks\' loading flags', () => {
    assert.equal(/loading: (?:meals|sessions|weight|sleep|waist|notes)Loading/.test(calendar), false);
  });
});
