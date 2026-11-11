import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataFilter } from '../src/components/DataFilter';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { QuickAddPinIcon } from '../src/components/QuickAddPinIcon';
import { QUICK_ADD_PIN_FOCUS, quickAddPinLabel, quickAddPinTooltip } from '../src/lib/quickAddPin';

// Small UI polish: date range labels, the quick-add pin, one wording for discarding a workout, plain reminder copy.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const noop = () => {};
const filter = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(TooltipProvider, null, createElement(DataFilter, { searchQuery: '', onSearchChange: noop, timeFilter: 'custom', onTimeFilterChange: noop, showDateRange: true, onDateRangeChange: noop, ...props })));

describe('DataFilter custom range', () => {
  test('From and To stay visible as labels, with and without a date, and every date button is named From / To', () => {
    const empty = filter({ dateRange: { from: undefined, to: undefined } });
    assert.match(empty, />From</);
    assert.match(empty, />To</);
    assert.match(empty, /aria-label="From date: not set"/);
    assert.match(empty, /aria-label="To date: not set"/);
    const set = filter({ dateRange: { from: new Date(2026, 0, 3), to: new Date(2026, 0, 9) } });
    assert.match(set, />From</);
    assert.match(set, />To</);
    assert.match(set, /aria-label="From date: 03\/01\/2026"/);
    assert.match(set, /aria-label="To date: 09\/01\/2026"/);
    assert.match(set, /aria-label="Clear date range"/);
  });
  test('the fields share the width instead of a fixed 140px (two columns on a phone, fixed-width fields from sm)', () => {
    const src = read('src/components/DataFilter.tsx');
    assert.equal(/w-\[140px\]/.test(src), false);
    assert.match(src, /grid grid-cols-2 gap-2 sm:flex/);
    assert.match(src, /min-w-0 truncate/);
  });
});

describe('MealForm quick-add pin', () => {
  const src = read('src/components/MealForm.tsx');
  test('a Pin icon (filled when pinned) replaces the lightning bolt; the toggle keeps aria-pressed and one stable name', () => {
    assert.equal(/\bZap\b/.test(src), false);
    assert.match(src, /<QuickAddPinIcon pinned=\{fav\} \/>/);
    assert.match(src, /label=\{quickAddPinLabel\(meal\.food\)\}/);
    assert.match(src, /aria-pressed=\{fav\}/);
    assert.match(src, /QUICK_ADD_PIN_FOCUS/);
  });
  test('the tooltip says what the next tap does, and the help text matches', () => {
    assert.match(src, /tooltip=\{quickAddPinTooltip\(fav\)\}/);
    assert.match(src, /Pinned meals \(filled pin\) stay in this list; tap the pin again to unpin one\./);
    assert.equal(/lightning/i.test(src), false);
  });
});

describe('discarding a workout uses one wording', () => {
  const src = read('src/components/ActiveWorkoutModal.tsx');
  test('visible label, confirmation title (the accessible name) and confirm button all say "Discard workout"', () => {
    assert.match(src, /confirmationTitle="Discard workout\?"/);
    assert.match(src, /confirmLabel="Yes, discard workout"/);
    assert.match(src, />\s*Discard workout\s*<\/ConfirmDeleteButton>/);
    assert.equal(/Cancel Workout/.test(src), false);
  });
  test('ConfirmDeleteButton still derives its accessible name from the title, so the name matches the visible text', () => {
    const btn = read('src/components/ConfirmDeleteButton.tsx');
    assert.match(btn, /aria-label=\{confirmationTitle\.replace\(\/\\\?\$\/, ''\)\}/);
  });
});

describe('workout reminder copy', () => {
  const src = read('src/components/StatsCards.tsx');
  test('plain wording', () => {
    assert.match(src, /'Workout done today'/);
    assert.match(src, /'Try to make up for it today'/);
    assert.equal(/You did workout today|recompensate/.test(src), false);
  });
});

describe('one quick-add pin treatment (Quick add chips and meal history)', () => {
  test('stable name, tooltip that names the next action, inset focus ring', () => {
    assert.equal(quickAddPinLabel('Oats'), 'Pin Oats to quick add');
    assert.equal(quickAddPinTooltip(false), 'Pin to quick add');
    assert.equal(quickAddPinTooltip(true), 'Unpin from quick add');
    assert.match(QUICK_ADD_PIN_FOCUS, /ring-inset/);
  });
  test('the icon is a Pin: outline when not pinned, filled and tilted when pinned; always hidden from screen readers', () => {
    const off = renderToStaticMarkup(createElement(QuickAddPinIcon, { pinned: false }));
    const on = renderToStaticMarkup(createElement(QuickAddPinIcon, { pinned: true }));
    for (const out of [off, on]) { assert.match(out, /lucide-pin/); assert.match(out, /aria-hidden="true"/); }
    assert.equal(/fill-primary|-rotate-45/.test(off), false);
    assert.match(on, /fill-primary/);
    assert.match(on, /-rotate-45/);
  });
  test('MealList uses the same helpers and icon (no lightning bolt left)', () => {
    const src = read('src/components/MealList.tsx');
    assert.equal(/\bZap\b/.test(src), false);
    assert.match(src, /<QuickAddPinIcon pinned=\{favorite\}/);
    assert.match(src, /tooltip=\{quickAddPinTooltip\(favorite\)\}/);
    assert.match(src, /pressed=\{favorite\}/);
    assert.match(src, /className=\{QUICK_ADD_PIN_FOCUS\}/);
  });
});
