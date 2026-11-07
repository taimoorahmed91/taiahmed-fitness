import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// The real Dashboard (real shared-table hooks on a scripted backend, real charts) with A / B comparison in EVERY chart viewer.
// Weight Trend: exact record identity (same-day duplicates), the card having no Set controls, Set A / B and the ordered link, the real Compare
// page hydrating it and Back, Table / line / bar identity, a narrower range clearing a hidden pick, an account switch.
// Sleep: manual and WHOOP series (B - A where observed), WHOOP-only days, Open in Compare only for two manual entries.
// Every other graph: B - A in the viewer only (never a link), per series for the multi-series charts, blank / unobserved values not pickable,
// time of day compared by category with no dates, hidden picks cleared by a narrower range.
// ResponsiveContainer is replaced by a fixed-size one so Recharts draws SVG in jsdom; reduced motion is on.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/dashboardCompare.dom.tsx
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

type Answer = { data?: unknown; error?: unknown };
const behaviour: Record<string, () => Answer> = {};
const makeChain = (table: string): unknown => {
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const answer = (behaviour[table] ?? (() => ({ data: [] })))();
        return (resolve: (v: unknown) => unknown) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
      }
      return () => chain;
    },
  });
  return chain;
};
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => makeChain(table), auth: {} } }));
mock.module('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'user-a', email: 'a@example.com' }, loading: false }) }));
mock.module('@/lib/authSession', () => ({ getSessionUser: async () => ({ id: 'user-a' }), onAuthIdentityChange: () => ({ unsubscribe() {} }) }));
mock.module('@/hooks/useActivityLog', () => ({ logActivity: () => {} }));
mock.module('@/hooks/useDailySummary', () => ({ useDailySummary: () => ({ refetch: async () => {} }) }));
const personal = {
  target_weight_kg: null, protein_multiplier: 1.6, protein_multiplier_max: 2, carb_multiplier: 3, carb_multiplier_max: 4,
  workout_days: [0, 1, 2, 3, 4, 5, 6], workout_day_templates: {}, gym_day_calorie_target: 2500, gym_day_calorie_target_max: 2800,
  rest_day_calorie_target: 2000, rest_day_calorie_target_max: 2200,
};
mock.module('@/hooks/usePersonalData', () => ({ usePersonalData: () => ({ data: personal, loading: false, error: null, refetch: async () => {} }) }));
mock.module('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({ settings: { daily_calorie_goal: 2000, weight_measurement_interval: 3, waist_measurement_interval: 7 }, loading: false, error: null, updateWeightInterval: async () => {}, updateWaistInterval: async () => {}, refetch: async () => {} }),
}));
// Cards that are not charts are stand-ins; every CHART is real.
const stub = (name: string, testid: string) => { mock.module(`@/components/${name}`, () => ({ [name]: () => <div data-testid={testid}>{testid}</div> })); };
for (const [name, id] of [['CalorieGoalProgress', 'calorie-goal'], ['ProteinTargetCard', 'protein-target'], ['CarbTargetCard', 'carb-target'], ['PreviousDaySnapshot', 'yesterday'], ['GoalsCard', 'goals-card'], ['CrossMetricSummaryCard', 'insights-card'], ['WeightIntervalSetting', 'interval-setting'], ['BodyRecompositionCard', 'recomp'], ['WeeklyDigestCard', 'digest']]) stub(name, id);

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const short = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const TABLES = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'whoop_data', 'extra_activities', 'daily_notes'].map((t) => `fittrack_${t}`);
const rowsOf = (rows: unknown[]) => () => ({ data: rows });
const whoopRow = (id: string, date: string, inBed: number | null, recovery: number | null = null) => ({ id, date, created_at: `${date}T07:00:00Z`, total_in_bed_hours: inBed, recovery_score: recovery });

const loadData = () => {
  for (const t of TABLES) behaviour[t] = rowsOf([]);
  // today-3 has two weigh-ins ('w-3a' is the plotted one: lowest id). Weights come back as strings, like the database.
  behaviour.fittrack_weight = rowsOf([
    { id: 'w-0', date: iso(0), weight: '80.0', notes: null },
    { id: 'w-3b', date: iso(3), weight: '81.2', notes: null },
    { id: 'w-3a', date: iso(3), weight: '80.9', notes: null },
    { id: 'w-10', date: iso(10), weight: '81.5', notes: null },
    { id: 'w-35', date: iso(35), weight: '82.0', notes: null },
    { id: 'w-70', date: iso(70), weight: '82.4', notes: null },
  ]);
  behaviour.fittrack_waist = rowsOf([
    { id: 'x-1', date: iso(2), waist: '90.0', notes: null }, { id: 'x-2', date: iso(9), waist: '91.0', notes: null }, { id: 'x-3', date: iso(16), waist: '92.0', notes: null },
  ]);
  behaviour.fittrack_sleep = rowsOf([
    { id: 's-1', date: iso(1), hours: '7.5', notes: null },
    { id: 's-4', date: iso(4), hours: '6.2', notes: null },
    { id: 's-4x', date: iso(4), hours: '5.1', notes: null },
    { id: 's-9', date: iso(9), hours: '8.0', notes: null },
  ]);
  // iso(1): WHOOP and manual. iso(2): WHOOP only.
  // kilojoule gives Calorie Balance its burn: the cycle dated D + 1 is the burn of day D (iso(0) -> iso(1), iso(2) -> iso(3)).
  behaviour.fittrack_whoop_data = rowsOf([
    { ...whoopRow('wh-0', iso(0), null, null), kilojoule: 8368 },
    whoopRow('wh-1', iso(1), 8.1, 70),
    { ...whoopRow('wh-2', iso(2), 7.7, 60), kilojoule: 10460 },
    whoopRow('wh-3', iso(5), 7, 80),
  ]);
  // iso(4) has a meal with no protein: its protein is NOT observed (blank, not 0). Time of day: Morning x2, Midday x1, Evening x1, others none.
  behaviour.fittrack_meals = rowsOf([
    { id: 'm1', food: 'Oats', calories: 300, protein: 10, carbs: 40, time: '08:00', date: iso(0) },
    { id: 'm2', food: 'Rice', calories: 500, protein: 20, carbs: 80, time: '12:00', date: iso(1) },
    { id: 'm3', food: 'Eggs', calories: 400, protein: 30, carbs: 5, time: '09:00', date: iso(2) },
    { id: 'm4', food: 'Pasta', calories: 800, protein: 25, carbs: 110, time: '19:00', date: iso(3) },
    { id: 'm5', food: 'Jam', calories: 200, protein: null, carbs: 50, time: '09:30', date: iso(4) },
    { id: 'm6', food: 'Snack', calories: 150, protein: 5, carbs: 10, time: '23:00', date: iso(20) },
  ]);
  // Workout Duration: two logged days; every other day of the window is filled with 0 minutes by the Dashboard.
  behaviour.fittrack_gym_sessions = rowsOf([
    { id: 'g1', exercise: 'Push', duration: 60, date: iso(2), notes: null, start_time: null, created_at: `${iso(2)}T10:00:00Z` },
    { id: 'g2', exercise: 'Pull', duration: 45, date: iso(6), notes: null, start_time: null, created_at: `${iso(6)}T10:00:00Z` },
  ]);
};

describe('mounted: Dashboard A / B Compare (Weight Trend and Sleep)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any, QueryClient: any, QueryClientProvider: any, TooltipProvider: any, Router: any, Ctx: any, GlobalRefreshContext: any, createGlobalRefresh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Dashboard: any, Compare: any, root: any, client: any;
  let navLog: { path: string; search: string; type: string }[] = [];
  let go: (to: number | string) => void = () => {};
  let setAccount: (id: string | null) => void = () => {};
  const consoleError = console.error;

  before(async () => {
    console.error = () => {};
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
    ({ GlobalRefreshContext } = await import('../../src/app/globalRefreshContext'));
    ({ createGlobalRefresh } = await import('../../src/app/globalRefresh'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    Router = await import('react-router-dom');
    Ctx = await import('../../src/contexts/userContextCore');
    act = React.act;
    const mm = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    env.window.matchMedia = mm;
    Object.defineProperty(globalThis, 'matchMedia', { value: mm, configurable: true, writable: true });
    Dashboard = (await import('../../src/pages/Dashboard')).default;
    Compare = (await import('../../src/pages/Compare')).default;
  });
  after(() => { console.error = consoleError; env?.window.close(); });
  beforeEach(() => {
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_weight_range', 'all');
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'line');
    env.window.localStorage.setItem('fittrack_chart_sleep_range', '90');
    env.window.localStorage.setItem('fittrack_chart_sleep_style', 'bar');
    // Every other chart shows its widest window, so each seeded day is on screen.
    for (const key of ['waist', 'recovery', 'workout_duration', 'calorie_balance', 'macro_Calories: Actual vs Target', 'macro_Protein: Actual vs Target', 'macro_Carbs: Actual vs Target', 'meal_time']) env.window.localStorage.setItem(`fittrack_chart_${key}_range`, '90');
    loadData();
    navLog = [];
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    client?.clear();
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const q = (sel: string, scope: ParentNode = doc()) => scope.querySelector<HTMLElement>(sel);
  const all = (sel: string, scope: ParentNode = doc()) => [...scope.querySelectorAll<HTMLElement>(sel)];
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (ms = 20) => act(async () => { await sleep(ms); });
  const clickEl = async (el: Element | null | undefined) => { assert.ok(el, 'element to click exists'); await act(async () => click(env.window, el!)); await settle(5); };

  const Probe = () => {
    const location = Router.useLocation();
    const type = Router.useNavigationType();
    const navigate = Router.useNavigate();
    go = (to) => navigate(to as never);
    React.useEffect(() => { navLog.push({ path: location.pathname, search: location.search, type }); }, [location.key, location.pathname, location.search, type]);
    return null;
  };
  const mount = async () => {
    client = new QueryClient();
    const globalRefresh = createGlobalRefresh(() => client);
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    root = createRoot(host);
    const App = () => {
      const [account, setAcc] = React.useState('user-a' as string | null);
      setAccount = setAcc;
      return React.createElement(QueryClientProvider, { client },
        React.createElement(GlobalRefreshContext.Provider, { value: globalRefresh },
          React.createElement(Ctx.UserContext.Provider, { value: account === null ? { user: null } : { user: { id: account } } },
            React.createElement(TooltipProvider, null,
              React.createElement(Router.MemoryRouter, { initialEntries: ['/dashboard'] },
                React.createElement(Probe),
                React.createElement(Router.Routes, null,
                  React.createElement(Router.Route, { path: '/dashboard', element: React.createElement(Dashboard) }),
                  React.createElement(Router.Route, { path: '/compare', element: React.createElement(Compare) }),
                ))))));
    };
    await act(async () => root.render(React.createElement(App)));
    await settle(300);
    return host;
  };

  const viewer = () => q('[data-chart-viewer]');
  const expandButton = (title: string) => q(`button[aria-label="Open ${title} in full screen"]`);
  const openViewer = async (title: string) => { await clickEl(expandButton(title)); await settle(10); assert.ok(viewer(), 'the viewer opened'); };
  const hitIn = (scope: ParentNode, date: string) => q(`g[data-chart-point="${date}"] circle[fill="transparent"]`, scope);
  const setBtn = (slot: 'a' | 'b', scope: ParentNode | null = viewer()) => q(`[data-compare-set="${slot}"]`, scope ?? doc());
  const pickText = (slot: 'a' | 'b', scope: ParentNode | null = viewer()) => {
    const el = q(`[data-compare-pick="${slot}"]`, scope ?? doc());
    if (!el) return '';
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-compare-badge]').forEach((b) => b.remove());
    return text(copy);
  };
  const status = (scope: ParentNode | null = viewer()) => text(q('[data-compare-status]', scope ?? doc()));
  const reason = () => q('[data-chart-compare-reason]', viewer()!);
  const openCompare = (scope: ParentNode | null = viewer()) => q('[data-chart-open-compare]', scope ?? doc()) as HTMLAnchorElement | null;
  const rangePick = async (group: string, label: string) => clickEl(q(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`, viewer()!));
  const viewTab = async (label: 'Chart' | 'Table') => clickEl(all('[role="radio"]', viewer()!).find((r) => r.getAttribute('aria-label') === label || text(r) === label));
  const tableRow = (date: string) => q(`tr[data-row-id="${date}"]`, viewer()!);
  const choose = async (date: string, slot: 'a' | 'b') => { await clickEl(hitIn(viewer()!, date)); await clickEl(setBtn(slot)); };

  describe('Weight Trend', () => {
    test('the card has no Set controls (a Dashboard card stays a day drill-down); the viewer offers the exact weigh-in', async () => {
      await mount();
            assert.ok(expandButton('Weight Trend'), 'the Dashboard weight chart is there');
      await clickEl(hitIn(doc(), iso(10)));
      assert.ok(q('[data-chart-day-readout]'), 'the card still selects a day');
      assert.equal(all('[data-compare-set]').length, 0);
      assert.equal(q('[data-chart-compare-strip]'), null);
      await openViewer('Weight Trend');
      assert.equal(text(setBtn('a')), 'Set as A');
      assert.equal(text(setBtn('b')), 'Set as B');
      assert.match(text(q('[data-chart-compare-candidate]', viewer()!)), new RegExp(`Selected weight entry: ${short(iso(10))} · 81\\.5 kg`));
    });

    test('a day with two weigh-ins offers the plotted record by id (w-3a), exactly as the Weight page does', async () => {
      await mount();
      await openViewer('Weight Trend');
      assert.equal(all('g[data-chart-point]', viewer()!).filter((g) => g.getAttribute('data-chart-point') === iso(3)).length, 1, 'one point for the day');
      await choose(iso(3), 'a');
      await choose(iso(0), 'b');
      assert.equal(pickText('a'), `A: ${short(iso(3))} · 80.9 kg`, 'w-3a (80.9), not w-3b (81.2)');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-3a&b=w-0');
      assert.match(text(q('[data-chart-reading]', viewer()!) ?? q('figure', viewer()!)), /1 day has more than one entry \(one is plotted\)/);
    });

    test('set A then B, B older than A stays B; third pick replaces only its slot; Swap and Clear work', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(0), 'a');
      await choose(iso(35), 'b');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-0&b=w-35');
      await choose(iso(10), 'a');
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 81.5 kg`);
      assert.equal(pickText('b'), `B: ${short(iso(35))} · 82 kg`);
      await clickEl(q('[data-compare-swap]', viewer()!));
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-35&b=w-10');
      await clickEl(q('[data-compare-clear]', viewer()!));
      assert.equal(openCompare(), null);
    });

    test('Open in Compare pushes history, the real Compare page hydrates A then B, and Back returns to the Dashboard', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await clickEl(openCompare());
      await settle(60);
      const last = navLog[navLog.length - 1];
      assert.equal(last.path, '/compare');
      assert.equal(last.type, 'PUSH');
      assert.equal(last.search, '?category=weight&a=w-10&b=w-0');
      assert.match(text(doc().body), /A is 81\.5 kg on .*, B is 80 kg on /);
      assert.match(text(doc().body), /B is 1\.5 kg lower than A, 10 days later\./);
      await act(async () => { go(-1); });
      await settle(60);
      assert.equal(navLog[navLog.length - 1].path, '/dashboard');
      assert.ok(expandButton('Weight Trend'));
      assert.equal(viewer(), null);
    });

    test('line, bar and Table share one identity: picks and marks survive switching', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await rangePick('Weight Trend chart type', 'Bar chart');
      assert.equal(pickText('a'), `A: ${short(iso(10))} · 81.5 kg`);
      assert.ok(all('.recharts-reference-line text', viewer()!).some((t) => text(t) === 'A'), 'A is marked on the bars too');
      await viewTab('Table');
      assert.equal(tableRow(iso(10))!.getAttribute('data-compare-mark'), 'a');
      assert.equal(tableRow(iso(0))!.getAttribute('data-compare-mark'), 'b');
      await clickEl(q('button[data-chart-row-select]', tableRow(iso(35))!));
      await clickEl(setBtn('a'));
      assert.equal(tableRow(iso(35))!.getAttribute('data-compare-mark'), 'a');
      await viewTab('Chart');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=weight&a=w-35&b=w-0');
    });

    test('a narrower range clears a hidden pick with an announcement; widening does not bring it back; the card keeps its own range', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(70), 'a');
      await choose(iso(10), 'b');
      await rangePick('Weight Trend range', 'Last 30 days');
      assert.match(status(), new RegExp(`^A \\(${short(iso(70))}, 82\\.4 kg\\) is no longer on this chart`));
      assert.match(pickText('a'), /not set/);
      assert.equal(pickText('b'), `B: ${short(iso(10))} · 81.5 kg`);
      await rangePick('Weight Trend range', 'All time');
      assert.match(pickText('a'), /not set/);
    });

    test('a different account starts clean: no picks, marks, message or link', async () => {
      const host = await mount();
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      assert.ok(openCompare());
      await act(async () => { setAccount('user-b'); });
      await settle(20);
      assert.equal(q('[data-compare-pick]'), null);
      assert.equal(openCompare(null), null);
      assert.equal(q('[data-chart-compare-strip]', host), null);
    });

    test('closing the viewer leaves a compact summary on the card with Open in Compare (never Set controls)', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      await act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      await settle(10);
      assert.equal(viewer(), null);
      const strip = q('[data-chart-compare-strip]')!;
      assert.ok(strip);
      assert.equal(openCompare(strip)!.getAttribute('href'), '/compare?category=weight&a=w-10&b=w-0');
      assert.equal(all('[data-compare-set]').length, 0);
    });
  });

  const tablePick = async (date: string, slot: 'a' | 'b') => {
    await clickEl(q('button[data-chart-row-select]', tableRow(date)!));
    await clickEl(setBtn(slot));
  };
  const diffText = () => text(q('[data-compare-difference]', viewer()!));
  const deltaRows = () => all('tr[data-compare-delta]', viewer()!);
  // The cells of one B - A row, joined with " | ": label | A | B | B - A.
  const deltaRow = (key: string) => all('th, td', q(`tr[data-compare-delta="${key}"]`, viewer()!)!).map((c) => text(c)).join(' | ');
  const escape = async () => {
    await act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    await settle(10);
  };
  const selectValue = async (slot: 'a' | 'b', value: string) => {
    const el = q(`select[data-compare-select="${slot}"]`, viewer()!) as HTMLSelectElement | null;
    assert.ok(el, `picker ${slot} exists`);
    await act(async () => {
      el!.value = value;
      el!.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    });
    await settle(5);
  };
  const M = '\u2212';

  describe('Weight Trend: B - A in the viewer too', () => {
    test('the Dashboard weight viewer says how far apart the days are and gives the change with neutral words', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      assert.match(diffText(), new RegExp(`B ${M} A: ${M}1\\.5 kg \\(lower\\)`));
      assert.equal(text(q('[data-compare-timing]', viewer()!)), 'B is 10 days after A');
      assert.equal(q('[data-compare-link-note]', viewer()!), null, 'two exact weigh-ins: a link, so no apology');
      assert.ok(openCompare());
    });
  });

  describe('Sleep: manual and WHOOP, Open in Compare only for two manual entries', () => {
    const bars = () => all('.recharts-bar-rectangle', viewer()!);
    const pressAllBars = async () => {
      const seen: { date: string | null; ok: boolean; candidate: string }[] = [];
      for (const bar of bars()) {
        await clickEl(bar);
        seen.push({ date: q('[data-chart-selection-bar] time', viewer()!)?.getAttribute('datetime') ?? null, ok: !!setBtn('a'), candidate: text(q('[data-chart-compare-candidate]', viewer()!)) });
      }
      return seen;
    };

    test('pressing the manual bar OR the WHOOP bar of a day selects that day for A / B (the day is the point; both series travel with it)', async () => {
      await mount();
      await openViewer('Sleep');
      const seen = await pressAllBars();
      const both = seen.filter((s) => s.date === iso(1));
      assert.ok(both.length >= 2, `two series of ${iso(1)} can be pressed: ${JSON.stringify(seen)}`);
      assert.ok(both.every((s) => s.ok), 'each press offers Set as A');
      assert.match(both[0].candidate, new RegExp(`Selected day: ${short(iso(1))} · Manual Sleep 7\\.5 hrs · WHOOP In Bed 8\\.1 hrs`));
      const whoopOnly = seen.find((s) => s.date === iso(2));
      assert.ok(whoopOnly?.ok, 'a WHOOP-only day is pickable for the in-viewer comparison');
      assert.match(whoopOnly!.candidate, /Selected day: .* · WHOOP In Bed 7\.7 hrs/);
      assert.doesNotMatch(whoopOnly!.candidate, /Manual Sleep/, 'a series with no value is left out, not shown as 0');
    });

    test('two days with both series: B - A for manual and for WHOOP where each was observed; two manual entries still open Sleep Compare in order', async () => {
      await mount();
      await openViewer('Sleep');
      await viewTab('Table');
      await tablePick(iso(1), 'a'); // manual 7.5 + WHOOP 8.1
      await tablePick(iso(4), 'b'); // manual 6.2 only
      assert.equal(pickText('a'), `A: ${short(iso(1))}`);
      assert.deepEqual(deltaRows().map((r) => r.getAttribute('data-compare-delta')), ['hours', 'whoopHours']);
      assert.equal(deltaRow('hours'), `Manual Sleep | 7.5 hrs | 6.2 hrs | ${M}1.3 hrs (lower)`);
      assert.equal(deltaRow('whoopHours'), 'WHOOP In Bed | 8.1 hrs | \u2014No B value | No difference: no value on B');
      assert.equal(text(q('[data-compare-timing]', viewer()!)), 'B is 3 days before A');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=sleep&a=s-1&b=s-4', 'both are manual entries: exact ids, A then B');
    });

    test('a WHOOP-only day compares in the viewer but never opens Compare, and says why', async () => {
      await mount();
      await openViewer('Sleep');
      await viewTab('Table');
      await tablePick(iso(1), 'a');
      await tablePick(iso(2), 'b'); // WHOOP only
      assert.equal(deltaRow('whoopHours'), `WHOOP In Bed | 8.1 hrs | 7.7 hrs | ${M}0.4 hrs (lower)`);
      assert.equal(deltaRow('hours'), 'Manual Sleep | 7.5 hrs | \u2014No B value | No difference: no value on B');
      assert.equal(openCompare(), null);
      assert.match(text(q('[data-compare-link-note]', viewer()!)), /Open in Compare needs a saved manual sleep entry on both days\. B has none/);
    });

    test('Table rows use the manual record: lowest id of a two-night day, link opens Sleep Compare', async () => {
      await mount();
      await openViewer('Sleep');
      await viewTab('Table');
      await tablePick(iso(9), 'a');
      await tablePick(iso(4), 'b');
      assert.equal(deltaRow('hours'), `Manual Sleep | 8 hrs | 6.2 hrs | ${M}1.8 hrs (lower)`, 's-4 (6.2), not s-4x (5.1)');
      assert.equal(openCompare()!.getAttribute('href'), '/compare?category=sleep&a=s-9&b=s-4');
      await clickEl(openCompare());
      await settle(60);
      assert.equal(navLog[navLog.length - 1].search, '?category=sleep&a=s-9&b=s-4');
      assert.match(text(doc().body), /B is 1\.8 hours lower than A, 5 days later\./);
    });

    test('a narrower sleep range clears a hidden pick (announced) and keeps the visible one', async () => {
      await mount();
      await openViewer('Sleep');
      await viewTab('Table');
      await tablePick(iso(9), 'a');
      await tablePick(iso(1), 'b');
      await viewTab('Chart');
      await rangePick('Sleep range', 'Last 7 days');
      assert.match(status(), /^A \(.*Manual Sleep 8 hrs\) is no longer on this chart/);
      assert.equal(pickText('b'), `B: ${short(iso(1))}`);
      assert.equal(openCompare(), null);
    });
  });

  describe('every other Dashboard graph compares in the viewer only', () => {
    const cases: { title: string; a: string; b: string }[] = [
      { title: 'Waist Trend', a: iso(16), b: iso(2) },
      { title: 'WHOOP Recovery', a: iso(5), b: iso(1) },
      { title: 'Workout Duration', a: iso(6), b: iso(2) },
      { title: 'Calorie Balance', a: iso(3), b: iso(1) },
      { title: 'Calories: Actual vs Target', a: iso(1), b: iso(3) },
      { title: 'Protein: Actual vs Target', a: iso(0), b: iso(3) },
      { title: 'Carbs: Actual vs Target', a: iso(0), b: iso(3) },
    ];

    test('each viewer lets two days be picked (Table or chart), shows B - A and never a Compare link or link note', async () => {
      await mount();
      for (const c of cases) {
        await openViewer(c.title);
        await viewTab('Table');
        await tablePick(c.a, 'a');
        await tablePick(c.b, 'b');
        assert.ok(q('[data-compare-difference]', viewer()!), `${c.title}: B - A is shown`);
        assert.equal(pickText('a').startsWith('A: '), true, `${c.title}: A is set`);
        assert.equal(all('[data-chart-open-compare], [data-compare-link-note]', viewer()!).length, 0, `${c.title}: no link, no link note`);
        assert.equal(all('a[href^="/compare"]').length, 0, `${c.title}: no Compare link anywhere`);
        await escape();
        assert.equal(viewer(), null);
      }
    });

    test('Waist: a single series reads as one sentence with the days apart', async () => {
      await mount();
      await openViewer('Waist Trend');
      await viewTab('Table');
      await tablePick(iso(16), 'a');
      await tablePick(iso(2), 'b');
      assert.match(diffText(), new RegExp(`B ${M} A: ${M}2 cm \\(lower\\)`));
      assert.equal(text(q('[data-compare-timing]', viewer()!)), 'B is 14 days after A');
      assert.equal(deltaRows().length, 0, 'no table for one series');
    });

    test('Recovery: percentages, B earlier than A reads "before" and the sign follows B - A', async () => {
      await mount();
      await openViewer('WHOOP Recovery');
      await viewTab('Table');
      await tablePick(iso(1), 'a');
      await tablePick(iso(5), 'b');
      assert.match(diffText(), new RegExp(`B ${M} A: \\+10% \\(higher\\)`));
      assert.equal(text(q('[data-compare-timing]', viewer()!)), 'B is 4 days before A');
    });

    test('Workout Duration: a day with no workout (the Dashboard fills it with 0 minutes) is NOT a point: it gets a reason, never a zero', async () => {
      await mount();
      await openViewer('Workout Duration');
      await viewTab('Table');
      await clickEl(q('button[data-chart-row-select]', tableRow(iso(3))!));
      assert.match(text(reason()), /Nothing was recorded on this day, so it can't be compared\./);
      assert.equal(all('[data-compare-set]', viewer()!).length, 0);
      await tablePick(iso(6), 'a');
      await tablePick(iso(2), 'b');
      assert.match(diffText(), new RegExp(`B ${M} A: \\+15 \\S+ \\(higher\\)`));
      assert.equal(all('[data-compare-select]', viewer()!).length, 0);
    });

    test('Calorie Balance: every series of the day, B - A each, in the chart\'s own order', async () => {
      await mount();
      await openViewer('Calorie Balance');
      await viewTab('Table');
      await tablePick(iso(3), 'a');
      await tablePick(iso(1), 'b');
      assert.deepEqual(deltaRows().map((r) => r.getAttribute('data-compare-delta')), ['consumed', 'burned', 'balance']);
      assert.equal(deltaRow('consumed'), `Meals Consumed | 800 cal | 500 cal | ${M}300 cal (lower)`);
      assert.equal(deltaRow('burned'), `WHOOP Burned | 2,500 cal | 2,000 cal | ${M}500 cal (lower)`);
      assert.equal(deltaRow('balance'), `Balance (deficit +) | 1,700 cal | 1,500 cal | ${M}200 cal (lower)`);
      assert.equal(text(q('[data-compare-timing]', viewer()!)), 'B is 2 days after A');
    });

    test('Calories: Actual vs Target: actual, min and max compared; a day with no meals is not a point; B - A order is the order set', async () => {
      await mount();
      await openViewer('Calories: Actual vs Target');
      await viewTab('Table');
      assert.equal(q('button[data-chart-row-select]', tableRow(iso(5))!), null, 'no meals that day: blank, not 0, not selectable');
      await tablePick(iso(1), 'a');
      await tablePick(iso(3), 'b');
      assert.deepEqual(deltaRows().map((r) => r.getAttribute('data-compare-delta')), ['actual', 'min', 'max']);
      assert.equal(deltaRow('actual'), 'Actual | 500 cal | 800 cal | +300 cal (higher)');
      assert.match(deltaRow('min'), /Min target/);
      assert.match(deltaRow('max'), /Max target/);
      await clickEl(q('[data-compare-swap]', viewer()!));
      assert.equal(deltaRow('actual'), `Actual | 800 cal | 500 cal | ${M}300 cal (lower)`);
    });

    test('Protein: a day with meals that lack protein is unobserved: not selectable, while the same day is selectable for Calories', async () => {
      await mount();
      await openViewer('Protein: Actual vs Target');
      await viewTab('Table');
      assert.equal(q('button[data-chart-row-select]', tableRow(iso(4))!), null, 'partly logged protein is not a value');
      assert.ok(q('button[data-chart-row-select]', tableRow(iso(3))!));
      await escape();
      await openViewer('Calories: Actual vs Target');
      await viewTab('Table');
      assert.ok(q('button[data-chart-row-select]', tableRow(iso(4))!));
    });

    test('picks made on the chart survive Table, line / bar, and are cleared when the day leaves a narrower range', async () => {
      await mount();
      await openViewer('Waist Trend');
      await viewTab('Table');
      await tablePick(iso(16), 'a');
      await tablePick(iso(2), 'b');
      await viewTab('Chart');
      await rangePick('Waist Trend chart type', 'Bar chart');
      assert.match(pickText('a'), /^A: /);
      assert.ok(all('.recharts-reference-line text', viewer()!).some((t) => text(t) === 'A'), 'A is marked on the plot');
      await rangePick('Waist Trend range', 'Last 14 days');
      assert.match(status(), /^A \(.*\) is no longer on this chart \(outside the date range/);
      assert.match(pickText('a'), /not set/);
      assert.match(pickText('b'), /^B: /);
      await rangePick('Waist Trend range', 'Last 90 days');
      assert.match(pickText('a'), /not set/, 'widening does not bring it back');
    });
  });

  describe('Waist: one deterministic measurement per UTC date, in the viewer only', () => {
    test('same-day measurements arriving in reverse order plot the lowest id once, the caption says so, and the comparison never links', async () => {
      // 'x-0' sorts before 'x-1': it is the plotted record of iso(2), whatever order the rows come in.
      behaviour.fittrack_waist = rowsOf([
        { id: 'x-1', date: iso(2), waist: '90.0', notes: null }, { id: 'x-3', date: iso(16), waist: '92.0', notes: null },
        { id: 'x-2', date: iso(9), waist: '91.0', notes: null }, { id: 'x-0', date: iso(2), waist: '89.5', notes: null },
      ].reverse());
      await mount();
      await openViewer('Waist Trend');
      assert.equal(all('g[data-chart-point]', viewer()!).filter((g) => g.getAttribute('data-chart-point') === iso(2)).length, 1, 'one point for the day');
      assert.match(text(q('figure', viewer()!)), /1 day has more than one entry \(one is plotted\)/);
      await viewTab('Table');
      assert.equal(all(`tr[data-row-id="${iso(2)}"]`, viewer()!).length, 1);
      await tablePick(iso(16), 'a');
      await tablePick(iso(2), 'b');
      assert.match(diffText(), new RegExp(`B ${M} A: ${M}2\\.5 cm \\(lower\\)`), 'x-0 (89.5), not x-1 (90)');
      assert.equal(all('[data-chart-open-compare], [data-compare-link-note], a[href^="/compare"]').length, 0);
    });
  });

  describe('narrowing the range keeps the reset message even when almost nothing is left to compare', () => {
    test('Weight: the dropped A takes the link with it, and the message stays visible and announced', async () => {
      await mount();
      await openViewer('Weight Trend');
      await choose(iso(10), 'a');
      await choose(iso(0), 'b');
      assert.ok(openCompare());
      await rangePick('Weight Trend range', 'Last 7 days');
      assert.equal(openCompare(), null, 'no link with one pick left');
      assert.match(status(), new RegExp(`^A \\(${short(iso(10))}, 81\\.5 kg\\) is no longer on this chart`));
      assert.equal(all('[data-compare-notice-row]', viewer()!).length, 1);
      assert.match(text(q('[data-compare-notice-row]', viewer()!)), /no longer on this chart/, 'visible, not just announced');
    });
  });

  describe('Calories by Time of Day: categories, never dates', () => {
    const section = () => q('[data-chart-compare]', viewer()!)!;

    test('the viewer offers two pickers (no day selection), only periods that have meals, and no date wording or elements', async () => {
      await mount();
      await openViewer('Calories by Time of Day');
      assert.equal(q('[data-chart-selection-bar]', viewer()!), null, 'a pie has no selected day');
      assert.equal(text(q('[data-chart-compare] h3', viewer()!)), 'Compare two times of day');
      const options = all('select[data-compare-select="a"] option', viewer()!).map((o) => text(o));
      assert.deepEqual(options, ['Choose a time of day', 'Morning', 'Midday', 'Evening', 'Late night'], 'Overnight and Afternoon have no meals: unobserved, not 0');
      await selectValue('a', 'Morning');
      await selectValue('b', 'Evening');
      assert.equal(pickText('a'), 'A: Morning');
      assert.equal(pickText('b'), 'B: Evening');
      assert.deepEqual(deltaRows().map((r) => r.getAttribute('data-compare-delta')), ['calories', 'count', 'pct']);
      assert.equal(deltaRow('calories'), `Calories | 900 cal | 800 cal | ${M}100 cal (lower)`);
      assert.equal(deltaRow('count'), `Meals | 3 | 1 | ${M}2 (lower)`);
      assert.equal(deltaRow('pct'), `Share | 38% | 34% | ${M}4% (lower)`);
      const words = text(section());
      assert.doesNotMatch(words, /\b\d+ days?\b|Same day|before A|after A|elapsed|\b20\d\d\b/i);
      assert.equal(all('time', section()).length, 0, 'no <time> element: a category has no date');
      assert.equal(q('[data-compare-timing]', viewer()!), null);
      assert.equal(openCompare(), null);
      assert.equal(q('[data-compare-link-note]', viewer()!), null);
    });

    test('the other slot\'s period is disabled in a picker, so one period can not be both A and B', async () => {
      await mount();
      await openViewer('Calories by Time of Day');
      await selectValue('a', 'Morning');
      const bMorning = q('select[data-compare-select="b"] option[value="Morning"]', viewer()!) as HTMLOptionElement;
      assert.equal(bMorning.disabled, true);
      assert.match(text(bMorning), /\(already A\)/);
      await selectValue('b', '');
      assert.equal(pickText('b'), 'B: not set');
    });

    test('A and B are marked in the Table (letters + words); Swap and Clear work; the card keeps a quiet summary', async () => {
      await mount();
      await openViewer('Calories by Time of Day');
      await selectValue('a', 'Midday');
      await selectValue('b', 'Morning');
      await clickEl(q('[data-compare-swap]', viewer()!));
      assert.equal(pickText('a'), 'A: Morning');
      await viewTab('Table');
      assert.equal(tableRow('Morning')!.getAttribute('data-compare-mark'), 'a');
      assert.equal(tableRow('Midday')!.getAttribute('data-compare-mark'), 'b');
      assert.match(text(tableRow('Morning')!), /Compare A, Morning/);
      assert.equal(all('button[data-chart-row-select]', viewer()!).length, 0, 'rows are not days: nothing to select or open');
      await escape();
      const strip = q('[data-chart-compare-strip]')!;
      assert.ok(strip, 'the card keeps a summary');
      assert.equal(all('select', strip).length, 0, 'the card never offers the pickers');
      assert.doesNotMatch(text(strip), /\b\d+ days?\b|Same day/);
    });

    test('a narrower range drops a period that has no meals there (announced, no dates) and refreshes the other; widening does not bring it back', async () => {
      await mount();
      await openViewer('Calories by Time of Day');
      await selectValue('a', 'Late night');
      await selectValue('b', 'Morning');
      await rangePick('Calories by Time of Day range', 'Last 7 days');
      assert.equal(status(), 'A (Late night) is no longer on this chart (nothing is recorded for it in this range), so it was cleared.');
      assert.equal(pickText('a'), 'A: not set');
      assert.equal(pickText('b'), 'B: Morning');
      await rangePick('Calories by Time of Day range', 'Last 90 days');
      assert.equal(pickText('a'), 'A: not set');
    });

    test('a different account starts clean', async () => {
      await mount();
      await openViewer('Calories by Time of Day');
      await selectValue('a', 'Morning');
      await selectValue('b', 'Midday');
      assert.ok(q('[data-compare-difference]', viewer()!));
      await act(async () => { setAccount('user-b'); });
      await settle(20);
      assert.equal(q('[data-compare-pick]'), null, 'no pick lines for the new account');
      assert.equal(q('[data-compare-difference]'), null);
      assert.equal(status(null), '', 'and no message');
    });
  });

  describe('every Dashboard viewer has an A / B comparison', () => {
    test('all chart cards: a picker or a day to pick, never a Compare link before two exact records are set', async () => {
      await mount();
      const titles = all('button[data-chart-expand]').map((b) => (b.getAttribute('aria-label') ?? '').replace(/^Open (.*) in full screen$/, '$1'));
      for (const expected of ['Weight Trend', 'Sleep', 'Waist Trend', 'WHOOP Recovery', 'Workout Duration', 'Calorie Balance', 'Calories by Time of Day', 'Calories: Actual vs Target', 'Protein: Actual vs Target', 'Carbs: Actual vs Target']) {
        assert.ok(titles.includes(expected), `${expected} is on the Dashboard (${titles.join(', ')})`);
      }
      for (const title of titles) {
        await openViewer(title);
        const step = q('[data-chart-step="next"]', viewer()!);
        if (step) await clickEl(step); // a chart with selectable days
        assert.ok(q('[data-chart-compare-root]', viewer()!) && q('[data-chart-compare]', viewer()!), `${title}: compare section present`);
        // A chart with selectable days offers Set as A / B (or, for a selected day with nothing recorded, says why not); a pie offers pickers.
        assert.ok(q('[data-compare-set]', viewer()!) || q('[data-compare-select]', viewer()!) || q('[data-chart-compare-reason]', viewer()!), `${title}: A / B can be set`);
        assert.equal(all('[data-chart-open-compare]', viewer()!).length, 0, `${title}: no link before two picks`);
        await escape();
        assert.equal(viewer(), null);
      }
    });
  });
});
