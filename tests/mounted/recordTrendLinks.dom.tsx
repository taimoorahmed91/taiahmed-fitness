import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';

// Weight / Sleep pages mounted with their real trend chart and history list: chart point <-> exact history row.
// Covers point -> row (page, expand, scroll, focus), row -> point (opens a collapsed Trend, selects, focuses Jump), same-day
// duplicates, filters that hide the record (message + Clear filters, never cleared silently), range and account resets,
// an entry outside the chart's range, Sleep manual vs WHOOP, and the first-load-error / empty / loading states (no chart).
// ResponsiveContainer is replaced by a fixed-size one so Recharts really draws SVG in jsdom; reduced motion is on.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/recordTrendLinks.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

// The DOM must exist BEFORE react-dom is first loaded (recharts pulls it in): React decides at load time whether the browser
// supports the `input` event, and without it typing into the search box would never reach onChange.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env: any = installDom(JSDOM);

const actualRecharts = await import('recharts');
mock.module('recharts', () => ({
  ...actualRecharts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponsiveContainer: ({ children }: { children: any }) => (globalThis as any).__React.cloneElement(children, { width: 900, height: 400 }),
}));
mock.module('html2canvas', () => ({ default: async () => ({ width: 1, height: 1, toDataURL: () => 'data:image/png;base64,' }) }));
mock.module('jspdf', () => ({ jsPDF: class { internal = { pageSize: { getWidth: () => 1, getHeight: () => 1 } }; setFontSize() {} text() {} setTextColor() {} addImage() {} setFont() {} setDrawColor() {} line() {} addPage() {} save() {} } }));
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {} } }));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

type Entry = Record<string, unknown>;
const data = { weight: [] as Entry[], sleep: [] as Entry[], whoop: [] as Entry[] };
const tables: Record<string, { phase: string; loadFailed: boolean; refreshFailed: boolean; error: null }> = {};
const ready = () => ({ phase: 'ready', loadFailed: false, refreshFailed: false, error: null });
const resetTables = () => { for (const t of ['weight', 'waist', 'sleep', 'whoop']) tables[t] = ready(); };
resetTables();

mock.module('@/lib/sharedTable', () => ({ useSharedTable: () => ({}), useSharedTableState: (table: string) => tables[table] }));
const hook = (key: 'weight' | 'sleep') => () => ({ entries: data[key], loading: false, addEntry: async () => true, updateEntry: async () => true, deleteEntry: async () => true, refetch: async () => {} });
mock.module('@/hooks/useWeight', () => ({ useWeight: hook('weight') }));
mock.module('@/hooks/useSleep', () => ({ useSleep: hook('sleep') }));
mock.module('@/hooks/useWhoopData', () => ({ useWhoopData: () => ({ entries: data.whoop, loading: false }) }));
mock.module('@/hooks/usePersonalData', () => ({ usePersonalData: () => ({ data: { target_weight_kg: null }, loading: false }) }));

// Which account is on screen (read by the chart selection and the page link through useOptionalUserId).
const who = { id: 'userA' as string | null };
const whoListeners = new Set<() => void>();
mock.module('@/contexts/userContextCore', () => ({
  UserContext: {},
  useOptionalUserId: () => (globalThis as unknown as { __React: typeof import('react') }).__React.useSyncExternalStore(
    (l) => { whoListeners.add(l); return () => { whoListeners.delete(l); }; },
    () => who.id,
  ),
}));

// One weigh-in per day except today-3, which has two. 'w-3a' sorts before 'w-3b', so it is the plotted one.
const weightData = (): Entry[] => [
  { id: 'w-0', date: iso(0), weight: 80.0, notes: 'morning' },
  { id: 'w-3b', date: iso(3), weight: 81.2, notes: 'evening shake' },
  { id: 'w-3a', date: iso(3), weight: 80.9, notes: 'after run' },
  { id: 'w-10', date: iso(10), weight: 81.5, notes: 'quiet week' },
  { id: 'w-35', date: iso(35), weight: 82 },
  { id: 'w-70', date: iso(70), weight: 82.4 },
  { id: 'w-100', date: iso(100), weight: 83 },
  { id: 'w-130', date: iso(130), weight: 83.4, notes: 'long ago' },
  { id: 'w-160', date: iso(160), weight: 84 },
  { id: 'w-200', date: iso(200), weight: 84.6 },
];

describe('mounted: trend chart <-> history list (Weight, Sleep)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any, Router: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  let desktop = false;

  before(async () => {
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    act = React.act;
    // Reduced motion (dots and bars drawn at once). `desktop` answers the history list's width / fine-pointer queries.
    const mm = (query: string) => ({
      matches: /reduce/.test(query) || (desktop && /min-width: 768px/.test(query)),
      media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
    });
    env.window.matchMedia = mm;
    Object.defineProperty(globalThis, 'matchMedia', { value: mm, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  beforeEach(() => {
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_weight_range', 'all');
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'line');
    env.window.localStorage.setItem('fittrack_chart_sleep_range', '90');
    env.window.localStorage.setItem('fittrack_chart_sleep_style', 'line');
    who.id = 'userA';
    desktop = false;
    resetTables();
    data.weight = weightData();
    data.sleep = [];
    data.whoop = [];
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const q = (sel: string, scope: ParentNode = doc()) => scope.querySelector<HTMLElement>(sel);
  const all = (sel: string, scope: ParentNode = doc()) => [...scope.querySelectorAll<HTMLElement>(sel)];
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (ms = 20) => act(async () => { await sleep(ms); });
  const clickEl = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click exists');
    await act(async () => click(env.window, el!));
    await settle(5);
  };

  const mountPage = async (name: 'Weight' | 'Sleep') => {
    const Page = (await import(`../../src/pages/${name}`)).default;
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement(TooltipProvider, null, React.createElement(Page)))));
    await settle(10);
    return host;
  };
  // Tell the mounted components the signed-in account changed (the test sets `who.id` first).
  const accountChanged = async () => { await act(async () => { whoListeners.forEach((l) => l()); }); await settle(5); };

  const hit = (date: string) => q(`g[data-chart-point="${date}"] circle[fill="transparent"]`);
  const row = (id: string) => q(`li[data-history-row="${id}"]`);
  const rowButton = (id: string) => q(':scope > div > button[aria-expanded]', row(id)!);
  const readoutDate = () => q('[data-chart-day-readout]')?.getAttribute('data-chart-day-readout') ?? null;
  const jump = () => q('[data-record-jump]');
  const status = () => text(q('[data-record-link-status]'));
  const trendButton = () => q('[data-trend-section] > button');
  const pager = () => text(q('nav[aria-label="Pagination"]'));
  const showOnChart = (id: string) => all('button', row(id)!).find((b) => /^Show on chart:/.test(b.getAttribute('aria-label') ?? ''));
  const openRow = async (id: string) => { if (rowButton(id)?.getAttribute('aria-expanded') !== 'true') await clickEl(rowButton(id)); };
  const search = (value: string) => act(async () => { typeInto(env.window, q('input[aria-label="Search by notes..."]') as HTMLInputElement, value); });
  const pick = async (group: string, label: string) => clickEl(q(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`));

  describe('layout and honest states', () => {
    test('phone: log form first, then a collapsed Trend disclosure (chart mounted), then the history', async () => {
      const host = await mountPage('Weight');
      const order = all('section', host).map((s) => text(s.querySelector('h2')));
      assert.deepEqual(order.slice(0, 3), ['Log and overview', 'Weight trend', 'Weight history']);
      const button = trendButton()!;
      assert.equal(text(button).startsWith('Trend'), true);
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      assert.ok(q('[data-trend-panel]')!.className.includes('max-md:hidden'), 'closed on phones');
      assert.equal(doc().getElementById(button.getAttribute('aria-controls')!), q('[data-trend-panel]'));
      assert.ok(q('[data-record-trend-chart="weight"]'), 'the chart stays mounted while collapsed');
      await clickEl(button);
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      assert.ok(!q('[data-trend-panel]')!.className.includes('max-md:hidden'));
    });

    test('uses the Dashboard chart id, so its saved range and style are the same preference', async () => {
      env.window.localStorage.setItem('fittrack_chart_weight_range', '30');
      await mountPage('Weight');
      assert.ok(q('button[aria-label="Weight Trend range"], [aria-label="Weight Trend range"]'));
      const checked = all('[aria-label="Weight Trend range"] [role="radio"]').find((r) => r.getAttribute('aria-checked') === 'true');
      assert.equal(checked?.getAttribute('aria-label'), 'Last 30 days');
      await pick('Weight Trend range', 'Last 14 days');
      assert.equal(env.window.localStorage.getItem('fittrack_chart_weight_range'), '14');
    });

    test('no chart while loading, on a first-load error, or when there are no entries', async () => {
      tables.weight = { phase: 'loading', loadFailed: false, refreshFailed: false, error: null };
      await mountPage('Weight');
      assert.equal(q('[data-record-trend-chart]'), null);
      assert.equal(q('[data-trend-section]'), null);
      await act(async () => { roots.forEach((r) => r.unmount()); roots = []; doc().body.innerHTML = ''; });

      tables.weight = { phase: 'error', loadFailed: true, refreshFailed: false, error: null };
      await mountPage('Weight');
      assert.equal(q('[data-record-trend-chart]'), null);
      assert.equal(q('[data-trend-section]'), null);
      await act(async () => { roots.forEach((r) => r.unmount()); roots = []; doc().body.innerHTML = ''; });

      tables.weight = ready();
      data.weight = [];
      await mountPage('Weight');
      assert.equal(q('[data-record-trend-chart]'), null);
      assert.match(text(doc().body), /No weight entries yet/);
    });

    test('a failed refresh keeps the chart and its rows (stale), the page notice says so, and points stay selectable', async () => {
      tables.weight = { phase: 'ready', loadFailed: false, refreshFailed: true, error: null };
      await mountPage('Weight');
      assert.match(text(doc().body), /out of date|last (data|entries)|refresh/i);
      await clickEl(trendButton());
      await clickEl(hit(iso(10)));
      assert.equal(readoutDate(), iso(10));
    });

    test('the Calendar action from the chart readout is still there', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(10)));
      assert.equal(q('[data-chart-open-day]')!.getAttribute('href'), `/calendar?date=${iso(10)}`);
    });
  });

  describe('chart point -> history row', () => {
    test('Jump to entry: pages to the entry, opens its row and puts focus on it', async () => {
      await mountPage('Weight');
      assert.equal(jump(), null, 'no Jump button until a point is selected');
      await clickEl(hit(iso(130)));
      assert.equal(readoutDate(), iso(130));
      assert.ok(jump());
      assert.equal(row('w-130'), null, 'that entry is on a later page of the history');
      await clickEl(jump());
      await settle(10);
      assert.ok(row('w-130'), 'the list moved to the page holding it');
      assert.doesNotMatch(pager(), /Page 1 of/);
      assert.equal(rowButton('w-130')!.getAttribute('aria-expanded'), 'true');
      assert.equal(doc().activeElement, rowButton('w-130'));
      const pressed = showOnChart('w-130')!;
      assert.equal(pressed.getAttribute('aria-pressed'), 'true', 'and its Show on chart action says it is the selected point');
    });

    test('Jump again from a different point moves to that exact row', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(130)));
      await clickEl(jump());
      await clickEl(hit(iso(0)));
      await clickEl(jump());
      await settle(10);
      assert.equal(doc().activeElement, rowButton('w-0'));
      assert.match(pager(), /Page 1 of/);
    });

    test('a day with two entries: the point is the lowest id and Jump goes to exactly that row, not its sibling', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(3)));
      assert.match(text(q('[data-chart-day-readout]')), /Weight 80\.9 kg/, 'the plotted entry is w-3a (80.9), not w-3b (81.2)');
      assert.match(status(), /2 weight entries on this day: the chart plots one of them\./);
      await clickEl(jump());
      await settle(10);
      assert.equal(doc().activeElement, rowButton('w-3a'));
      assert.equal(rowButton('w-3b')!.getAttribute('aria-expanded'), 'false', 'the sibling is untouched');
      assert.ok(showOnChart('w-3a'));
      await openRow('w-3b');
      assert.equal(showOnChart('w-3b'), undefined, 'the other same-day entry has no Show on chart');
      assert.match(text(row('w-3b')), /Not on the chart: another entry from this day is the one plotted/);
    });

    test('the chart selection and the pressed action agree; selecting another point moves the mark', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(10)));
      await openRow('w-10');
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'true');
      await clickEl(hit(iso(0)));
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'false');
      // Weight now draws tiles: the selected one gets a neutral ring (not one of the change tints) and says "On chart".
      assert.ok(!/ring-(primary|foreground)/.test(row('w-10')!.className));
      assert.ok(/ring-(primary|foreground)/.test(row('w-0')!.className));
      assert.match(text(row('w-0')), /On chart/);
    });
  });

  describe('history row -> chart point', () => {
    test('Show on chart opens a collapsed Trend, selects exactly that record and focuses Jump to entry; again clears it', async () => {
      await mountPage('Weight');
      assert.equal(trendButton()!.getAttribute('aria-expanded'), 'false');
      await openRow('w-10');
      const btn = showOnChart('w-10')!;
      assert.equal(btn.getAttribute('aria-pressed'), 'false');
      await clickEl(btn);
      await settle(10);
      assert.equal(trendButton()!.getAttribute('aria-expanded'), 'true', 'Trend opened');
      assert.equal(readoutDate(), iso(10));
      assert.equal(doc().activeElement, jump(), 'focus lands on Jump to entry (the way back)');
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'true');
      await clickEl(showOnChart('w-10'));
      assert.equal(readoutDate(), null, 'pressing it again clears the selection');
      assert.equal(jump(), null);
    });

    test('an entry outside the chart range says so and offers the smallest range that shows it (nothing silent)', async () => {
      env.window.localStorage.setItem('fittrack_chart_weight_range', '7');
      await mountPage('Weight');
      await openRow('w-10');
      await clickEl(showOnChart('w-10'));
      await settle(10);
      assert.equal(readoutDate(), null);
      const note = q('[data-record-outside-range]')!;
      assert.match(text(note), /outside the chart's range \(last 7 days\)/);
      const widen = all('button', note)[0];
      assert.equal(text(widen), 'Show last 14 days');
      await clickEl(widen);
      await settle(10);
      assert.equal(readoutDate(), iso(10));
      assert.equal(q('[data-record-outside-range]'), null);
      assert.equal(env.window.localStorage.getItem('fittrack_chart_weight_range'), '14');
    });
  });

  describe('filters that hide the selected record', () => {
    test('says so with Clear filters, keeps the filters until asked, then reveals the row', async () => {
      await mountPage('Weight');
      await search('run'); // only w-3a ("after run") matches
      assert.ok(row('w-3a'));
      assert.equal(row('w-10'), null);
      await clickEl(hit(iso(10)));
      await clickEl(jump());
      const notice = q('[data-record-jump-notice]')!;
      assert.match(text(notice), /Your search or date filters are hiding that weight entry\./);
      assert.equal((q('input[aria-label="Search by notes..."]') as HTMLInputElement).value, 'run', 'filters are not cleared silently');
      assert.equal(row('w-10'), null);
      assert.equal(readoutDate(), iso(10), 'and the chart selection stays');
      await clickEl(all('button', notice).find((b) => text(b) === 'Clear filters'));
      await settle(10);
      assert.equal((q('input[aria-label="Search by notes..."]') as HTMLInputElement).value, '');
      assert.equal(q('[data-record-jump-notice]'), null);
      assert.ok(row('w-10'));
      assert.equal(doc().activeElement, rowButton('w-10'));
    });

    test('also when every row is filtered out (the list is not mounted): Clear filters brings it back and reveals the row', async () => {
      await mountPage('Weight');
      await search('zzz-nothing');
      assert.match(text(doc().body), /No entries match your filters/);
      await clickEl(hit(iso(35)));
      await clickEl(jump());
      assert.match(text(q('[data-record-jump-notice]')), /hiding that weight entry/);
      await clickEl(all('button', q('[data-record-jump-notice]')!).find((b) => text(b) === 'Clear filters'));
      await settle(10);
      assert.ok(row('w-35'));
      assert.equal(doc().activeElement, rowButton('w-35'));
    });

    test('the message goes away by itself when the person widens the filter another way', async () => {
      await mountPage('Weight');
      await search('run');
      await clickEl(hit(iso(10)));
      await clickEl(jump());
      assert.ok(q('[data-record-jump-notice]'));
      await search('');
      assert.equal(q('[data-record-jump-notice]'), null);
    });
  });

  describe('resets', () => {
    test('a range change keeps a selected record that is still shown, and clears one that left (announced)', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(10)));
      await openRow('w-10');
      await pick('Weight Trend range', 'Last 30 days');
      assert.equal(readoutDate(), iso(10), 'still inside 30 days');
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'true');
      await pick('Weight Trend range', 'Last 7 days');
      assert.equal(readoutDate(), null, 'outside 7 days');
      assert.match(text(q('[data-chart-day-live]')), /outside this date range/);
      assert.equal(jump(), null);
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'false');
    });

    test('a line/bar change keeps the selected record', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(10)));
      await pick('Weight Trend chart type', 'Bar chart');
      assert.equal(readoutDate(), iso(10));
      assert.ok(jump());
    });

    test('a different account starts clean: no selection, no pressed row, no Jump', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(10)));
      await openRow('w-10');
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'true');
      who.id = 'userB';
      await accountChanged();
      assert.equal(readoutDate(), null);
      assert.equal(jump(), null);
      assert.equal(showOnChart('w-10')!.getAttribute('aria-pressed'), 'false');
    });

    test('leaving the page forgets everything (a new visit has no selection)', async () => {
      await mountPage('Weight');
      await clickEl(hit(iso(10)));
      await act(async () => { roots.forEach((r) => r.unmount()); roots = []; doc().body.innerHTML = ''; });
      await mountPage('Weight');
      assert.equal(readoutDate(), null);
    });
  });

  describe('desktop layout', () => {
    test('no disclosure button is needed: the chart is simply open; Show on chart is an inline icon action', async () => {
      desktop = true;
      await mountPage('Weight');
      // The same markup serves both: the closed state only hides the panel BELOW md (max-md:hidden), and the button is md:hidden.
      assert.equal(trendButton()!.getAttribute('aria-expanded'), 'false');
      assert.ok(q('[data-trend-panel]')!.className.includes('max-md:hidden'));
      assert.ok(!/(^|\s)hidden(\s|$)/.test(q('[data-trend-panel]')!.className), 'never hidden outright');
      assert.ok(trendButton()!.className.includes('md:hidden'));
      await clickEl(hit(iso(130)));
      await clickEl(jump());
      await settle(10);
      const li = row('w-130')!;
      assert.ok(li, 'the row is on screen');
      // The row has a short note and no disclosure button on wide screens: the row itself takes focus (script only, tabindex -1).
      assert.equal(li.getAttribute('tabindex'), '-1');
      assert.equal(doc().activeElement, li);
      const action = all('button', li).find((b) => /^Show on chart:/.test(b.getAttribute('aria-label') ?? ''))!;
      assert.equal(action.getAttribute('aria-pressed'), 'true');
      await clickEl(action);
      assert.equal(readoutDate(), null);
    });

    test('row to point on desktop selects the point (Trend is already open)', async () => {
      desktop = true;
      await mountPage('Weight');
      const action = all('button', row('w-35')!).find((b) => /^Show on chart:/.test(b.getAttribute('aria-label') ?? ''))!;
      await clickEl(action);
      await settle(10);
      assert.equal(readoutDate(), iso(35));
      assert.equal(doc().activeElement, jump());
    });
  });

  describe('Sleep: manual records vs WHOOP aggregates', () => {
    beforeEach(() => {
      data.sleep = [
        { id: 's-1', date: iso(1), hours: 7.5, notes: 'good' },
        { id: 's-4', date: iso(4), hours: 6.2 },
        { id: 's-4x', date: iso(4), hours: 5.1 },
      ];
      // iso(2): WHOOP only. iso(1): WHOOP and manual.
      data.whoop = [
        { id: 'wh-1', date: iso(1), total_in_bed_hours: 8.1 },
        { id: 'wh-2', date: iso(2), total_in_bed_hours: 7.7 },
      ];
    });

    test('a manual point jumps to its exact sleep row; the readout shows both series for the day', async () => {
      await mountPage('Sleep');
      await clickEl(hit(iso(1)));
      assert.match(text(q('[data-chart-day-readout]')), /Manual Sleep 7\.5 hrs/);
      assert.match(text(q('[data-chart-day-readout]')), /WHOOP In Bed 8\.1 hrs/);
      await clickEl(jump());
      await settle(10);
      assert.equal(doc().activeElement, rowButton('s-1'));
    });

    test('same-day manual records on Sleep: the lowest id is plotted; the other is not on the chart', async () => {
      await mountPage('Sleep');
      await clickEl(hit(iso(4)));
      assert.match(text(q('[data-chart-day-readout]')), /Manual Sleep 6\.2 hrs/);
      assert.match(status(), /2 sleep entries on this day/);
      await clickEl(jump());
      await settle(10);
      assert.equal(doc().activeElement, rowButton('s-4'));
      await openRow('s-4x');
      assert.equal(showOnChart('s-4x'), undefined);
    });

    test('a WHOOP-only day can be looked at and opened in Calendar but has no Jump (there is no sleep entry)', async () => {
      env.window.localStorage.setItem('fittrack_chart_sleep_style', 'bar');
      await mountPage('Sleep');
      const bars = all('.recharts-bar-rectangle');
      assert.ok(bars.length > 0);
      // Pick the WHOOP series bar of iso(2) by trying every bar until the readout shows that day.
      let found = false;
      for (const bar of bars) {
        await clickEl(bar);
        if (readoutDate() === iso(2)) { found = true; break; }
      }
      assert.ok(found, 'the WHOOP-only day is selectable');
      assert.match(text(q('[data-chart-day-readout]')), /WHOOP In Bed 7\.7 hrs/);
      assert.equal(jump(), null);
      assert.match(status(), /only WHOOP data/);
      assert.equal(q('[data-chart-open-day]')!.getAttribute('href'), `/calendar?date=${iso(2)}`);
    });

    test('if WHOOP did not load, the page says so and the chart still draws and links the manual nights', async () => {
      tables.whoop = { phase: 'error', loadFailed: true, refreshFailed: false, error: null };
      await mountPage('Sleep');
      assert.match(text(q('[data-whoop-note]')), /WHOOP data didn't load/);
      await clickEl(hit(iso(1)));
      assert.doesNotMatch(text(q('[data-chart-day-readout]')), /WHOOP/);
      assert.ok(jump());
    });
  });
});
