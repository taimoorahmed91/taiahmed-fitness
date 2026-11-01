import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// A / B picks and "Open in Compare", mounted on the real Weight and Sleep pages (real trend chart, history list, viewer, Table) with the
// real Compare page behind the link. Covers: exact record identity (same-date duplicates), manual vs WHOOP Sleep, Set as A / Set as B in the
// viewer's Chart and Table, picks surviving Chart / Table, Line / Bar and a wider range, a narrower range clearing a hidden pick with an
// announcement, account switch, a deleted record, unsupported points (a reason, never a disabled mystery button), Waist and the Dashboard
// chart having no Compare controls, the ordered link, Back from Compare, and the card summary.
// ResponsiveContainer is replaced by a fixed-size one so Recharts really draws SVG in jsdom; reduced motion is on.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartCompare.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

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
const short = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

type Entry = Record<string, unknown>;
const data = { weight: [] as Entry[], sleep: [] as Entry[], whoop: [] as Entry[] };
const tables: Record<string, { phase: string; loadFailed: boolean; refreshFailed: boolean; error: null }> = {};
const ready = () => ({ phase: 'ready', loadFailed: false, refreshFailed: false, error: null });
for (const t of ['weight', 'waist', 'sleep', 'whoop', 'meals', 'gym_sessions']) tables[t] = ready();

// A version counter so a test can change the records and make the mounted pages read them again.
let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version += 1; listeners.forEach((l) => l()); };

mock.module('@/lib/sharedTable', () => ({ useSharedTable: () => ({}), useSharedTableState: (table: string) => tables[table] ?? ready() }));
const useVersion = () => (globalThis as unknown as { __React: typeof import('react') }).__React.useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version);
const hook = (key: 'weight' | 'sleep') => () => (useVersion(), { entries: data[key], loading: false, addEntry: async () => true, updateEntry: async () => true, deleteEntry: async () => true, refetch: async () => {} });
mock.module('@/hooks/useWeight', () => ({ useWeight: hook('weight') }));
mock.module('@/hooks/useSleep', () => ({ useSleep: hook('sleep') }));
mock.module('@/hooks/useMeals', () => ({ useMeals: () => ({ meals: [], refetch: async () => {} }) }));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => ({ sessions: [], refetch: async () => {} }) }));
mock.module('@/hooks/useWhoopData', () => ({ useWhoopData: () => (useVersion(), { entries: data.whoop, loading: false }) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: () => ({ entries: [], refetch: async () => {} }) }));
// What the viewer's inline day panel reads (the Calendar's own data hooks). Stable references on purpose.
const NO_NOTES: never[] = [];
mock.module('@/hooks/useDailyNotes', () => ({
  SYMPTOM_TAGS: ['Headache', 'Fatigue', 'Travel'],
  useDailyNotes: () => ({ notes: NO_NOTES, refetch: async () => {}, userId: 'u1', isDemo: false, saveNote: async () => true }),
}));
mock.module('@/hooks/usePersonalData', () => ({ usePersonalData: () => ({ data: { target_weight_kg: null }, loading: false }) }));

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
];

describe('mounted: chart A / B picks and Open in Compare (Weight, Sleep)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any, Router: any, TooltipProvider: any, Ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  let navLog: { path: string; search: string; type: string }[] = [];
  let go: (to: number | string) => void = () => {};
  let setAccount: (id: string | null) => void = () => {};

  before(async () => {
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    Ctx = await import('../../src/contexts/userContextCore');
    act = React.act;
    const mm = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    env.window.matchMedia = mm;
    Object.defineProperty(globalThis, 'matchMedia', { value: mm, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  beforeEach(() => {
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_weight_range', 'all');
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'line');
    env.window.localStorage.setItem('fittrack_chart_sleep_range', '90');
    env.window.localStorage.setItem('fittrack_chart_sleep_style', 'bar');
    for (const t of Object.keys(tables)) tables[t] = ready();
    data.weight = weightData();
    data.sleep = [
      { id: 's-1', date: iso(1), hours: 7.5, notes: 'good' },
      { id: 's-4', date: iso(4), hours: 6.2 },
      { id: 's-4x', date: iso(4), hours: 5.1 },
      { id: 's-9', date: iso(9), hours: 8 },
    ];
    // iso(2): WHOOP only. iso(1): WHOOP and manual.
    data.whoop = [{ id: 'wh-1', date: iso(1), total_in_bed_hours: 8.1 }, { id: 'wh-2', date: iso(2), total_in_bed_hours: 7.7 }];
    navLog = [];
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
  const press = async (key: string) => act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });

  const Probe = () => {
    const location = Router.useLocation();
    const type = Router.useNavigationType();
    const navigate = Router.useNavigate();
    go = (to) => navigate(to as never);
    React.useEffect(() => { navLog.push({ path: location.pathname, search: location.search, type }); }, [location.key, location.pathname, location.search, type]);
    return null;
  };
  const mountApp = async (start: '/weight' | '/sleep') => {
    const Weight = (await import('../../src/pages/Weight')).default;
    const Sleep = (await import('../../src/pages/Sleep')).default;
    const Compare = (await import('../../src/pages/Compare')).default;
    const App = () => {
      const [account, setAcc] = React.useState('userA' as string | null);
      setAccount = setAcc;
      return React.createElement(Ctx.UserContext.Provider, { value: account === null ? { user: null } : { user: { id: account } } },
        React.createElement(TooltipProvider, null,
          React.createElement(Router.MemoryRouter, { initialEntries: [start] },
            React.createElement(Probe),
            React.createElement(Router.Routes, null,
              React.createElement(Router.Route, { path: '/weight', element: React.createElement(Weight) }),
              React.createElement(Router.Route, { path: '/sleep', element: React.createElement(Sleep) }),
              React.createElement(Router.Route, { path: '/compare', element: React.createElement(Compare) }),
            ))));
    };
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(App)));
    await settle(10);
    return host;
  };

  const viewer = () => q('[data-chart-viewer]');
  const openViewer = async (title: string) => { await clickEl(q(`button[aria-label="Open ${title} in full screen"]`)); await settle(10); assert.ok(viewer(), 'the viewer opened'); };
  const hitIn = (scope: ParentNode, date: string) => q(`g[data-chart-point="${date}"] circle[fill="transparent"]`, scope);
  const setBtn = (slot: 'a' | 'b', scope: ParentNode | null = viewer()) => q(`[data-compare-set="${slot}"]`, scope ?? doc());
  // The pick's words without the decorative letter badge (screen readers get "A: ..." as text, sighted people the badge).
  const pickText = (slot: 'a' | 'b', scope: ParentNode | null = viewer()) => {
    const el = q(`[data-compare-pick="${slot}"]`, scope ?? doc());
    if (!el) return '';
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-compare-badge]').forEach((b) => b.remove());
    return text(copy);
  };
  const status = (scope: ParentNode | null = viewer()) => text(q('[data-compare-status]', scope ?? doc()));
  const diffText = (scope: ParentNode | null = viewer()) => text(q('[data-compare-difference]', scope ?? doc()));
  const reason = () => q('[data-chart-compare-reason]', viewer()!);
  const openCompare = (scope: ParentNode | null = viewer()) => q('[data-chart-open-compare]', scope ?? doc()) as HTMLAnchorElement | null;
  const rangePick = async (group: string, label: string) => clickEl(q(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`, viewer()!));
  const viewTab = async (label: 'Chart' | 'Table') => clickEl(all('[role="radio"]', viewer()!).find((r) => r.getAttribute('aria-label') === label || text(r) === label));
  const tableRow = (date: string) => q(`tr[data-row-id="${date}"]`, viewer()!);
  /** Select a day in the viewer's chart and set it as A or B. */
  const choose = async (date: string, slot: 'a' | 'b') => { await clickEl(hitIn(viewer()!, date)); await clickEl(setBtn(slot)); };

  describe('where the controls live', () => {
    test('the card never offers Set as A / B (it only summarises picks); the viewer does, for the selected exact record', async () => {
      const host = await mountApp('/weight');
      await clickEl(hitIn(host, iso(10)));
      assert.ok(q('[data-chart-day-readout]', host), 'the card readout still works');
      assert.equal(all('[data-compare-set]').length, 0, 'no A / B controls on the card');
      assert.equal(q('[data-chart-compare-strip]', host), null, 'and no empty strip');
      await openViewer('Weight Trend');
      assert.equal(all('[data-compare-set]', viewer()!).length, 2);
      assert.equal(text(setBtn('a')), 'Set as A');
      assert.equal(text(setBtn('b')), 'Set as B');
      assert.match(text(q('[data-chart-compare-candidate]', viewer()!)), new RegExp(`Selected weight entry: ${short(iso(10))} · 81\\.5 kg`));
    });

    test('nothing selected and nothing picked: no compare section at all (no clutter), but its live region exists and is polite', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      assert.equal(q('[data-chart-compare]', viewer()!), null);
      const live = q('[data-compare-status]', viewer()!)!;
      assert.equal(live.getAttribute('role'), 'status');
      assert.equal(live.getAttribute('aria-live'), 'polite');
      assert.equal(text(live), '');
    });

    test('the buttons are native, labelled with the visible words first, and expose their state with aria-pressed', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await clickEl(hitIn(viewer()!, iso(10)));
      const a = setBtn('a')!;
      assert.equal(a.tagName, 'BUTTON');
      assert.equal(a.getAttribute('type'), 'button');
      assert.match(a.getAttribute('aria-label')!, new RegExp(`^Set as A: weight entry on ${short(iso(10))}, 81\\.5 kg$`));
      assert.equal(a.getAttribute('aria-pressed'), 'false');
      await clickEl(a);
      assert.equal(setBtn('a')!.getAttribute('aria-pressed'), 'true');
      assert.equal(setBtn('b')!.getAttribute('aria-pressed'), 'false');
      assert.ok(setBtn('a')!.className.includes('[@media(pointer:coarse)]:min-h-11'), 'touch-safe (44px)');
    });
  });

  describe('ordered picks', () => {
    test('A then B: both are marked in words, shown with their raw values, and B minus A is neutral', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      assert.match(status(), new RegExp(`^A set to ${short(iso(10))}, 81\\.5 kg\\.$`), 'announced politely');
      assert.equal(diffText(), '', 'no difference with one pick');
      assert.match(text(q('[data-chart-compare]', viewer()!)), /Select another entry and set it as B to compare\./);
      await choose(iso(0), 'b');
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 81.5 kg`);
      assert.equal(pickText('b'), `B: ${short(iso(0))} · 80 kg`);
      assert.equal(diffText(), 'B \u2212 A: \u22121.5 kg (lower) · B is 10 days after A · \u22121.05 kg per week');
      assert.doesNotMatch(diffText(), /good|bad|better|worse|improv/i);
    });

    test('the plot marks A and B with letters (not colour) next to the selected-day guide', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      const labels = all('.recharts-reference-line text', viewer()!).map((t) => text(t));
      assert.ok(labels.includes('A') && labels.includes('B'), `guide labels: ${labels.join(',')}`);
      assert.equal(all('.recharts-reference-line line[stroke-dasharray="10 4"]', viewer()!).length, 2);
    });

    test('a third pick replaces only the slot asked for; it never moves the other one', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await choose(iso(35), 'a');
      assert.match(status(), new RegExp(`^A replaced: it was ${short(iso(10))}, 81\\.5 kg, now ${short(iso(35))}, 82 kg\\.$`));
      assert.equal(pickText('a'), `A: ${short(iso(35))} · 82 kg`);
      assert.equal(pickText('b'), `B: ${short(iso(0))} · 80 kg`, 'B did not move');
      await choose(iso(70), 'b');
      assert.equal(pickText('a'), `A: ${short(iso(35))} · 82 kg`);
      assert.equal(pickText('b'), `B: ${short(iso(70))} · 82.4 kg`);
    });

    test('pressing the pressed button again clears just that slot; the other record can not be put in both slots', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await clickEl(setBtn('b'));
      assert.match(status(), /^That entry is already A\. Compare needs two different entries/);
      assert.match(pickText('b'), /not set/, 'B stays empty');
      assert.equal(openCompare(), null);
      await clickEl(setBtn('a'));
      assert.equal(status(), 'A cleared.');
      assert.equal(q('[data-compare-pick]', viewer()!), null, 'with nothing picked the picks list is gone');
    });

    test('Swap exchanges A and B and the readout follows; Clear A and B empties both', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await clickEl(q('[data-compare-swap]', viewer()!));
      assert.equal(pickText('a'), `A: ${short(iso(0))} · 80 kg`);
      assert.equal(pickText('b'), `B: ${short(iso(10))} · 81.5 kg`);
      assert.match(status(), new RegExp(`^Swapped\\. A is now ${short(iso(0))}, B is now ${short(iso(10))}\\.$`));
      assert.match(diffText(), /^B \u2212 A: \+1\.5 kg \(higher\) · B is 10 days before A$/);
      assert.ok(!/per week/.test(diffText()), 'no weekly rate when B is the earlier entry');
      await clickEl(q('[data-compare-clear]', viewer()!));
      assert.equal(doc().activeElement, q('[data-chart-compare-root]', viewer()!), 'the removed button does not drop focus onto the page behind');
      assert.equal(status(), 'Compare picks cleared.');
      await clickEl(q('[data-compare-dismiss]', viewer()!));
      assert.equal(status(), '');
      assert.equal(doc().activeElement, q('[data-chart-compare-root]', viewer()!), 'nor does Dismiss');
      assert.equal(q('[data-compare-pick]', viewer()!), null);
      assert.equal(openCompare(), null);
    });

    test('two different entries with the same value: "no change", still ordered, still a link', async () => {
      data.weight = [{ id: 'w-a', date: iso(5), weight: 80.5 }, { id: 'w-b', date: iso(1), weight: 80.5 }];
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(5), 'a');
      await choose(iso(1), 'b');
      assert.match(diffText(), /^B \u2212 A: 0 kg \(no change\) · B is 4 days after A/);
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-a&b=w-b');
    });
  });

  describe('exact record identity', () => {
    test('a day with two weigh-ins picks the plotted record by its id (w-3a), never "the day" and never the sibling', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(3), 'a');
      await choose(iso(0), 'b');
      assert.equal(pickText('a'), `A: ${short(iso(3))} · 80.9 kg`, 'w-3a (80.9), not w-3b (81.2)');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-3a&b=w-0');
      assert.doesNotMatch(openCompare()!.getAttribute('href')!, /w-3b/);
    });

    test('the link keeps the order the person set, even when B is older than A', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(0), 'a');
      await choose(iso(130), 'b');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-0&b=w-130');
    });

    test('Show on chart from a history row selects that exact record; the viewer then offers it as A or B', async () => {
      const host = await mountApp('/weight');
      const row = q('li[data-history-row="w-10"]', host)!;
      await clickEl(q(':scope > div > button[aria-expanded]', row));
      await clickEl(all('button', row).find((b) => /^Show on chart:/.test(b.getAttribute('aria-label') ?? '')));
      await settle(10);
      await openViewer('Weight Trend');
      assert.match(text(q('[data-chart-compare-candidate]', viewer()!)), new RegExp(`${short(iso(10))} · 81\\.5 kg`));
      await clickEl(setBtn('a'));
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 81.5 kg`);
    });
  });

  describe('survives view changes, and follows the visible range', () => {
    test('Chart / Table, Line / Bar and a wider range keep both picks; the Table marks A and B in words and letters', async () => {
      env.window.localStorage.setItem('fittrack_chart_weight_range', '30');
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await viewTab('Table');
      assert.equal(tableRow(iso(10))!.getAttribute('data-compare-mark'), 'a');
      assert.equal(tableRow(iso(0))!.getAttribute('data-compare-mark'), 'b');
      assert.equal(q('[data-compare-badge="a"]', tableRow(iso(10))!)!.textContent, 'A');
      assert.match(text(tableRow(iso(10))), /Compare A, /);
      assert.equal(tableRow(iso(3))!.getAttribute('data-compare-mark'), null);
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 81.5 kg`, 'the panel is still there in Table mode');
      await viewTab('Chart');
      await rangePick('Weight Trend chart type', 'Bar chart');
      assert.equal(pickText('b'), `B: ${short(iso(0))} · 80 kg`);
      await rangePick('Weight Trend range', 'Last 90 days');
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 81.5 kg`);
      assert.equal(pickText('b'), `B: ${short(iso(0))} · 80 kg`);
      assert.equal(status(), `B set to ${short(iso(0))}, 80 kg.`, 'a view change adds no message of its own');
    });

    test('Table and chart share identity: a Table row is set as A with the same controls', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await viewTab('Table');
      await clickEl(q('button[data-chart-row-select]', tableRow(iso(35))!));
      assert.equal(tableRow(iso(35))!.hasAttribute('data-selected'), true);
      await clickEl(setBtn('a'));
      assert.equal(tableRow(iso(35))!.getAttribute('data-compare-mark'), 'a');
      await viewTab('Chart');
      assert.equal(pickText('a'), `A: ${short(iso(35))} · 82 kg`);
      assert.ok(q('g[data-chart-point][data-selected]', viewer()!), 'and the same day is selected in the plot');
    });

    test('a narrower range hides a pick: it is cleared in the same render and announced; widening does not bring it back', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(130), 'a');
      await choose(iso(10), 'b');
      await rangePick('Weight Trend range', 'Last 30 days');
      assert.match(status(), new RegExp(`^A \\(${short(iso(130))}, 83\\.4 kg\\) is no longer on this chart \\(outside the date range, or the entry was removed\\), so it was cleared\\.$`));
      assert.match(pickText('a'), /not set/);
      assert.equal(pickText('b'), `B: ${short(iso(10))} · 81.5 kg`, 'the visible pick stays');
      assert.equal(openCompare(), null, 'no link with one pick');
      await rangePick('Weight Trend range', 'All time');
      assert.match(pickText('a'), /not set/, 'A stays cleared');
    });

    test('both hidden: one sentence names both and the compare section drops its pick list', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(130), 'a');
      await choose(iso(100), 'b');
      await rangePick('Weight Trend range', 'Last 30 days');
      assert.match(status(), /^A \(.*\) and B \(.*\) are no longer on this chart .* they were cleared\.$/);
      assert.equal(q('[data-compare-pick]', viewer()!), null);
    });

    test('a deleted record is cleared the same way', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      data.weight = data.weight.filter((e) => e.id !== 'w-10');
      await act(async () => { bump(); });
      await settle(10);
      assert.match(status(), /^A \(.*81\.5 kg\) is no longer on this chart/);
      assert.match(pickText('a'), /not set/);
      assert.equal(pickText('b'), `B: ${short(iso(0))} · 80 kg`);
    });

    test('an edited value is shown with its new number (the pick is the record, not a copy)', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      data.weight = data.weight.map((e) => (e.id === 'w-10' ? { ...e, weight: 79.9 } : e));
      await act(async () => { bump(); });
      await settle(10);
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 79.9 kg`);
    });

    test('a different account starts clean: no picks, no marks, no message, no link', async () => {
      const host = await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      assert.ok(openCompare());
      await act(async () => { setAccount('userB'); });
      await settle(10);
      assert.equal(q('[data-compare-pick]'), null, 'no pick anywhere (card strip or viewer)');
      assert.equal(openCompare(null), null);
      assert.equal(status(null), '');
      assert.equal(q('[data-chart-compare-strip]', host), null);
    });
  });

  describe('Sleep: manual records only', () => {
    const barsIn = (scope: ParentNode) => all('.recharts-bar-rectangle', scope);
    /** Presses every bar of the viewer chart and reports, per press, which day is selected and what Compare says about it. */
    const pressAllBars = async () => {
      const seen: { date: string | null; ok: boolean; reasonKind: string | null; candidate: string }[] = [];
      for (const bar of barsIn(viewer()!)) {
        await clickEl(bar);
        seen.push({
          date: q('[data-chart-selection-bar] time', viewer()!)?.getAttribute('datetime') ?? null,
          ok: !!setBtn('a'),
          reasonKind: reason()?.getAttribute('data-chart-compare-reason') ?? null,
          candidate: text(q('[data-chart-compare-candidate]', viewer()!)),
        });
      }
      return seen;
    };

    test('pressing the WHOOP bar of a day that also has a manual night is refused with a reason; it never silently picks the manual record', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      const seen = await pressAllBars();
      const whoopPress = seen.find((s) => s.date === iso(1) && s.reasonKind === 'not-manual-source');
      assert.ok(whoopPress, `a WHOOP press on ${iso(1)} was refused: ${JSON.stringify(seen)}`);
      assert.equal(whoopPress!.ok, false, 'no Set as A / B buttons for it');
      assert.match(text(reason()!), /^WHOOP In Bed can't be compared/);
    });

    test('the manual bar of that same day is eligible and names the manual entry in the readout and the button label', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      const seen = await pressAllBars();
      const manual = seen.find((s) => s.date === iso(1) && s.ok);
      assert.ok(manual, `the manual press on ${iso(1)} offers Set as A: ${JSON.stringify(seen)}`);
      assert.match(manual!.candidate, new RegExp(`Selected manual sleep entry: ${short(iso(1))} · 7\\.5 hrs`));
    });

    test('the refusal text says which series and how to compare that day', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      for (const bar of barsIn(viewer()!)) {
        await clickEl(bar);
        if (reason()?.getAttribute('data-chart-compare-reason') === 'not-manual-source') break;
      }
      assert.match(text(reason()!), /^WHOOP In Bed can't be compared\. Select the Manual Sleep point for this day \(or its Table row\) to compare its manual sleep entry\.$/);
      assert.equal(all('[data-compare-set]', viewer()!).length, 0);
    });

    test('a WHOOP-only day gives a plain reason and no controls', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      const seen = await pressAllBars();
      const whoopOnly = seen.find((s) => s.date === iso(2));
      assert.ok(whoopOnly, 'the WHOOP-only day is selectable (it can still open in Calendar)');
      assert.equal(whoopOnly!.ok, false);
      assert.equal(whoopOnly!.reasonKind, 'not-a-record');
    });

    test('choosing the day in the Table (no series pressed) uses the manual record; the link carries exact sleep ids in order', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      await viewTab('Table');
      await clickEl(q('button[data-chart-row-select]', tableRow(iso(1))!));
      assert.match(text(q('[data-chart-compare-candidate]', viewer()!)), /manual sleep entry/);
      await clickEl(setBtn('a'));
      await clickEl(q('button[data-chart-row-select]', tableRow(iso(4))!));
      await clickEl(setBtn('b'));
      assert.equal(pickText('a'), `A: ${short(iso(1))} · 7.5 hrs`);
      assert.equal(pickText('b'), `B: ${short(iso(4))} · 6.2 hrs`, 'the plotted record of a two-night day (s-4), not s-4x');
      assert.equal(diffText(), 'B \u2212 A: \u22121.3 hrs (lower) · B is 3 days before A');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=sleep&a=s-1&b=s-4');
    });

    test('switching between the two series of the SAME day keeps the day selected and flips Compare between refused and allowed', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      const dayBars = barsIn(viewer()!);
      const outcomes: string[] = [];
      for (const bar of dayBars) {
        await clickEl(bar);
        const date = q('[data-chart-selection-bar] time', viewer()!)?.getAttribute('datetime');
        if (date === iso(1)) outcomes.push(reason() ? 'refused' : setBtn('a') ? 'allowed' : 'none');
      }
      assert.deepEqual([...new Set(outcomes)].sort(), ['allowed', 'refused'], 'both series of that day were selectable, one at a time');
    });

    test('Table: a WHOOP-only row is selectable for its day but offers a reason, not a button', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      await viewTab('Table');
      await clickEl(q('button[data-chart-row-select]', tableRow(iso(2))!));
      assert.equal(reason()!.getAttribute('data-chart-compare-reason'), 'not-a-record');
      assert.equal(all('[data-compare-set]', viewer()!).length, 0);
    });
  });

  describe('no Compare controls where Compare does not apply', () => {
    test('Waist: a record-backed chart with the same viewer has no compare panel, buttons, strip or guides', async () => {
      const { WaistChart } = await import('../../src/components/WaistChart');
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      const link = { valueKey: 'waist', noun: 'waist entry', nounPlural: 'waist entries', onSelectedRecordChange: () => {}, onJump: () => {}, request: null };
      await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement(TooltipProvider, null,
        React.createElement(WaistChart, { data: [{ date: iso(5), waist: 90, recordId: 'x-1', entryCount: 1 }, { date: iso(1), waist: 89, recordId: 'x-2', entryCount: 1 }], recordLink: link })))));
      await settle(10);
      await clickEl(hitIn(host, iso(5)));
      assert.ok(q('[data-chart-day-readout]', host), 'selection itself still works');
      await openViewer('Waist Trend');
      assert.ok(q('[data-chart-selection-bar]', viewer()!), 'the day bar is there');
      assert.equal(q('[data-chart-compare-root]', viewer()!), null);
      assert.equal(all('[data-compare-set], [data-chart-open-compare]').length, 0);
    });

    test('the plain Dashboard chart (TrendChart, no exact records) compares two days in the viewer but never offers Open in Compare', async () => {
      const { WeightChart } = await import('../../src/components/WeightChart');
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement(TooltipProvider, null,
        React.createElement(WeightChart, { data: [{ date: iso(5), weight: 81 }, { date: iso(1), weight: 80 }] })))));
      await settle(10);
      await clickEl(hitIn(host, iso(5)));
      await openViewer('Weight Trend');
      assert.ok(q('[data-chart-compare]', viewer()!), 'the in-viewer comparison is there');
      await clickEl(q('[data-compare-set="a"]', viewer()!));
      await clickEl(hitIn(viewer()!, iso(1)));
      await clickEl(q('[data-compare-set="b"]', viewer()!));
      assert.match(text(q('[data-compare-difference]', viewer()!)), /B \u2212 A: \u22121 kg \(lower\)/);
      assert.equal(all('[data-chart-open-compare]').length, 0, 'no record ids, so nothing to open');
      assert.equal(q('[data-compare-link-note]', viewer()!), null, 'a chart that can never open Compare does not apologise for it');
    });
  });

  describe('Open in Compare', () => {
    test('appears only with two picks, pushes history, Compare hydrates A then B, and Back returns to the page', async () => {
      await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      assert.equal(openCompare(), null, 'one pick is not enough');
      await choose(iso(0), 'b');
      const link = openCompare()!;
      assert.equal(link.getAttribute('href'), '/compare?category=weight&a=w-10&b=w-0');
      assert.match(link.getAttribute('aria-label')!, /^Open in Compare/);
      assert.equal(text(link), 'Open in Compare');
      await clickEl(link);
      await settle(30);
      assert.equal(navLog[navLog.length - 1].path, '/compare');
      assert.equal(navLog[navLog.length - 1].type, 'PUSH', 'a new history entry, so Back works');
      assert.equal(navLog[navLog.length - 1].search, '?category=weight&a=w-10&b=w-0', 'address untouched by Compare');
      const body = text(doc().body);
      assert.match(body, /Opened from a link\. 2 of 2 records selected: A is 81\.5 kg on .*, B is 80 kg on /);
      assert.match(body, /B is 1\.5 kg lower than A, 10 days later\./);
      await act(async () => { go(-1); });
      await settle(30);
      assert.equal(navLog[navLog.length - 1].path, '/weight');
      assert.ok(q('[data-record-trend-chart="weight"]'), 'the Weight page is back');
      assert.equal(viewer(), null, 'the viewer is closed after Back');
    });

    test('manual Sleep opens the Sleep category with exact ids in order', async () => {
      await mountApp('/sleep');
      await openViewer('Sleep');
      await viewTab('Table');
      for (const [date, slot] of [[iso(9), 'a'], [iso(1), 'b']] as const) {
        await clickEl(q('button[data-chart-row-select]', tableRow(date)!));
        await clickEl(setBtn(slot));
      }
      await clickEl(openCompare());
      await settle(30);
      assert.equal(navLog[navLog.length - 1].search, '?category=sleep&a=s-9&b=s-1');
      assert.match(text(doc().body), /B is 0\.5 hours lower than A, 8 days later\./);
    });
  });

  describe('card summary after the viewer closes', () => {
    test('picks stay visible on the card (letters + words), with Open in Compare and Clear; Escape returns focus to the expand button', async () => {
      const host = await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await press('Escape');
      await settle(10);
      assert.equal(viewer(), null);
      assert.equal(doc().activeElement, q('button[aria-label="Open Weight Trend in full screen"]'), 'focus returns where it started');
      const strip = q('[data-chart-compare-strip]', host)!;
      assert.ok(strip, 'a pick never becomes invisible state');
      assert.equal(pickText('a', strip), `A: ${short(iso(10))} · 81.5 kg`);
      assert.equal(pickText('b', strip), `B: ${short(iso(0))} · 80 kg`);
      assert.match(diffText(strip), /^B \u2212 A: \u22121\.5 kg \(lower\)/);
      assert.equal(openCompare(strip)!.getAttribute('href'), '/compare?category=weight&a=w-10&b=w-0');
      assert.equal(all('[data-compare-set]', host).length, 0, 'the card still has no Set controls');
      await clickEl(q('[data-compare-clear]', strip));
      assert.equal(doc().activeElement, q('[data-chart-compare-strip-root]', host), 'focus stays on the card, not on the page behind');
      assert.equal(q('[data-chart-compare-strip]', host), null);
      assert.equal(status(host), 'Compare picks cleared.');
    });

    test('with one pick the card says where to set the other', async () => {
      const host = await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await press('Escape');
      await settle(10);
      assert.match(text(q('[data-chart-compare-strip]', host)), /Open this chart in full screen to set B\./);
      assert.equal(openCompare(host), null);
    });

    test('narrowing the range on the card clears a hidden pick and says so on the card', async () => {
      const host = await mountApp('/weight');
      await openViewer('Weight Trend');
      await choose(iso(130), 'a');
      await press('Escape');
      await settle(10);
      assert.ok(q('[data-chart-compare-strip]', host));
      await clickEl(q('[aria-label="Weight Trend range"] [role="radio"][aria-label="Last 30 days"]', host));
      assert.equal(q('[data-chart-compare-strip]', host), null);
      assert.match(status(host), /A \(.*\) is no longer on this chart/);
    });
  });
});
