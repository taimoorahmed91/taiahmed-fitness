import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Extra Activity history follows the Gym history: shared HistoryRow, collapsed by default, details in an animated panel.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('Extra Activity history uses the shared history rows', () => {
  const src = read('src/pages/ExtraActivities.tsx');
  test('rows are HistoryRow inside a HistoryList, not the old always-open grid of boxes', () => {
    assert.match(src, /import \{ HistoryRow \} from '@\/components\/history\/HistoryRow'/);
    assert.match(src, /<HistoryRow\b/);
    assert.match(src, /<HistoryList variant="workout"/);
    assert.doesNotMatch(src, /grid gap-3 md:grid-cols-2/);
  });
  test('rows start collapsed: expanded state is a Set of ids, empty by default', () => {
    assert.match(src, /useState<ReadonlySet<string>>\(new Set\(\)\)/);
    assert.match(src, /expanded=\{expandedIds\.has\(a\.id\)\}/);
  });
  test('only a row with notes expands on wide screens; phones always open (the Edit/Delete tray lives in the panel)', () => {
    assert.match(src, /panel=\{hasNotes \? notesDetail : undefined\}/);
    assert.match(src, /<ActionTray label=\{`Actions for \$\{a\.activity\}`\}>/);
  });
  test('notes keep their line breaks', () => {
    assert.match(src, /whitespace-pre-wrap/);
  });
  test('delete still goes through the shared confirm flow with its original copy', () => {
    assert.match(src, /<HistoryDeleteAction/);
    assert.match(src, /confirmationTitle="Delete activity\?"/);
    assert.match(src, /Are you sure you want to delete “\$\{a\.activity\}” from \$\{a\.date\}, including its notes\? This cannot be undone\./);
  });
  test('the activity being edited keeps a visible highlight', () => {
    assert.match(src, /editing && 'outline outline-2 -outline-offset-2 outline-primary'/);
    assert.match(src, /editing=\{editingId === a\.id\}/);
  });
  test('search, date filters, pagination and empty/loading states are still there', () => {
    assert.match(src, /Search activities or notes/);
    assert.match(src, /usePagination\(filtered/);
    assert.match(src, /<PaginationControls/);
    assert.match(src, /No activities match your filters/);
    assert.match(src, /Loading activities/);
  });
});
