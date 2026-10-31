import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Final lane D residual guards: shared controls, semantic colours, 12px floor,
// no stale Navigation references, no empty interfaces, one dashboard range.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const OWNED = [
  'src/pages/HowTo.tsx',
  'src/pages/Dashboard.tsx',
  'src/components/layout/BottomNav.tsx',
  'src/components/layout/Page.tsx',
  'src/components/GymList.tsx',
  'src/components/DailyNotesList.tsx',
  'src/components/PaginationControls.tsx',
  'src/components/MealList.tsx',
  'src/components/ui/sidebar.tsx',
  'src/components/ui/command.tsx',
  'src/components/ui/textarea.tsx',
  'src/components/ui/sonner.tsx',
];

/** Primitive internals that are allowed to render a raw <button>. */
const RAW_BUTTON_ALLOWLIST: Record<string, number> = {
  // The thin drag rail is not an application control (hidden on phones, tabIndex -1).
  'src/components/ui/sidebar.tsx': 1,
};

const PALETTE = /\b(?:bg|text|border|fill|stroke|from|to|ring|divide)-(?:red|green|blue|yellow|orange|amber|emerald|rose|purple|violet|pink|cyan|teal|sky|indigo|lime|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;

describe('lane D residual: owned files', () => {
  for (const file of OWNED) {
    const src = read(file);
    test(`${file}: raw <button> only where allowlisted`, () => {
      assert.equal((src.match(/<button\b/g) ?? []).length, RAW_BUTTON_ALLOWLIST[file] ?? 0);
    });
    test(`${file}: no hard-coded hue classes or hex colours`, () => {
      assert.deepEqual(src.match(PALETTE) ?? [], []);
      assert.deepEqual(src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g) ?? [], []);
    });
    test(`${file}: no text under 12px`, () => {
      const small = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => parseFloat(m[1]) < 12);
      assert.deepEqual(small.map((m) => m[0]), []);
    });
    test(`${file}: no stale Navigation component references`, () => {
      assert.equal(/components\/Navigation['"]|<Navigation\b|Navigation compat|old Navigation/i.test(src), false);
    });
    test(`${file}: no empty interface extends`, () => {
      assert.equal(/interface\s+\w+\s+extends\s+[^{]+\{\s*\}/.test(src), false);
    });
    test(`${file}: every animate-spin respects reduced motion`, () => {
      for (const line of src.split('\n')) {
        if (line.includes('animate-spin')) assert.ok(line.includes('motion-reduce:animate-none'), line.trim());
      }
    });
  }

  test('no h-7 / h-8 size overrides on shared button call sites', () => {
    for (const file of OWNED) {
      for (const line of read(file).split('\n')) {
        if (/<(?:Button|IconButton|ConfirmDeleteButton|ToggleChip)\b/.test(line)) {
          assert.equal(/\b(?:h|w|size)-[78]\b/.test(line), false, `${file}: ${line.trim()}`);
        }
      }
    }
    // The sidebar trigger no longer forces a 28px box.
    assert.equal(/cn\("h-7 w-7", className\)/.test(read('src/components/ui/sidebar.tsx')), false);
  });
});

describe('Dashboard', () => {
  const src = read('src/pages/Dashboard.tsx');
  test('dead timeFilter chain is gone; today filtering stays on the UTC day', () => {
    assert.equal(/timeFilter/.test(src), false);
    assert.equal(/weekStart|monthStart/.test(src), false);
    assert.match(src, /meal\.date === todayStr/);
    assert.match(src, /const todayStr = new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/);
  });
  test('no page-wide chart range: no provider, no page-level range control', () => {
    assert.equal(/ChartRangeProvider|useSharedChartRange|DashboardRangeControl|ChartRangeControls/.test(src), false);
  });
  test('macro chart rows carry ISO dates so they window by calendar day', () => {
    assert.equal(/\$\{month\}\/\$\{day\}/.test(src), false);
  });
  test('goal resolver is memoised, so dependent memos list it', () => {
    assert.match(src, /const resolveGoalForDate = useCallback/);
  });
});

describe('BottomNav', () => {
  const src = read('src/components/layout/BottomNav.tsx');
  test('uses the shared Button and keeps focus return and aria semantics', () => {
    assert.equal((src.match(/<Button\b/g) ?? []).length, 2);
    assert.match(src, /ref=\{moreRef\}/);
    assert.match(src, /aria-expanded=\{moreOpen\}/);
    assert.match(src, /aria-haspopup="dialog"/);
  });
  test('keeps five equal slots', () => {
    assert.equal((src.match(/className="min-w-0 flex-1"/g) ?? []).length, 4); // + the before/after maps
    assert.match(src, /before\.map/);
    assert.match(src, /after\.map/);
  });
  test('slot button undoes the Button 16px icon rule and padding', () => {
    assert.match(src, /\[&_svg\]:size-5/);
    assert.match(src, /min-h-0/);
  });
});

describe('Sonner', () => {
  const src = read('src/components/ui/sonner.tsx');
  test('clears the bottom nav, can be dismissed, and has 44px touch actions', () => {
    assert.match(src, /mobileOffset/);
    assert.match(src, /closeButton/);
    assert.match(src, /pointer:coarse/);
    assert.match(src, /motion-reduce:transition-none/);
  });
});

describe('labels in lists', () => {
  test('DailyNotesList uses spans (not stray <Label>s) for group names and 44px severity buttons', () => {
    const src = read('src/components/DailyNotesList.tsx');
    assert.equal(/<Label id=/.test(src), false);
    assert.match(src, /aria-labelledby="edit-note-tags-label"/);
    assert.match(src, /size="touch"/);
    assert.match(src, /DialogDescription/);
  });
  test('MealList quick-add toggle label matches the form chips', () => {
    assert.match(read('src/components/MealList.tsx'), /Pin \$\{meal\.food\} to quick add/);
  });
  test('Pagination keeps named prev/next and numbered page buttons', () => {
    const src = read('src/components/PaginationControls.tsx');
    assert.match(src, /label="Previous page"/);
    assert.match(src, /label="Next page"/);
    assert.match(src, /aria-label=\{`Page \$\{page\}`\}/);
    assert.match(src, /aria-current/);
  });
  test('HowTo video frame uses a semantic surface, not black', () => {
    const src = read('src/pages/HowTo.tsx');
    assert.match(src, /bg-muted/);
    assert.equal(/bg-black|#09090b/.test(src), false);
  });
});
