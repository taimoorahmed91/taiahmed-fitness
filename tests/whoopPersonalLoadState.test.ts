import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { whoopDateLabel, whoopLatestCards } from '../src/components/history/WhoopHistoryList';
import type { WhoopEntry } from '../src/hooks/useWhoopData';

// Model and source checks for the final correction lane: WHOOP Data and Personal Data tell a failed first load, a failed
// refresh and a true empty list apart, WHOOP never prints "-%" for a missing reading, and its dates are readable.
// The same behaviours with a real DOM are in tests/mounted/whoopFailedLoad.dom.tsx and tests/mounted/personalData.dom.tsx.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const entry = (over: Partial<WhoopEntry> = {}): WhoopEntry => ({
  id: 'w', date: '2020-03-04', created_at: '2020-03-04T07:00:00Z', cycle_end_timestamp: null,
  recovery_score: null, hrv_rmssd_milli: null, resting_heart_rate: null, spo2_percentage: null, skin_temp_celsius: null,
  sleep_performance_percentage: null, sleep_efficiency_percentage: null, total_in_bed_hours: null, total_rem_sleep_milli: null,
  total_deep_sleep_milli: null, total_light_sleep_milli: null, total_awake_time_milli: null, respiratory_rate: null,
  disturbance_count: null, sleep_cycle_count: null, strain: null, kilojoule: null, average_heart_rate: null, max_heart_rate: null,
  ...over,
});

describe('WHOOP latest readings: missing values', () => {
  test('nothing recorded: every main and sub reading is a dash with no unit', () => {
    const cards = whoopLatestCards(entry());
    assert.deepEqual(cards.map((c) => c.key), ['recovery', 'heart', 'sleep', 'strain']);
    for (const c of cards) {
      assert.deepEqual([c.main.text, c.main.recorded], ['\u2014', false], c.label);
      assert.deepEqual([c.sub.text, c.sub.recorded], ['\u2014', false], `${c.label} / ${c.sub.label}`);
      assert.doesNotMatch(`${c.main.text}${c.sub.text}`, /-|%|ms|bpm|cal|\bh\b/);
    }
  });
  test('recorded values keep their unit, and only recorded ones do', () => {
    const [recovery, heart, sleep, strain] = whoopLatestCards(entry({
      recovery_score: 72, hrv_rmssd_milli: 48.4, resting_heart_rate: 52, spo2_percentage: 96.5,
      sleep_performance_percentage: 85, total_in_bed_hours: 7.25, strain: 12.34, kilojoule: 2092,
    }));
    assert.equal(recovery.main.text, '72%');
    assert.equal(recovery.sub.text, '48 ms');
    assert.equal(heart.main.text, '52 bpm');
    assert.equal(heart.sub.label, 'SpO2');
    assert.equal(heart.sub.text, '96.5%');
    assert.equal(sleep.main.text, '85%');
    assert.equal(sleep.sub.text, '7.3 h');
    assert.equal(strain.main.text, '12.3');
    assert.equal(strain.sub.text, '500 cal');
  });
  test('a missing SpO2 next to a recorded heart rate: only SpO2 is a dash', () => {
    const heart = whoopLatestCards(entry({ resting_heart_rate: 52 }))[1];
    assert.equal(heart.main.text, '52 bpm');
    assert.deepEqual([heart.sub.label, heart.sub.text], ['SpO2', '\u2014']);
  });
  test('a real zero is recorded, not missing', () => {
    const [recovery, , , strain] = whoopLatestCards(entry({ recovery_score: 0, strain: 0 }));
    assert.equal(recovery.main.text, '0%');
    assert.equal(strain.main.text, '0.0');
  });
  test('the page source no longer builds "-" placeholders', () => {
    const page = read('src/pages/WhoopData.tsx');
    assert.doesNotMatch(page, /\?\? '-'/);
    assert.doesNotMatch(page, /: '-'\}/);
    assert.doesNotMatch(page, /SpO2: \{/);
  });
});

describe('WHOOP date labels', () => {
  test('the Latest reading label is the shared UTC calendar format, never raw ISO', () => {
    assert.equal(whoopDateLabel('2020-03-04', '2026-10-31'), 'Wed, Mar 4, 2020');
    assert.equal(whoopDateLabel('2026-10-30', '2026-10-31'), 'Fri, Oct 30');
  });
  test('an unreadable date falls back to its own text instead of "Invalid Date"', () => {
    assert.equal(whoopDateLabel('not-a-date', '2026-10-31'), 'not-a-date');
  });
  test('the page keeps the ISO day on <time dateTime> and the edit dialog describes the day in words', () => {
    const page = read('src/pages/WhoopData.tsx');
    assert.match(page, /<time dateTime=\{latestEntry\.date\}/);
    assert.match(page, /whoopDateLabel\(latestEntry\.date\)/);
    assert.doesNotMatch(page, /\{latestEntry\.date\}<\/span>/);
    assert.match(read('src/components/EditWhoopEntryDialog.tsx'), /whoopDateLabel\(entry\.date\)/);
  });
});

describe('WHOOP page: load states are read from the real whoop table state', () => {
  const page = read('src/pages/WhoopData.tsx');
  test('uses useSharedTableState with the whoop key (the key useWhoopData fills), not the hook\'s loading flag', () => {
    assert.match(page, /useSharedTableState\('whoop'\)/);
    assert.match(read('src/hooks/useWhoopData.ts'), /table: 'whoop'/);
    assert.match(page, /tableView\(tableState\)/);
    assert.doesNotMatch(page, /const \{[^}]*\bloading\b[^}]*\} = useWhoopData\(\)/);
  });
  test('first-load error, loading, stale and true-empty are each decided before the list', () => {
    assert.match(page, /<DataLoadError/);
    assert.match(page, /<StaleDataNotice[^>]*refetch/);
    assert.match(page, /view === 'ready' && tableState\.refreshFailed/);
    assert.ok(page.indexOf("view === 'loading'") < page.indexOf('<WhoopHistoryList'));
    assert.ok(page.indexOf("view === 'error'") < page.indexOf('<WhoopHistoryList'));
    assert.ok(page.indexOf('<DataLoadError') < page.indexOf('title="No WHOOP data yet"'));
    assert.match(page, /title="No WHOOP data yet"/);
    assert.match(page, /Use Sync Now to fetch your first readings\./);
  });
  test('the entry count only shows once the table has loaded', () => {
    assert.match(page, /view === 'ready' && <CardDescription>\{entries\.length\}/);
  });
  test('the saved URL badge cannot say "Not set" for a failed load', () => {
    assert.match(page, /urlState === 'error' \? 'Not checked'/);
    assert.match(page, /disabled=\{urlState !== 'ready'\}/);
  });
  test('edit, delete, raw response and URL validation are untouched', () => {
    assert.match(page, /onDelete=\{deleteEntry\}/);
    assert.match(page, /onEdit=\{handleEdit\}/);
    assert.match(page, /rawApiResponse/);
    assert.match(page, /isWebUrl/);
    assert.match(page, /whoop-url-error/);
  });
});

describe('Personal Data page: load states come from the hook', () => {
  const page = read('src/pages/PersonalData.tsx');
  test('reads phase, loadFailed and refreshFailed and keeps refetch for the retry', () => {
    assert.match(page, /const \{ data, loading, save, refetch, phase, loadFailed, refreshFailed \} = usePersonalData\(\)/);
  });
  test('a failed first load wins over loading, and replaces the summary, form and save bar', () => {
    assert.match(page, /loadFailed \? 'error' : loading \|\| phase === 'loading' \? 'loading' : 'ready'/);
    const error = page.indexOf("view === 'error'");
    assert.ok(error > 0 && error < page.indexOf('<ProfileSummary'), 'error branch is decided before the summary');
    assert.ok(page.indexOf('<DataLoadError') < page.indexOf('<ProfileSummary'));
    assert.ok(page.indexOf('<DataLoadError') < page.indexOf('All changes saved.'));
    assert.match(page, /onRetry=\{refetch\}/);
  });
  test('a failed refresh adds a notice inside the ready branch and never touches the draft', () => {
    const ready = page.slice(page.indexOf('<StaleDataNotice') - 120);
    assert.match(ready, /refreshFailed && <StaleDataNotice/);
    assert.ok(page.indexOf('<StaleDataNotice') > page.indexOf('<DataLoadError'));
    assert.ok(page.indexOf('<StaleDataNotice') < page.indexOf('<ProfileSummary'));
  });
  test('new data never replaces unsaved edits; a save makes what was saved the baseline', () => {
    assert.match(page, /isDraftDirty\(current, previous, templateIdsRef\.current\) \? current : draftFromData\(data\)/);
    assert.match(page, /setDraft\(draftFromData\(payload\)\)/);
  });
  test('the page order, one save button and the separate-save settings are unchanged', () => {
    assert.equal((page.match(/Save profile, targets/g) ?? []).length, 1);
    assert.equal((page.match(/<SettingsSection\b/g) ?? []).length, 3);
    for (const needle of ['<RestTimersSection', '<InsightCutoffsSection', '<ApiTokenSection', '<ValueHistory']) assert.match(page, new RegExp(needle));
    // The independent settings stay available when the profile failed to load.
    assert.ok(page.indexOf('title="More settings"') > page.indexOf('<DataLoadError'));
  });
});
