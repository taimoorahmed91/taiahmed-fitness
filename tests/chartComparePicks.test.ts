import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartDataset } from '../src/lib/chartViewerData';
import { selectableChartPoints } from '../src/lib/chartSelection';
import {
  availablePicks, compareCandidate, compareHrefForPicks, comparePickDifference, describeDropped, describeOutcome, describePickDifference, EMPTY_PICKS,
  formatSignedDelta, reconcilePicks, slotOfRecord, swapPicks, togglePick, type ComparePick,
} from '../src/lib/chartComparePicks';

// Chart A / B picks for Compare: eligibility, ordered picks, replace / swap / clear, B - A, days and rate, same day, unsupported
// refs and the reconcile (range / deleted record) rule. Mounted behaviour: tests/mounted/chartCompare.dom.tsx.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

type Row = Record<string, unknown>;
const weightRows: Row[] = [
  { date: '2026-10-01', weight: 82, recordId: 'w-1' },
  { date: '2026-10-09', weight: 81.2, recordId: 'w-2' },
  { date: '2026-10-20', weight: 80.6, recordId: 'w-3' },
  { date: '2026-10-25', weight: 80.6, recordId: 'w-4' },
];
const makeWeight = (rows: Row[] = weightRows, metric = 'weight', withCompare = true) =>
  createChartDataset({
    name: 'Weight Trend', period: 'Last 30 days', rows,
    columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }],
    selection: {
      metric, valueKeys: ['weight'], recordId: (r) => r.recordId as string | undefined,
      compare: withCompare ? { valueKey: 'weight', noun: 'weight entry', unit: 'kg' } : undefined,
    },
  });

const sleepRows: Row[] = [
  { date: '2026-10-01', hours: 7.5, whoopHours: 8.1, recordId: 's-1' }, // manual + WHOOP
  { date: '2026-10-02', hours: null, whoopHours: 6.9 }, // WHOOP only: no record
  { date: '2026-10-03', hours: 6, whoopHours: null, recordId: 's-3' },
];
const makeSleep = () =>
  createChartDataset({
    name: 'Sleep', period: 'Last 30 days', rows: sleepRows,
    columns: [{ key: 'date', label: 'Date' }, { key: 'hours', label: 'Manual Sleep', unit: 'hrs' }, { key: 'whoopHours', label: 'WHOOP In Bed', unit: 'hrs' }],
    selection: {
      metric: 'sleep', valueKeys: ['hours', 'whoopHours'],
      recordId: (r) => (typeof r.hours === 'number' && r.recordId ? (r.recordId as string) : undefined),
      compare: { valueKey: 'hours', noun: 'manual sleep entry', unit: 'hrs' },
    },
  });

const pointOf = (dataset: ReturnType<typeof makeWeight>, date: string) => selectableChartPoints(dataset).find((p) => p.day.isoDate === date) ?? null;
const pick = (recordId: string, isoDate: string, value: number, rowId = isoDate): ComparePick => ({ recordId, rowId, isoDate, value });

describe('eligibility: which points can be picked', () => {
  test('an exact weight record is eligible and carries its id, date and raw value (never the date as identity)', () => {
    const dataset = makeWeight();
    const result = compareCandidate(dataset, pointOf(dataset, '2026-10-09'));
    assert.equal(result?.ok, true);
    assert.deepEqual(result?.ok && result.pick, { recordId: 'w-2', rowId: '2026-10-09', isoDate: '2026-10-09', value: 81.2 });
    assert.equal(result?.ok && result.category, 'weight');
  });

  test('a chart without the compare config offers nothing (Waist, the Dashboard, aggregates)', () => {
    const dataset = makeWeight(weightRows, 'waist', false);
    assert.equal(compareCandidate(dataset, pointOf(dataset, '2026-10-09')), null);
    assert.equal(availablePicks(dataset, selectableChartPoints(dataset)).size, 0);
  });

  test('a metric the Compare link does not support is refused even when the config is present (waist)', () => {
    const dataset = makeWeight(weightRows, 'waist', true);
    const result = compareCandidate(dataset, pointOf(dataset, '2026-10-09'));
    assert.equal(result?.ok, false);
    assert.equal(result?.ok === false && result.reason, 'unsupported-metric');
    assert.equal(availablePicks(dataset, selectableChartPoints(dataset)).size, 0);
  });

  test('a daily aggregate (no record id) is refused with a plain reason, not a disabled button', () => {
    const dataset = makeWeight([{ date: '2026-10-09', weight: 81 }]);
    const result = compareCandidate(dataset, pointOf(dataset, '2026-10-09'));
    assert.equal(result?.ok === false && result.reason, 'not-a-record');
    assert.match(result?.ok === false ? result.text : '', /no saved weight entry to compare/);
  });

  test('Sleep: the manual point (table row, step or manual press) is eligible; a day with WHOOP too keeps the manual record id', () => {
    const dataset = makeSleep();
    const point = pointOf(dataset, '2026-10-01');
    for (const via of [null, 'hours']) {
      const result = compareCandidate(dataset, point, via);
      assert.equal(result?.ok, true, `via ${via}`);
      assert.deepEqual(result?.ok && result.pick, { recordId: 's-1', rowId: '2026-10-01', isoDate: '2026-10-01', value: 7.5 });
    }
  });

  test('Sleep: pressing the WHOOP series is refused and does NOT silently pick the manual record of that day', () => {
    const dataset = makeSleep();
    const result = compareCandidate(dataset, pointOf(dataset, '2026-10-01'), 'whoopHours');
    assert.equal(result?.ok, false);
    assert.equal(result?.ok === false && result.reason, 'not-manual-source');
    const text = result?.ok === false ? result.text : '';
    assert.match(text, /WHOOP In Bed can't be compared/);
    assert.match(text, /Select the Manual Sleep point/);
  });

  test('Sleep: a WHOOP-only day is a daily aggregate and can not be picked; the picks map holds only manual records', () => {
    const dataset = makeSleep();
    const whoopOnly = pointOf(dataset, '2026-10-02');
    assert.equal(whoopOnly?.day.origin?.kind, 'daily-aggregate');
    assert.equal(compareCandidate(dataset, whoopOnly, null)?.ok, false);
    assert.deepEqual([...availablePicks(dataset, selectableChartPoints(dataset)).keys()], ['s-1', 's-3']);
  });

  test('nothing selected means no candidate; a record without a real number is refused', () => {
    const dataset = makeWeight();
    assert.equal(compareCandidate(dataset, null), null);
    const odd = createChartDataset({
      name: 'W', period: 'p', rows: [{ date: '2026-10-09', weight: 81, recordId: 'w-2' }],
      columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight' }],
      selection: { metric: 'weight', valueKeys: ['weight'], recordId: (r) => r.recordId as string, compare: { valueKey: 'other', noun: 'weight entry', unit: 'kg' } },
    });
    assert.equal(compareCandidate(odd, selectableChartPoints(odd)[0])?.ok === false && true, true);
  });

  test('same-day duplicates keep exact ids: the chart plots one record per day and a pick is that record', () => {
    // RecordTrendChart plots the lowest id of a day (planRecordPlot); the pick must be that exact id, not "the day".
    const dataset = makeWeight([{ date: '2026-10-09', weight: 80.9, recordId: 'w-3a' }]);
    const result = compareCandidate(dataset, pointOf(dataset, '2026-10-09'));
    assert.equal(result?.ok && result.pick.recordId, 'w-3a');
    assert.equal(slotOfRecord({ a: result?.ok ? result.pick : null, b: null }, 'w-3b'), null, 'the sibling record is not the pick');
  });
});

describe('ordered picks: set, replace, toggle, duplicate, swap, clear', () => {
  const p1 = pick('w-1', '2026-10-01', 82);
  const p2 = pick('w-2', '2026-10-09', 81.2);
  const p3 = pick('w-3', '2026-10-20', 80.6);

  test('setting A then B fills the slots in that order, never by date', () => {
    const one = togglePick(EMPTY_PICKS, 'a', p3);
    assert.deepEqual(one.outcome, { kind: 'set', slot: 'a', replaced: null });
    const two = togglePick(one.picks, 'b', p1); // B is OLDER than A: it stays B
    assert.equal(two.picks.a?.recordId, 'w-3');
    assert.equal(two.picks.b?.recordId, 'w-1');
  });

  test('a third pick replaces only the slot asked for and never reorders', () => {
    const both = { a: p1, b: p2 };
    const replacedA = togglePick(both, 'a', p3);
    assert.deepEqual(replacedA.outcome, { kind: 'set', slot: 'a', replaced: p1 });
    assert.equal(replacedA.picks.a?.recordId, 'w-3');
    assert.equal(replacedA.picks.b?.recordId, 'w-2');
    const replacedB = togglePick(both, 'b', p3);
    assert.equal(replacedB.picks.a?.recordId, 'w-1');
    assert.equal(replacedB.picks.b?.recordId, 'w-3');
  });

  test('setting a slot to the record it already holds clears that slot (toggle)', () => {
    const result = togglePick({ a: p1, b: p2 }, 'a', p1);
    assert.deepEqual(result.outcome, { kind: 'cleared', slot: 'a' });
    assert.deepEqual(result.picks, { a: null, b: p2 });
  });

  test('setting a slot to the record the other slot holds is refused and changes nothing', () => {
    const start = { a: p1, b: p2 };
    const result = togglePick(start, 'a', p2);
    assert.equal(result.outcome.kind, 'duplicate');
    assert.equal(result.picks, start);
    assert.match(describeOutcome(result.outcome, p2, 'kg'), /already B\. Compare needs two different entries/);
  });

  test('swap exchanges the two exactly; clear empties both; swapping twice is the identity', () => {
    const both = { a: p1, b: p2 };
    assert.deepEqual(swapPicks(both), { a: p2, b: p1 });
    assert.deepEqual(swapPicks(swapPicks(both)), both);
    assert.deepEqual(EMPTY_PICKS, { a: null, b: null });
  });

  test('slotOfRecord finds a slot by record id only', () => {
    assert.equal(slotOfRecord({ a: p1, b: p2 }, 'w-2'), 'b');
    assert.equal(slotOfRecord({ a: p1, b: p2 }, 'w-9'), null);
    assert.equal(slotOfRecord({ a: p1, b: p2 }, null), null);
  });
});

describe('reconcile: picks follow the records that are on the chart now', () => {
  const dataset = makeWeight();
  const available = availablePicks(dataset, selectableChartPoints(dataset));

  test('nothing changed: the SAME object comes back (so no needless state update)', () => {
    const picks = { a: available.get('w-1')!, b: available.get('w-2')! };
    const result = reconcilePicks(picks, available);
    assert.equal(result.picks, picks);
    assert.deepEqual(result.dropped, []);
  });

  test('a record that left the visible rows is dropped, with what it was, so the UI can announce it', () => {
    const narrowed = makeWeight(weightRows.slice(2)); // range now starts at 10-20
    const result = reconcilePicks({ a: available.get('w-1')!, b: available.get('w-3')! }, availablePicks(narrowed, selectableChartPoints(narrowed)));
    assert.deepEqual(result.picks, { a: null, b: available.get('w-3') });
    assert.deepEqual(result.dropped.map((d) => [d.slot, d.pick.recordId]), [['a', 'w-1']]);
    assert.match(describeDropped(result.dropped, 'kg'), /^A \(Oct 1, 2026, 82 kg\) is no longer on this chart .* it was cleared\.$/);
  });

  test('widening the range does not bring a dropped pick back (the stored picks are what was reconciled)', () => {
    const narrowed = makeWeight(weightRows.slice(2));
    const afterNarrow = reconcilePicks({ a: available.get('w-1')!, b: null }, availablePicks(narrowed, selectableChartPoints(narrowed))).picks;
    const afterWiden = reconcilePicks(afterNarrow, available).picks;
    assert.deepEqual(afterWiden, { a: null, b: null });
  });

  test('both dropped: one sentence names both; an edited value is refreshed without being dropped', () => {
    const edited = makeWeight(weightRows.map((r) => (r.recordId === 'w-2' ? { ...r, weight: 80.9 } : r)));
    const refreshed = reconcilePicks({ a: available.get('w-2')!, b: null }, availablePicks(edited, selectableChartPoints(edited)));
    assert.equal(refreshed.picks.a?.value, 80.9);
    assert.deepEqual(refreshed.dropped, []);
    const gone = reconcilePicks({ a: available.get('w-1')!, b: available.get('w-2')! }, new Map());
    assert.deepEqual(gone.picks, { a: null, b: null });
    assert.match(describeDropped(gone.dropped, 'kg'), /^A \(.*\) and B \(.*\) are no longer on this chart .* they were cleared\.$/);
  });

  test('an unavailable dataset has no points, so every pick is dropped', () => {
    const unavailable = createChartDataset({
      name: 'W', period: 'p', rows: weightRows,
      columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight' }], status: { unavailable: { reason: 'x' } },
      selection: { metric: 'weight', valueKeys: ['weight'], recordId: (r) => r.recordId as string, compare: { valueKey: 'weight', noun: 'weight entry', unit: 'kg' } },
    });
    assert.equal(availablePicks(unavailable, selectableChartPoints(unavailable)).size, 0);
  });
});

describe('B - A: raw values, elapsed days, weekly rate', () => {
  test('uses the raw stored values, signed, with neutral words and the elapsed days', () => {
    const diff = comparePickDifference(pick('w-1', '2026-10-01', 82), pick('w-2', '2026-10-09', 81.2));
    assert.deepEqual(diff, { delta: -0.8, direction: 'lower', days: 8, sameDay: false, ratePerWeek: -0.7 });
    const words = describePickDifference(diff!, 'kg');
    assert.equal(words.headline, 'B \u2212 A: \u22120.8 kg (lower)');
    assert.equal(words.timing, 'B is 8 days after A');
    assert.equal(words.rate, '\u22120.7 per week'.replace('per week', 'kg per week'));
  });

  test('higher, lower and no change are neutral words; floating point noise is rounded away', () => {
    assert.equal(comparePickDifference(pick('a', '2026-10-01', 0.1), pick('b', '2026-10-02', 0.3))?.delta, 0.2, '0.3 - 0.1 is 0.2, not 0.19999999999999998');
    assert.equal(comparePickDifference(pick('a', '2026-10-01', 80.6), pick('b', '2026-10-20', 80.6))?.direction, 'same');
    assert.equal(comparePickDifference(pick('a', '2026-10-01', 80), pick('b', '2026-10-20', 80.5))?.direction, 'higher');
    const same = describePickDifference(comparePickDifference(pick('a', '2026-10-01', 80.6), pick('b', '2026-10-20', 80.6))!, 'kg');
    assert.equal(same.headline, 'B \u2212 A: 0 kg (no change)');
    assert.equal(same.rate, '0 kg per week', 'a real zero change over time is still a rate of zero');
  });

  test('same day: says so and gives no per-week rate (never a divide by zero)', () => {
    const diff = comparePickDifference(pick('a', '2026-10-01', 80), pick('b', '2026-10-01', 81))!;
    assert.equal(diff.sameDay, true);
    assert.equal(diff.days, 0);
    assert.equal(diff.ratePerWeek, null);
    const words = describePickDifference(diff, 'kg');
    assert.equal(words.timing, 'Same day');
    assert.equal(words.rate, null);
  });

  test('B earlier than A: negative days, "before A", and no weekly rate (a rate across backwards time would mislead)', () => {
    const diff = comparePickDifference(pick('a', '2026-10-20', 80.6), pick('b', '2026-10-01', 82))!;
    assert.equal(diff.days, -19);
    assert.equal(diff.ratePerWeek, null);
    assert.equal(describePickDifference(diff, 'kg').timing, 'B is 19 days before A');
    assert.equal(describePickDifference(comparePickDifference(pick('a', '2026-10-01', 1), pick('b', '2026-10-02', 2))!, 'kg').timing, 'B is 1 day after A');
  });

  test('elapsed days are calendar days across month and leap-day boundaries, not hours', () => {
    assert.equal(comparePickDifference(pick('a', '2028-02-28', 1), pick('b', '2028-03-01', 1))?.days, 2);
    assert.equal(comparePickDifference(pick('a', '2026-10-31', 1), pick('b', '2026-11-01', 1))?.days, 1);
  });

  test('a pick with an invalid date has no difference rather than a guess', () => {
    assert.equal(comparePickDifference(pick('a', 'Oct 1', 1), pick('b', '2026-10-02', 2)), null);
  });

  test('signed deltas use a real minus sign and the unit; sleep hours work the same', () => {
    assert.equal(formatSignedDelta(-0.5, 'hrs'), '\u22120.5 hrs');
    assert.equal(formatSignedDelta(1.25, 'hrs'), '+1.25 hrs');
    assert.equal(formatSignedDelta(0, 'kg'), '0 kg');
    assert.equal(describePickDifference(comparePickDifference(pick('a', '2026-10-01', 7.5), pick('b', '2026-10-03', 6))!, 'hrs').headline, 'B \u2212 A: \u22121.5 hrs (lower)');
  });
});

describe('the link: ordered, by record id, only when both picks are eligible', () => {
  test('A then B, in the order set (not date order), as /compare?category=...&a=...&b=...', () => {
    assert.equal(compareHrefForPicks({ a: pick('w-3', '2026-10-20', 1), b: pick('w-1', '2026-10-01', 2) }, 'weight'), '/compare?category=weight&a=w-3&b=w-1');
    assert.equal(compareHrefForPicks({ a: pick('s-1', '2026-10-01', 7.5), b: pick('s-3', '2026-10-03', 6) }, 'sleep'), '/compare?category=sleep&a=s-1&b=s-3');
  });

  test('fewer than two picks, unsupported metrics (waist) and a duplicate id give no link', () => {
    assert.equal(compareHrefForPicks({ a: pick('w-1', '2026-10-01', 1), b: null }, 'weight'), null);
    assert.equal(compareHrefForPicks(EMPTY_PICKS, 'weight'), null);
    assert.equal(compareHrefForPicks({ a: pick('x-1', '2026-10-01', 1), b: pick('x-2', '2026-10-02', 1) }, 'waist'), null);
    assert.equal(compareHrefForPicks({ a: pick('w-1', '2026-10-01', 1), b: pick('w-1', '2026-10-02', 1) }, 'weight'), null);
  });
});

describe('who gets Compare controls (source contract)', () => {
  test('only RecordTrendChart opts in, and only through isCompareLinkCategory (so Waist and the Dashboard never do)', () => {
    const record = read('src/components/history/RecordTrendChart.tsx');
    assert.match(record, /compare: isCompareLinkCategory\(id\)/);
    assert.doesNotMatch(read('src/components/TrendChart.tsx'), /compare/i);
    assert.doesNotMatch(read('src/components/WaistChart.tsx'), /compare/i);
    assert.doesNotMatch(read('src/pages/Waist.tsx'), /compare/i);
  });

  test('the controls never use drag gestures and the buttons carry the visible A / B words', () => {
    const ui = read('src/components/charts/ChartCompareUi.tsx');
    assert.doesNotMatch(ui, /onDrag|draggable|onPointerMove|onTouchMove/);
    assert.match(ui, /aria-label=\{`Set as \$\{slotLabel\(slot\)\}: /);
    assert.match(ui, /Set as \{slotLabel\(slot\)\}/);
    assert.match(ui, /\[@media\(pointer:coarse\)\]|size="sm"/);
  });
});
