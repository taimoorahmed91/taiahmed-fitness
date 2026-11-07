import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Chart day selection, mounted (real DOM, own process): direct point / bar clicks, the card readout and its Open day link,
// the full-screen viewer's Previous / Next buttons, Table rows and inline day panel, resets, opt-outs, focus and Escape.
// ResponsiveContainer is replaced by a fixed-size one so Recharts really draws SVG in jsdom; reduced motion is on.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartDaySelection.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

const actualRecharts = await import('recharts');
mock.module('recharts', () => ({
  ...actualRecharts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponsiveContainer: ({ children }: { children: any }) => (globalThis as any).__React.cloneElement(children, { width: 900, height: 400 }),
}));
mock.module('html2canvas', () => ({ default: async () => ({ width: 1, height: 1, toDataURL: () => 'data:image/png;base64,' }) }));
mock.module('jspdf', () => ({ jsPDF: class { internal = { pageSize: { getWidth: () => 1, getHeight: () => 1 } }; setFontSize() {} text() {} setTextColor() {} addImage() {} setFont() {} setDrawColor() {} line() {} addPage() {} save() {} } }));
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {} } }));

// What the inline day panel reads (the Calendar's own data hooks). Empty days are fine: the panel still renders.
const notesCtl = { isDemo: false, saveCalls: [] as unknown[], saveImpl: async (): Promise<boolean> => true };
const readyState = { phase: 'ready', loadFailed: false, refreshFailed: false, error: null };
mock.module('@/lib/sharedTable', () => ({ useSharedTable: () => ({}), useSharedTableState: () => readyState }));
const noop = async () => {};
// Stable references on purpose: the note editor treats a new `notes` array as "the stored note changed".
const NO_NOTES: never[] = [];
mock.module('@/hooks/useMeals', () => ({ useMeals: () => ({ meals: [], loading: false, refetch: noop }) }));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => ({ sessions: [], loading: false, refetch: noop }) }));
mock.module('@/hooks/useWeight', () => ({ useWeight: () => ({ entries: [], loading: false, refetch: noop }) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: () => ({ entries: [], refetch: noop }) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: () => ({ entries: [], refetch: noop }) }));
mock.module('@/hooks/useDailyNotes', () => ({
  SYMPTOM_TAGS: ['Headache', 'Fatigue', 'Travel'],
  useDailyNotes: () => ({
    notes: NO_NOTES, refetch: noop, userId: 'u1', isDemo: notesCtl.isDemo,
    saveNote: async (input: unknown) => { notesCtl.saveCalls.push(input); return notesCtl.saveImpl(); },
  }),
}));

// Which account is on screen. The charts ask for it through useOptionalUserId (src/contexts/userContextCore.ts); the test
// switches it like a sign-in change would, while the rows stay exactly the same (same dates, same cached data).
const who = { id: 'userA' as string | null };
const whoListeners = new Set<() => void>();
mock.module('@/contexts/userContextCore', () => ({
  UserContext: {},
  useOptionalUserId: () => (globalThis as unknown as { __React: typeof import('react') }).__React.useSyncExternalStore(
    (l) => { whoListeners.add(l); return () => { whoListeners.delete(l); }; },
    () => who.id,
  ),
}));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const days = (n: number) => Array.from({ length: n }, (_, i) => iso(n - 1 - i));
const longDay = (d: string) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

describe('mounted: chart day selection', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  let loc = { pathname: '', search: '' };

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    act = React.act;
    // Reduced motion: dots and bars are drawn at once.
    env.window.matchMedia = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    Object.defineProperty(globalThis, 'matchMedia', { value: env.window.matchMedia, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  beforeEach(() => {
    env.window.localStorage.clear();
    who.id = 'userA';
    notesCtl.isDemo = false;
    notesCtl.saveCalls = [];
    notesCtl.saveImpl = async () => true;
    const set = (k: string, v: string) => env.window.localStorage.setItem(k, v);
    set('fittrack_chart_weight_range', '30');
    set('fittrack_chart_weight_style', 'line');
    set('fittrack_chart_sleep_range', '30');
    set('fittrack_chart_sleep_style', 'bar');
    set('fittrack_chart_macro_Protein: Actual vs Target_range', '14');
    set('fittrack_chart_macro_Protein: Actual vs Target_style', 'line');
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
  };
  const press = async (key: string) => act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  const dialogs = () => all('[role="dialog"]');
  const viewer = () => q('[data-chart-viewer]')!;
  const readout = (scope: ParentNode = doc()) => q('[data-chart-day-readout]', scope);
  const readoutDate = (scope: ParentNode = doc()) => readout(scope)?.getAttribute('data-chart-day-readout') ?? null;
  const barDate = () => q('[data-chart-selection-bar] time')?.getAttribute('datetime') ?? null;
  const live = (scope: ParentNode = doc()) => text(q('[data-chart-day-live]', scope));

  const Probe = () => {
    const l = Router.useLocation();
    loc = { pathname: l.pathname, search: l.search };
    return null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(
      React.createElement(Router.MemoryRouter, null, React.createElement(Probe), React.createElement(TooltipProvider, null, node)),
    ));
    await settle(5);
    return host;
  };

  const weightRows = () => days(40).map((date, i) => ({ date, weight: Math.round((80 + Math.sin(i / 4)) * 10) / 10 }));
  const mountWeight = async (rows = weightRows()) => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    return mount(React.createElement(TrendChart, { id: 'weight', title: 'Weight Trend', icon: React.createElement('span'), data: rows, unit: 'kg', series: [{ key: 'weight', label: 'Weight', color: '#000' }], empty: 'none' }));
  };
  const mountSleep = async (rows: { date: string; hours: number | null }[]) => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    return mount(React.createElement(TrendChart, { id: 'sleep', title: 'Sleep', icon: React.createElement('span'), data: rows, unit: 'hrs', series: [{ key: 'hours', label: 'Sleep', color: '#000' }], empty: 'none', defaultStyle: 'bar' }));
  };
  const macroRows = () => days(10).map((date, i) => ({ date, actual: 100 + i, min: i < 3 ? null : 90, max: i < 3 ? null : 130 }));
  const mountMacro = async () => {
    const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
    return mount(React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', metric: 'protein', data: macroRows() }));
  };
  const hit = (date: string) => q(`g[data-chart-point="${date}"] circle[fill="transparent"]`);
  const pick = async (root: ParentNode, group: string, label: string) => clickEl(q(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`, root));
  const expand = (title: string) => q(`button[aria-label="Open ${title} in full screen"]`) as HTMLButtonElement;
  const openViewer = async (title: string) => { await clickEl(expand(title)); await settle(10); return viewer(); };
  const stepBtn = (which: 'previous' | 'next') => q(`[data-chart-step="${which}"]`)!;
  const viewTab = async (label: 'Chart' | 'Table') => {
    const radio = all('[role="radio"]', viewer()).find((r) => r.getAttribute('aria-label') === label || text(r) === label);
    await clickEl(radio);
  };

  describe('card: points', () => {
    test('clicking a real point shows a compact readout under the plot (date, value, Open day), with no modal', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      assert.ok(readout(host) === null, 'nothing selected at first');
      const target = rows[25];
      await clickEl(hit(target.date));
      assert.equal(readoutDate(host), target.date);
      assert.match(text(readout(host)), new RegExp(`Weight ${target.weight} kg`));
      assert.equal(dialogs().length, 0, 'selecting does not open a modal');
      const link = q('[data-chart-open-day]', host) as HTMLAnchorElement;
      assert.equal(link.getAttribute('href'), `/calendar?date=${target.date}`);
      assert.match(link.getAttribute('aria-label')!, new RegExp(`Open day ${longDay(target.date)} in Calendar`));
      assert.equal(text(link), 'Open day');
    });

    test('the readout sits between the plot and the Chart summary, and is announced politely', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      assert.equal(live(host), '', 'the live region exists but is empty before a selection');
      assert.equal(q('[data-chart-day-live]', host)!.getAttribute('aria-live'), 'polite');
      await clickEl(hit(rows[30].date));
      assert.match(live(host), new RegExp(`^Selected ${longDay(rows[30].date)}: Weight ${rows[30].weight} kg\\.$`));
      const figure = q('figure', host)!;
      const order = [...figure.children].map((c) => c.hasAttribute('data-chart-day-readout-root') ? 'readout' : c.hasAttribute('data-chart-summary') ? 'summary' : '');
      assert.ok(order.indexOf('readout') > -1 && order.indexOf('readout') < order.indexOf('summary'), 'readout is above the Chart summary toggle');
    });

    test('the selected point has non-colour cues: a ring and a dashed day guide, and clicking it again clears it', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      await clickEl(hit(rows[28].date));
      const selected = all('g[data-selected][data-chart-point]', host);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].getAttribute('data-chart-point'), rows[28].date);
      assert.equal(selected[0].querySelectorAll('circle').length, 3, 'ring + dot + hit area');
      assert.ok(q('.recharts-reference-line line[stroke-dasharray="3 3"]', host), 'dashed vertical guide');
      await clickEl(hit(rows[28].date));
      assert.ok(readout(host) === null);
      assert.equal(all('g[data-selected]', host).length, 0);
    });

    test('every visible day of a line chart has a hit area, and moving to another day moves the selection', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      assert.equal(all('g[data-chart-point]', host).length, 30, 'the 30 days of the range');
      await clickEl(hit(rows[20].date));
      await clickEl(hit(rows[22].date));
      assert.equal(readoutDate(host), rows[22].date);
      assert.equal(all('[data-chart-day-readout]', host).length, 1);
    });

    test('Open day pushes /calendar?date=... (Back returns to the chart page)', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      await clickEl(hit(rows[26].date));
      await clickEl(q('[data-chart-open-day]', host));
      assert.deepEqual(loc, { pathname: '/calendar', search: `?date=${rows[26].date}` });
    });

    test('Clear removes the readout and announces nothing selected', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      await clickEl(hit(rows[26].date));
      await clickEl(q('[data-chart-day-clear]', host));
      assert.ok(readout(host) === null);
    });
  });

  describe('card: bars, style and range', () => {
    test('clicking a bar selects its day; switching to Line keeps the day when its row is still shown', async () => {
      const rows = weightRows();
      env.window.localStorage.setItem('fittrack_chart_weight_style', 'bar');
      const host = await mountWeight(rows);
      const shown = rows.slice(-30);
      const bars = all('.recharts-bar-rectangle', host);
      assert.equal(bars.length, 30);
      await clickEl(bars[12]);
      assert.equal(readoutDate(host), shown[12].date);
      assert.equal(q('.recharts-bar-rectangle path[stroke-width="2.5"]', host)?.closest('.recharts-bar-rectangle'), bars[12], 'the selected bar has a thick outline');
      await pick(host, 'Weight Trend chart type', 'Line chart');
      assert.equal(readoutDate(host), shown[12].date, 'style change retains the selection');
      assert.equal(all('g[data-selected]', host).length, 1, 'and the line chart marks the same day');
      await pick(host, 'Weight Trend chart type', 'Bar chart');
      assert.equal(readoutDate(host), shown[12].date);
    });

    test('selection resets when the selected day leaves the visible range, and the live region says why', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      const oldest = rows.slice(-30)[0];
      await clickEl(hit(oldest.date));
      assert.equal(readoutDate(host), oldest.date);
      await pick(host, 'Weight Trend range', 'Last 7 days');
      assert.ok(readout(host) === null, 'a day outside 7D is no longer selected');
      assert.match(live(host), /outside this date range/);
      await pick(host, 'Weight Trend range', 'Last 30 days');
      assert.ok(readout(host) === null, 'widening again does not bring it back unasked');
    });

    test('a day that stays in range survives a range change', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      const newest = rows[rows.length - 1];
      await clickEl(hit(newest.date));
      await pick(host, 'Weight Trend range', 'Last 7 days');
      assert.equal(readoutDate(host), newest.date);
    });
  });

  describe('null points and targets are not selectable', () => {
    test('a day with no value has no hit area, no bar action and no table button', async () => {
      const rows = days(10).map((date, i) => ({ date, hours: i === 4 ? null : 7 }));
      const host = await mountSleep(rows);
      const bars = all('.recharts-bar-rectangle', host);
      // Recharts keeps a slot for every row; whichever one belongs to the null day must do nothing.
      for (const bar of bars) await clickEl(bar);
      const selectedDates = new Set<string>();
      for (const bar of bars) { await clickEl(bar); const d = readoutDate(host); if (d) selectedDates.add(d); }
      assert.ok(!selectedDates.has(rows[4].date), 'the null day is never selected');
      await pick(host, 'Sleep chart type', 'Line chart');
      assert.ok(hit(rows[4].date) === null, 'no hit area for a null point');
      assert.ok(hit(rows[3].date), 'its neighbours still have one');
    });

    test('line mode: only the Actual series has hit areas; Min and Max target lines have none', async () => {
      const host = await mountMacro();
      assert.equal(all('g[data-chart-point]', host).length, 10, 'one per day, from the Actual series only');
      await clickEl(hit(macroRows()[6].date));
      assert.equal(readoutDate(host), macroRows()[6].date);
      assert.match(text(readout(host)), /Actual 106 g/);
      assert.match(text(readout(host)), /Min target 90 g/, 'targets appear as context in the readout, never as the selection');
    });

    test('bar mode: clicking a Min or Max target bar does nothing; the Actual bar selects', async () => {
      env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_style', 'bar');
      const host = await mountMacro();
      const groups = all('.recharts-bar', host);
      assert.equal(groups.length, 3);
      const [actual, min, max] = groups.map((g) => all('.recharts-bar-rectangle', g));
      for (const bar of [...min, ...max]) await clickEl(bar);
      assert.ok(readout(host) === null, 'target bars are not selectable');
      await clickEl(actual[5]);
      assert.equal(readoutDate(host), macroRows()[5].date);
    });
  });

  describe('full-screen viewer', () => {
    test('opens with no selection: Previous / Next date buttons and a hint, no day panel, no second dialog', async () => {
      await mountWeight();
      const v = await openViewer('Weight Trend');
      assert.equal(dialogs().length, 1);
      assert.ok(q('[data-chart-selection-bar]', v));
      assert.match(text(q('[data-chart-selection-hint]', v)), /No day selected/);
      assert.ok(q('[data-chart-day-panel]', v) === null);
      assert.ok(q('[data-chart-open-day]', v) === null, 'the viewer opens the day from its panel, not from a card link');
    });

    test('Previous / Next step through days; the plot, readout and inline day panel follow; ends are aria-disabled, not disabled', async () => {
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      const shown = rows.slice(-30);
      await clickEl(stepBtn('previous'));
      assert.equal(barDate(), shown[29].date, 'from nothing, Previous starts at the newest day');
      assert.equal(stepBtn('next').getAttribute('aria-disabled'), 'true');
      assert.equal(stepBtn('next').hasAttribute('disabled'), false, 'aria-disabled keeps keyboard focus');
      await clickEl(stepBtn('next'));
      assert.equal(barDate(), shown[29].date, 'Next at the end does nothing');
      await clickEl(stepBtn('previous'));
      await clickEl(stepBtn('previous'));
      assert.equal(barDate(), shown[27].date);
      assert.match(live(v), new RegExp(`^Selected ${longDay(shown[27].date)}`));
      assert.equal(all('g[data-selected]', v).length, 1, 'the expanded plot marks the same day');
      // The Calendar's own panel, inline.
      await settle(30);
      const panel = q('[data-day-detail]', v)!;
      assert.ok(panel, 'inline day panel');
      assert.equal(panel.getAttribute('data-day-detail'), shown[27].date);
      assert.equal(dialogs().length, 1, 'still a single dialog: the panel is a section, not a nested modal');
      const calLink = all('a', panel).find((a) => /in Calendar/.test(a.getAttribute('aria-label') ?? ''))!;
      assert.equal(calLink.getAttribute('href'), `/calendar?date=${shown[27].date}`);
      assert.ok(q(`[aria-label="Add note for ${longDay(shown[27].date)}"]`, panel), 'safe Add note from the foundation editor');
      // Step back to the oldest: Previous becomes aria-disabled.
      for (let i = 0; i < 40; i++) await clickEl(stepBtn('previous'));
      assert.equal(barDate(), shown[0].date);
      assert.equal(stepBtn('previous').getAttribute('aria-disabled'), 'true');
    });

    test('the card behind the viewer shares the same selection', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      await openViewer('Weight Trend');
      await clickEl(stepBtn('next'));
      const oldest = rows.slice(-30)[0].date;
      assert.equal(barDate(), oldest);
      assert.equal(readoutDate(host), oldest, 'the card readout is the same selection');
      await press('Escape');
      await settle(10);
      assert.equal(dialogs().length, 0);
      assert.equal(readoutDate(host), oldest, 'closing the viewer keeps the day');
    });

    test('direct clicks on the expanded plot select too, and a Table row selects the same day (Chart and Table share it)', async () => {
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      const shown = rows.slice(-30);
      await clickEl(hit(shown[10].date) && all(`g[data-chart-point="${shown[10].date}"] circle[fill="transparent"]`, v)[0]);
      assert.equal(barDate(), shown[10].date);
      await viewTab('Table');
      const row = q(`tr[data-row-id="${shown[10].date}"]`, v)!;
      assert.equal(row.hasAttribute('data-selected'), true, 'the table marks the day picked in the chart');
      assert.equal(q('button[aria-pressed]', row)!.getAttribute('aria-pressed'), 'true');
      assert.ok(q('svg', q('button', row)!), 'a check mark: not colour alone');
      // Pick another row through its keyboard-reachable button.
      const other = q(`tr[data-row-id="${shown[3].date}"] button`, v)!;
      await clickEl(other);
      assert.equal(barDate(), shown[3].date);
      assert.equal(all('tbody tr[data-selected]', v).length, 1);
      assert.equal(all('[data-chart-table] tbody tr', v).length, 30, 'the table still lists every row');
      assert.equal((q('[data-chart-csv]', v) as HTMLButtonElement).disabled, false, 'CSV is unaffected');
      // Back to the chart: the plot marks the same day.
      await viewTab('Chart');
      assert.equal(all('g[data-selected]', v).length, 1);
      assert.equal(q('g[data-selected]', v)!.getAttribute('data-chart-point'), shown[3].date);
    });

    test('in Table mode the steppers still work and the day panel is reachable below the table', async () => {
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      await viewTab('Table');
      await clickEl(stepBtn('previous'));
      await settle(30);
      const newest = rows[rows.length - 1].date;
      assert.equal(barDate(), newest);
      const wrap = q('[data-chart-viewer-selection]', v)!;
      assert.ok(wrap.contains(q('[data-chart-table]', v)) && wrap.contains(q('[data-day-detail]', v)), 'bar, table and panel share one scroller');
      // Clicking the selected row's button clears it.
      await clickEl(q(`tr[data-row-id="${newest}"] button`, v));
      assert.match(text(q('[data-chart-selection-hint]', v)), /No day selected/);
      assert.ok(q('[data-chart-day-panel]', v) === null);
    });

    test('a table row with no value has no select button, and the bar skips that day when stepping', async () => {
      const rows = days(10).map((date, i) => ({ date, hours: i === 4 ? null : 7 }));
      await mountSleep(rows);
      const v = await openViewer('Sleep');
      await viewTab('Table');
      assert.ok(q(`tr[data-row-id="${rows[4].date}"] button`, v) === null);
      assert.ok(q(`tr[data-row-id="${rows[5].date}"] button`, v));
      await clickEl(q(`tr[data-row-id="${rows[5].date}"] button`, v));
      await clickEl(stepBtn('previous'));
      assert.equal(barDate(), rows[3].date, 'Previous jumps over the null day');
    });

    test('changing range inside the viewer clears a day that left the range', async () => {
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      await clickEl(stepBtn('next')); // oldest of 30
      assert.equal(barDate(), rows.slice(-30)[0].date);
      await pick(v, 'Weight Trend range', 'Last 7 days');
      assert.match(text(q('[data-chart-selection-hint]', v)), /No day selected/);
      assert.match(live(v), /outside this date range/);
      assert.ok(q('[data-chart-day-panel]', v) === null);
    });
  });

  describe('focus and Escape', () => {
    test('every selection control is inside the single viewer dialog; Escape closes only the viewer and focus returns to its button', async () => {
      await mountWeight();
      const v = await openViewer('Weight Trend');
      assert.ok(v.contains(stepBtn('previous')) && v.contains(stepBtn('next')));
      await act(async () => (stepBtn('previous') as HTMLElement).focus());
      await clickEl(stepBtn('previous'));
      assert.ok(v.contains(doc().activeElement), 'focus stays in the viewer after a selection');
      await press('Escape');
      await settle(20);
      assert.equal(dialogs().length, 0, 'one Escape closes the viewer');
      assert.ok(doc().activeElement === expand('Weight Trend'), 'focus returns to the pop-out button');
    });

    test('with the note editor open, Escape closes the editor first and the viewer stays', async () => {
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      await clickEl(stepBtn('previous'));
      await settle(30);
      const day = rows[rows.length - 1].date;
      await clickEl(q(`[aria-label="Add note for ${longDay(day)}"]`, v));
      assert.equal(dialogs().length, 2, 'the foundation note editor is its own dialog');
      await press('Escape');
      await settle(20);
      assert.equal(dialogs().length, 1, 'only the editor closed');
      assert.ok(q('[data-chart-viewer]'), 'the viewer is still open');
    });

    // Typed text is covered by tests/mounted/selectedDayPanel.dom.tsx. This file loads Recharts before the fake DOM exists, which
    // switches React DOM's input-event support off, so the draft here is built from tag chips (click events work).
    test('note editing is inherited: a failed save keeps the editor and the draft open inside the viewer', async () => {
      notesCtl.saveImpl = async () => false;
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      await clickEl(stepBtn('previous'));
      await settle(30);
      await clickEl(q(`[aria-label="Add note for ${longDay(rows[rows.length - 1].date)}"]`, v));
      const editor = dialogs()[1];
      await clickEl(all('button', editor).find((b) => text(b) === 'Travel'));
      await clickEl(all('button', editor).find((b) => text(b).startsWith('Save')));
      await settle(30);
      assert.equal(dialogs().length, 2, 'still open after a failed save');
      assert.ok(q('[role="alert"]', editor));
      assert.equal(notesCtl.saveCalls.length, 1);
      assert.equal(all('button', editor).find((b) => text(b) === 'Travel')!.getAttribute('aria-pressed'), 'true', 'the draft is kept');
    });





    test('the demo account sees the read-only reason in the inline panel instead of an editable note', async () => {
      notesCtl.isDemo = true;
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      await clickEl(stepBtn('previous'));
      await settle(30);
      assert.match(text(q('[data-chart-day-panel]', v)), /demo account is view only/);
    });
  });

  describe('opt-outs: charts that are not one calendar day per row', () => {
    test('Calories by Time of Day: no selection bar, no row buttons, no Open day, no hit areas', async () => {
      const { MealTimeChart } = await import('../../src/components/MealTimeChart');
      const slice = [{ name: 'Morning', calories: 500, count: 2 }, { name: 'Evening', calories: 900, count: 3 }];
      const host = await mount(React.createElement(MealTimeChart, { data7: slice, data14: slice, data30: slice, data90: slice }));
      const v = await openViewer('Calories by Time of Day');
      await viewTab('Table');
      assert.ok(q('[data-chart-table]', v), 'the table is still there');
      for (const scope of [host, v]) {
        assert.ok(q('[data-chart-selection-bar]', scope) === null);
        assert.ok(q('[data-chart-row-select]', scope) === null);
        assert.ok(q('[data-chart-open-day]', scope) === null);
        assert.ok(q('[data-chart-day-readout-root]', scope) === null);
        assert.ok(q('g[data-chart-point]', scope) === null);
      }
    });

    test('Body Recomposition Index: the index is period-derived, so no day can be selected anywhere', async () => {
      const { BodyRecompositionCard } = await import('../../src/components/BodyRecompositionCard');
      const weight = days(20).map((date, i) => ({ date, value: 80 - i * 0.1 }));
      const waist = days(20).map((date, i) => ({ date, value: 90 - i * 0.1 }));
      env.window.localStorage.setItem('fittrack_chart_body_recomp_range', '30');
      const host = await mount(React.createElement(BodyRecompositionCard, { weight, waist }));
      assert.ok(q('g[data-chart-point]', host) === null);
      const v = await openViewer('Body Recomposition Index');
      await viewTab('Table');
      assert.equal(all('[data-chart-table] tbody tr', v).length, 20, 'the table is complete');
      for (const scope of [host, v]) {
        assert.ok(q('[data-chart-selection-bar]', scope) === null);
        assert.ok(q('[data-chart-row-select]', scope) === null);
        assert.ok(q('[data-chart-open-day]', scope) === null);
      }
    });

    test('a TrendChart with "MM/DD" labels instead of ISO dates is not selectable (no Open day for a non-ISO date)', async () => {
      const rows = days(8).map((date, i) => ({ date: date.slice(5).replace('-', '/'), weight: 80 + i }));
      const host = await mountWeight(rows);
      assert.equal(all('g[data-chart-point]', host).length, 0);
      const v = await openViewer('Weight Trend');
      assert.ok(q('[data-chart-selection-bar]', v) === null);
    });
  });

  describe('account scope: one account never sees another account\'s selected day', () => {
    const switchTo = async (id: string | null) => act(async () => { who.id = id; whoListeners.forEach((l) => l()); });

    test('hook: the first render for account B already shows nothing selected, never A\'s day, and A\'s choice is not restored', async () => {
      const { useChartDaySelection } = await import('../../src/components/charts/useChartDaySelection');
      const { createChartDataset } = await import('../../src/lib/chartViewerData');
      const rowsAll = days(5).map((date) => ({ date, weight: 80 }));
      const make = (rows: typeof rowsAll) => createChartDataset({ name: 'W', period: 'p', rows, columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight' }], selection: { metric: 'weight', valueKeys: ['weight'] } });
      const full = make(rowsAll);
      const tail = make(rowsAll.slice(-1));
      const renders: { scope: string | null; selected: string | null; notice: string | null }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let latest: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Probe = ({ scope, dataset }: any) => {
        const sel = useChartDaySelection(dataset, scope);
        renders.push({ scope, selected: sel.selected?.rowId ?? null, notice: sel.clearedNotice });
        latest = sel;
        return null;
      };
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      const show = (scope: string | null, dataset: typeof full) => act(async () => root.render(React.createElement(Probe, { scope, dataset })));

      await show('userA', full);
      await act(async () => latest.toggleRow(rowsAll[0].date));
      assert.equal(latest.selected?.rowId, rowsAll[0].date);
      // A's day leaves the range: A gets the cleared notice.
      await show('userA', tail);
      assert.ok(latest.clearedNotice, 'A is told the day was cleared');
      // Select again in A, then switch to B with the SAME dates and rows.
      await show('userA', full);
      await act(async () => latest.toggleRow(rowsAll[2].date));
      assert.equal(latest.selected?.rowId, rowsAll[2].date);
      renders.length = 0;
      await show('userB', full);
      assert.ok(renders.length > 0 && renders.every((r) => r.scope === 'userB'));
      assert.ok(renders.every((r) => r.selected === null), 'no render for B ever exposed A\'s selected day');
      assert.ok(renders.every((r) => r.notice === null), 'nor A\'s notice');
      // Going back to A does not bring the old choice back.
      renders.length = 0;
      await show('userA', full);
      assert.ok(renders.every((r) => r.selected === null));
      // The notice is account scoped too: produce one in A, then switch.
      await act(async () => latest.toggleRow(rowsAll[0].date));
      await show('userA', tail);
      assert.ok(latest.clearedNotice);
      renders.length = 0;
      await show('userB', tail);
      assert.ok(renders.every((r) => r.notice === null && r.selected === null));
      // And a step() in B starts from nothing, not from A's day.
      await act(async () => latest.step(-1));
      assert.equal(latest.selected?.rowId, rowsAll[rowsAll.length - 1].date);
    });

    test('card: switching account clears the readout and the live region at once (same date, same cached data)', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      await clickEl(hit(rows[25].date));
      assert.equal(readoutDate(host), rows[25].date);
      assert.match(live(host), /Selected/);
      await switchTo('userB');
      assert.ok(readout(host) === null, 'B sees no readout');
      assert.equal(live(host), '');
      assert.equal(all('g[data-selected]', host).length, 0);
      assert.ok(q('.recharts-reference-line', host) === null, 'and no day guide');
      // B can select the very same day; it is B\'s own selection.
      await clickEl(hit(rows[25].date));
      assert.equal(readoutDate(host), rows[25].date);
      await switchTo('userA');
      assert.ok(readout(host) === null, 'switching back does not resurrect A selection');
    });

    test('signed out (no id) is its own scope too', async () => {
      const rows = weightRows();
      const host = await mountWeight(rows);
      await clickEl(hit(rows[20].date));
      await switchTo(null);
      assert.ok(readout(host) === null);
    });

    test('viewer: switching account hides the stepper selection, the Table row and the inline day panel', async () => {
      const rows = weightRows();
      await mountWeight(rows);
      const v = await openViewer('Weight Trend');
      await clickEl(stepBtn('previous'));
      await settle(30);
      assert.ok(q('[data-day-detail]', v), 'A has the panel');
      await switchTo('userB');
      assert.match(text(q('[data-chart-selection-hint]', v)), /No day selected/);
      assert.ok(q('[data-chart-day-panel]', v) === null);
      assert.ok(q('[data-day-detail]', v) === null);
      assert.equal(live(v), '');
      await viewTab('Table');
      assert.equal(all('[data-chart-table] tr[data-selected]', v).length, 0);
      // Previous starts from the newest day again, for B.
      await clickEl(stepBtn('previous'));
      assert.equal(barDate(), rows[rows.length - 1].date);
    });

    test('the note editor stays keyed by account AND date (foundation behaviour kept)', async () => {
      const { readFileSync } = await import('node:fs');
      const panel = readFileSync(new URL('../../src/components/calendar/SelectedDayPanel.tsx', import.meta.url), 'utf8');
      assert.match(panel, /key=\{`\$\{note\.userId \?\? 'anonymous'\}\|\$\{isoDate\}`\}/);
      const hook = readFileSync(new URL('../../src/components/charts/useAccountChartSelection.ts', import.meta.url), 'utf8');
      assert.match(hook, /useChartDaySelection\(dataset, useOptionalUserId\(\)\)/);
    });
  });

  describe('observed intake (macro charts): blank is not zero', () => {
    // idx: 0 no meals (targets only) | 1 meals, macro unrecorded | 2 explicit 0 | 3 positive | 4 partial (interior gap)
    //      5 positive | 6 positive | 7 today, nothing logged yet
    const FIXTURE: { actual: number | null; intake: string }[] = [
      { actual: null, intake: 'no-meals' }, { actual: null, intake: 'unrecorded' }, { actual: 0, intake: 'recorded' }, { actual: 120, intake: 'recorded' },
      { actual: null, intake: 'partial' }, { actual: 110, intake: 'recorded' }, { actual: 130, intake: 'recorded' }, { actual: null, intake: 'no-meals' },
    ];
    const OBSERVED = [2, 3, 5, 6];
    const fixtureRows = () => days(FIXTURE.length).map((date, i) => ({ date, ...FIXTURE[i], min: 90, max: 150 }));
    const mountFixture = async () => {
      const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
      return mount(React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', metric: 'protein', data: fixtureRows() }));
    };
    const dateOf = (i: number) => fixtureRows()[i].date;

    test('line: only observed days have a point and a hit area; null days (and today with nothing logged) have none', async () => {
      const host = await mountFixture();
      const withHit = all('g[data-chart-point]', host).map((g) => g.getAttribute('data-chart-point'));
      assert.deepEqual(withHit, OBSERVED.map(dateOf));
      for (const i of [0, 1, 4, 7]) assert.ok(hit(dateOf(i)) === null, `day ${i} is not selectable`);
    });

    test('line: an explicit 0 is selectable and reads "0 g"; a positive day reads its value; null days never show "0"', async () => {
      const host = await mountFixture();
      await clickEl(hit(dateOf(2)));
      assert.equal(readoutDate(host), dateOf(2));
      assert.match(text(readout(host)), /Actual 0 g/);
      await clickEl(hit(dateOf(3)));
      assert.match(text(readout(host)), /Actual 120 g/);
      assert.match(text(readout(host)), /Min target 90 g/, 'targets stay as context');
    });

    test('line: unobserved days are a visible gap in the actual line (it does not connect across them)', async () => {
      const host = await mountFixture();
      const path = all('path.recharts-line-curve', host).find((p) => p.getAttribute('stroke') === 'hsl(var(--chart-actual))')!;
      const segments = (path.getAttribute('d') ?? '').match(/M/g)?.length ?? 0;
      assert.ok(segments >= 2, `the line breaks at the unlogged day (found ${segments} segment)`);
      // Targets are still continuous lines.
      const min = all('path.recharts-line-curve', host).find((p) => p.getAttribute('stroke') === 'hsl(var(--chart-min))')!;
      assert.equal((min.getAttribute('d') ?? '').match(/M/g)?.length, 1);
    });

    test('a zero that was FILLED IN (intake says nothing was observed) is not selectable, while a recorded 0 is', async () => {
      const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
      const rows = days(4).map((date, i) => ({ date, actual: 0, intake: i === 1 ? 'recorded' : 'no-meals', min: 90, max: 150 }));
      const host = await mount(React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', metric: 'protein', data: rows }));
      assert.deepEqual(all('g[data-chart-point]', host).map((g) => g.getAttribute('data-chart-point')), [rows[1].date]);
    });

    test('the chart summary explains that a blank day is not fully logged (the one-line caption stays short)', async () => {
      const host = await mountFixture();
      assert.match(text(q('[data-chart-reading]', host)), /Blank days are not fully logged/);
      assert.doesNotMatch(text(q('figure > p', host)), /Blank|Select a/, 'the caption is only units and period');
    });

    test('bar: bars of unobserved days select nothing; the explicit-zero day can still be selected', async () => {
      env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_style', 'bar');
      const host = await mountFixture();
      const group = all('.recharts-bar', host)[0];
      const picked = new Set<string>();
      for (const bar of all('.recharts-bar-rectangle', group)) { await clickEl(bar); const d = readoutDate(host); if (d) picked.add(d); }
      for (const d of picked) assert.ok(OBSERVED.map(dateOf).includes(d), `${d} must be an observed day`);
      assert.ok(picked.has(dateOf(2)), 'explicit zero is selectable by its bar');
      for (const i of [0, 1, 4, 7]) assert.ok(!picked.has(dateOf(i)));
    });

    test('viewer: Previous / Next skip unobserved days; Table keeps every row (blank for null, 0 for the explicit zero) and selects observed rows only', async () => {
      await mountFixture();
      const v = await openViewer('Protein: Actual vs Target');
      const order: (string | null)[] = [];
      for (let i = 0; i < OBSERVED.length; i++) { await clickEl(stepBtn('previous')); order.push(barDate()); }
      assert.deepEqual(order, [...OBSERVED].reverse().map(dateOf), 'newest observed first, partial day skipped');
      assert.equal(stepBtn('previous').getAttribute('aria-disabled'), 'true');
      await viewTab('Table');
      const rows = all('[data-chart-table] tbody tr', v);
      assert.equal(rows.length, FIXTURE.length, 'Table is complete');
      const cell = (i: number) => text(q(`tr[data-row-id="${dateOf(i)}"] td`, v));
      assert.match(cell(2), /^0\b/, 'explicit zero shows 0');
      for (const i of [0, 1, 4, 7]) {
        assert.match(cell(i), /^—\s*No value/, `day ${i} is blank`);
        assert.ok(q(`tr[data-row-id="${dateOf(i)}"] button`, v) === null, `day ${i} has no select button`);
      }
      for (const i of OBSERVED) assert.ok(q(`tr[data-row-id="${dateOf(i)}"] button`, v), `day ${i} can be selected`);
    });
  });
});
