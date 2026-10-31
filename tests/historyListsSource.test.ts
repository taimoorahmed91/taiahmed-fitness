import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source guards for the grouped Meals / Gym history lists: the rules that keep them accessible and honest,
// checked where a mounted test cannot (class names, imports, wiring).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const LISTS = ['src/components/MealList.tsx', 'src/components/GymList.tsx'];
const HISTORY = [
  'src/components/history/HistoryGroup.tsx',
  'src/components/history/HistoryRow.tsx',
  'src/components/history/ActionTray.tsx',
  'src/components/history/HistoryPager.tsx',
  'src/components/history/WorkoutDetail.tsx',
  'src/components/history/useGroupPagination.ts',
  'src/components/history/useMinWidth.ts',
  'src/components/history/MetricHistoryList.tsx',
  'src/components/history/WhoopHistoryList.tsx',
  'src/components/history/BandChip.tsx',
  'src/components/history/DayStamp.tsx',
  'src/components/history/historyVariants.ts',
  'src/components/history/SleepBar.tsx',
  'src/components/history/WeekPattern.tsx',
];
const PALETTE = /\b(?:bg|text|border|fill|stroke|from|to|ring|divide)-(?:red|green|blue|yellow|orange|amber|emerald|rose|purple|violet|pink|cyan|teal|sky|indigo|lime|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;

describe('history lists: shared rules', () => {
  for (const file of [...LISTS, ...HISTORY]) {
    const src = read(file);
    test(`${file}: semantic colours only, nothing under 12px`, () => {
      assert.deepEqual(src.match(PALETTE) ?? [], []);
      assert.deepEqual(src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g) ?? [], []);
      const small = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => parseFloat(m[1]) < 12);
      assert.deepEqual(small.map((m) => m[0]), []);
    });
    test(`${file}: no swipe or drag gestures (every action is a visible button)`, () => {
      assert.equal(/onTouch(Start|Move|End)|onPointer(Down|Move|Up)|onDrag|onSwipe|useSwipe|@use-gesture/.test(src), false);
    });
    test(`${file}: any animation respects reduced motion`, () => {
      for (const line of src.split('\n')) {
        if (/animate-spin|animate-in|transition-transform|transition-opacity/.test(line)) {
          assert.match(line, /motion-reduce:|motion-safe:/, line.trim());
        }
      }
    });
  }

  test('lists never turn a stored YYYY-MM-DD into a local Date (the off-by-one-day bug)', () => {
    for (const file of LISTS) {
      const src = read(file);
      assert.equal(/new Date\(\s*(meal|session)\.date/.test(src), false, `${file} must format dates through historyDates`);
      assert.equal(/toLocaleDateString/.test(src), false, `${file} must format dates through historyDates`);
    }
  });

  test('lists page by whole groups, not by raw row slices', () => {
    for (const file of LISTS) {
      const src = read(file);
      assert.match(src, /useGroupPagination/);
      assert.doesNotMatch(src, /usePagination|PaginationControls/);
    }
  });

  test('lists have no raw <button>: row controls come from the shared history components', () => {
    for (const file of LISTS) assert.equal((read(file).match(/<button\b/g) ?? []).length, 0, file);
  });
});

describe('history lists: row structure', () => {
  const row = read('src/components/history/HistoryRow.tsx');
  test('the summary is one disclosure button with expanded state, controls and a 44px target', () => {
    assert.match(row, /aria-expanded=\{expanded\}/);
    assert.match(row, /aria-controls=\{panelId\}/);
    assert.match(row, /min-h-11/);
    assert.match(row, /focus-visible:ring-2/);
  });
  test('actions are rendered beside the disclosure button, not inside it', () => {
    const afterButton = row.slice(row.indexOf('</button>'));
    assert.match(afterButton, /\{actions\}/);
    const insideButton = row.slice(row.indexOf('<button'), row.indexOf('</button>'));
    assert.doesNotMatch(insideButton, /\{actions\}|\{panel\}/);
  });
  test('the open panel animates only when motion is allowed', () => {
    assert.match(row, /motion-safe:animate-in/);
    assert.match(row, /motion-reduce:transition-none/);
  });
  const actions = read('src/components/history/ActionTray.tsx');
  test('tray buttons are 44px and delete always goes through ConfirmDeleteButton', () => {
    assert.match(actions, /size="touch"/);
    assert.match(actions, /min-h-11/);
    assert.match(actions, /ConfirmDeleteButton/);
    assert.doesNotMatch(actions, /onDelete\(/);
  });
  test('inline actions are only hidden where hover exists, so touch devices always see them', () => {
    assert.match(actions, /\[@media\(hover:hover\)\]:opacity-0/);
    assert.match(actions, /group-focus-within\/row:opacity-100/);
  });
  test('group headers stick only on tall screens', () => {
    assert.match(read('src/components/history/HistoryGroup.tsx'), /\[@media\(min-height:40rem\)\]:sticky/);
  });
});

describe('history lists: visual system', () => {
  const variants = read('src/components/history/historyVariants.ts');
  test('every variant is made from existing colour tokens only', () => {
    assert.doesNotMatch(variants, /hsl\(\d/);
    for (const token of variants.match(/var\(--[a-z0-9-]+\)/g) ?? []) {
      assert.match(token, /var\(--(primary|chart-2|chart-3|foreground)\)/);
    }
  });
  test('the variants the pages use all exist', () => {
    for (const name of ['default', 'meal', 'workout', 'sleep', 'measurement']) assert.match(variants, new RegExp(`\\b${name}: \\{`));
  });
  test('group bands keep an opaque layer under the sticky heading, and hide their marker from screen readers', () => {
    const group = read('src/components/history/HistoryGroup.tsx');
    assert.match(group, /bg-card \[@media\(min-height:40rem\)\]:sticky/);
    assert.match(group, /aria-hidden="true" className="col-start-1 row-span-2/);
  });
  test('the timeline and the week pattern are decorative', () => {
    assert.match(read('src/components/history/HistoryRow.tsx'), /TimelineNode[\s\S]*aria-hidden="true"/);
    assert.match(read('src/components/history/WeekPattern.tsx'), /sr-only/);
    assert.match(read('src/components/history/SleepBar.tsx'), /aria-hidden="true"/);
  });
  test('arbitrary min-width variants use px (rem values are silently dropped by this Tailwind setup)', () => {
    for (const file of [...LISTS, ...HISTORY]) assert.doesNotMatch(read(file), /min-\[[\d.]+rem\]/, file);
  });
  test('a pinned meal says so in words, not only with a coloured bolt', () => {
    const src = read('src/components/MealList.tsx');
    assert.match(src, /PinnedBadge/);
    assert.match(src, /Quick add<\/span>/);
    assert.match(src, /\(pinned to quick add\)/);
  });
  test('the tray marks an "on" toggle with a tick as well as a tint', () => {
    assert.match(read('src/components/history/ActionTray.tsx'), /pressed && <Check/);
  });
  test('Waist stays neutral: no good/bad colour in the measurement look or its change chip', () => {
    const variants = read('src/components/history/historyVariants.ts');
    const measurement = variants.slice(variants.indexOf('measurement: {'));
    assert.doesNotMatch(measurement, /chart-|destructive|primary/);
  });
});

describe('history lists: wiring', () => {
  test('MealList keeps the exact pin label the quick-add chips use', () => {
    assert.match(read('src/components/MealList.tsx'), /`Pin \$\{meal\.food\} to quick add`/);
    assert.match(read('src/components/MealForm.tsx'), /`Pin \$\{meal\.food\} to quick add`/);
  });
  test('MealList: filters turn day totals into "N of M shown"; calorie sort is flat', () => {
    const src = read('src/components/MealList.tsx');
    assert.match(src, /describeMealDay\(group\.items, mealsPerDate\[group\.date\] \?\? group\.items\.length, hasActiveFilters\)/);
    assert.match(src, /const flat = sortOrder !== null/);
    assert.match(src, /showDate=\{flat\}/);
  });
  test('Gym page hands GymList the unfiltered sessions and keeps its loading / error branches ahead of the list', () => {
    const src = read('src/pages/Gym.tsx');
    assert.match(src, /allSessions=\{sessions\}/);
    assert.ok(src.indexOf("sections.history.view === 'loading' ? (") < src.indexOf('<GymList'));
    assert.ok(src.indexOf("sections.history.view === 'error' ? (") < src.indexOf('<GymList'));
    assert.match(src, /sessions=\{filteredSessions\}/);
  });
  test('GymList orders same-day sessions through the shared helper and shows weekly groups', () => {
    const src = read('src/components/GymList.tsx');
    assert.match(src, /groupSessionsByWeek\(sortSessionsNewestFirst\(sessions\)\)/);
    assert.match(src, /isoWeekString/);
  });
});

describe('body and WHOOP history: wiring and rules', () => {
  const PAGES = ['Weight', 'Waist', 'Sleep'] as const;
  for (const page of PAGES) {
    const src = read(`src/pages/${page}.tsx`);
    test(`${page}: history is the shared grouped list, not repeated bordered cards, and keeps its state handling`, () => {
      assert.match(src, /<MetricHistoryList/);
      assert.doesNotMatch(src, /usePagination|PaginationControls|IconButton|ICON_TOUCH_CLASS/);
      assert.doesNotMatch(src, /rounded-lg border bg-card/);
      // loading / first-load error / true empty / filtered-empty are still decided here, ahead of the list.
      assert.ok(src.indexOf("view === 'loading'") < src.indexOf('<MetricHistoryList'));
      assert.ok(src.indexOf("view === 'error'") < src.indexOf('<MetricHistoryList'));
      assert.match(src, /filteredEntries\.length === 0/);
      assert.match(src, /<StaleDataNotice/);
    });
    test(`${page}: edit dialog and mutation flow are untouched`, () => {
      assert.match(src, /confirmedSuccess\(\(\) => updateEntry\(id, draft\), \{ requireTrue: true \}\)/);
      assert.match(src, /onDelete=\{deleteEntry\}/);
      assert.match(src, /onEdit=\{handleEdit\}/);
    });
    test(`${page}: dates are never built with new Date('YYYY-MM-DD')`, () => {
      assert.doesNotMatch(src, /new Date\(entry\.date\)/);
      assert.doesNotMatch(src, /format\(new Date\(entry/);
    });
  }
  test('WHOOP page: the 20-column table and per-day cards are gone; the weekly list replaces them and nothing is dropped', () => {
    const src = read('src/pages/WhoopData.tsx');
    assert.match(src, /<WhoopHistoryList/);
    assert.doesNotMatch(src, /min-w-\[1400px\]|<TableHeader|COLUMNS|usePagination|PaginationControls/);
    assert.match(src, /rawApiResponse/);
    assert.match(src, /<EditWhoopEntryDialog/);
    assert.match(src, /onDelete=\{deleteEntry\}/);
  });
  test('change from the previous entry is never coloured or worded as good / bad', () => {
    const src = read('src/components/history/MetricHistoryList.tsx');
    assert.doesNotMatch(src, /text-chart|text-destructive|text-primary|bg-chart/);
  });
  test('the WHOOP edit dialog fills itself when it opens and labels every field', () => {
    const src = read('src/components/EditWhoopEntryDialog.tsx');
    assert.match(src, /useEffect\(\(\) => \{\s*if \(!open \|\| !entry\) return;/);
    assert.match(src, /htmlFor=\{`whoop-edit-\$\{f\.key\}`\}/);
    assert.match(src, /DialogDescription/);
  });
  test('weekly and monthly groups never split across pages', () => {
    for (const file of ['MetricHistoryList', 'WhoopHistoryList']) {
      assert.match(read(`src/components/history/${file}.tsx`), /useGroupPagination/);
    }
  });
});
