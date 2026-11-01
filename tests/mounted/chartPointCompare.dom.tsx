import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// In-viewer A / B comparison on charts that are NOT on the Dashboard page test: Body Recomposition (two measurements on separate days, no
// selectable day), a macro chart with unobserved days (null / partial are blank, never 0), a plain daily chart with a null gap, and the
// picks' reset rules (hidden by a narrower range, account change) without the page around them.
// ResponsiveContainer is replaced by a fixed-size one so Recharts draws SVG in jsdom; reduced motion is on.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartPointCompare.dom.tsx
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
// The viewer's inline day panel is the Calendar's own (its data hooks are covered elsewhere); a stand-in keeps this file about Compare.
mock.module('@/components/calendar/SelectedDayPanel', () => ({ ConnectedSelectedDayPanel: () => null }));
const NO_NOTES: never[] = [];
mock.module('@/hooks/useDailyNotes', () => ({
  SYMPTOM_TAGS: ['Headache'],
  useDailyNotes: () => ({ notes: NO_NOTES, refetch: async () => {}, userId: 'u1', isDemo: false, saveNote: async () => true }),
}));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const M = '\u2212';

describe('mounted: A / B comparison on Body Recomposition, macro and plain daily charts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any, Router: any, TooltipProvider: any, Ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
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
  beforeEach(() => { env.window.localStorage.clear(); });
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
  const clickEl = async (el: Element | null | undefined) => { assert.ok(el, 'element to click exists'); await act(async () => click(env.window, el!)); await settle(5); };

  const mount = async (element: unknown) => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const App = () => {
      const [account, setAcc] = React.useState('user-a' as string | null);
      setAccount = setAcc;
      return React.createElement(Ctx.UserContext.Provider, { value: account === null ? { user: null } : { user: { id: account } } },
        React.createElement(Router.MemoryRouter, null, React.createElement(TooltipProvider, null, element)));
    };
    await act(async () => root.render(React.createElement(App)));
    await settle(10);
    return host;
  };
  const viewer = () => q('[data-chart-viewer]');
  const openViewer = async (title: string) => { await clickEl(q(`button[aria-label="Open ${title} in full screen"]`)); await settle(10); assert.ok(viewer(), 'the viewer opened'); };
  const rangePick = async (group: string, label: string) => clickEl(q(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`, viewer()!));
  const viewTab = async (label: 'Chart' | 'Table') => clickEl(all('[role="radio"]', viewer()!).find((r) => r.getAttribute('aria-label') === label || text(r) === label));
  const selectValue = async (slot: 'a' | 'b', value: string) => {
    const el = q(`select[data-compare-select="${slot}"]`, viewer()!) as HTMLSelectElement;
    assert.ok(el);
    await act(async () => { el.value = value; el.dispatchEvent(new env.window.Event('change', { bubbles: true })); });
    await settle(5);
  };
  const deltaRow = (key: string) => all('th, td', q(`tr[data-compare-delta="${key}"]`, viewer()!)!).map((c) => text(c)).join(' | ');
  const pickText = (slot: 'a' | 'b') => {
    const el = q(`[data-compare-pick="${slot}"]`, viewer()!);
    if (!el) return '';
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-compare-badge]').forEach((b) => b.remove());
    return text(copy);
  };

  describe('Body Recomposition: two measured days of the displayed period, honestly', () => {
    const weight = [{ date: iso(20), value: 82 }, { date: iso(10), value: 81 }, { date: iso(2), value: 80.4 }];
    const waist = [{ date: iso(10), value: 91 }, { date: iso(2), value: 90 }];
    const mountCard = async () => {
      const { BodyRecompositionCard } = await import('../../src/components/BodyRecompositionCard');
      env.window.localStorage.setItem('fittrack_chart_body_recomp_range', '30');
      return mount(React.createElement(BodyRecompositionCard, { weight, waist }));
    };

    test('the viewer has pickers (no selected day, no Open day), B - A for weight and waist, days apart, and never a link', async () => {
      await mountCard();
      await openViewer('Body Recomposition Index');
      assert.equal(q('[data-chart-selection-bar]', viewer()!), null, 'the index is a whole-period figure: no per-day selection');
      assert.equal(q('[data-chart-open-day]'), null);
      assert.equal(text(q('[data-chart-compare] h3', viewer()!)), 'Compare two days');
      await selectValue('a', iso(10));
      await selectValue('b', iso(2));
      assert.deepEqual(all('tr[data-compare-delta]', viewer()!).map((r) => r.getAttribute('data-compare-delta')), ['weight', 'waist']);
      assert.equal(deltaRow('weight'), `Weight | 81 kg | 80.4 kg | ${M}0.6 kg (lower)`);
      assert.equal(deltaRow('waist'), `Waist | 91 cm | 90 cm | ${M}1 cm (lower)`);
      assert.equal(text(q('[data-compare-timing]', viewer()!)), 'B is 8 days after A');
      assert.equal(all('a[href^="/compare"], [data-chart-open-compare]').length, 0);
    });

    test('a day with only one of the two measurements compares just that one: the other is "no value", never 0', async () => {
      await mountCard();
      await openViewer('Body Recomposition Index');
      await selectValue('a', iso(20)); // weight only
      await selectValue('b', iso(10));
      assert.equal(deltaRow('weight'), `Weight | 82 kg | 81 kg | ${M}1 kg (lower)`);
      assert.equal(all('tr[data-compare-delta="waist"]', viewer()!).length, 1, 'waist was observed on B');
      assert.equal(deltaRow('waist'), 'Waist | \u2014No A value | 91 cm | No difference: no value on A');
    });

    test('picks survive Chart / Table, are marked in the Table, the plot marks them, and a narrower range clears the hidden one with a message', async () => {
      await mountCard();
      await openViewer('Body Recomposition Index');
      await selectValue('a', iso(20));
      await selectValue('b', iso(2));
      await viewTab('Table');
      assert.equal(q(`tr[data-row-id="${iso(20)}"]`, viewer()!)!.getAttribute('data-compare-mark'), 'a');
      assert.equal(q(`tr[data-row-id="${iso(2)}"]`, viewer()!)!.getAttribute('data-compare-mark'), 'b');
      await viewTab('Chart');
      assert.ok(all('.recharts-reference-line text', viewer()!).some((t) => text(t) === 'A'), 'A is marked on the plot');
      await rangePick('Body Recomposition Index range', 'Last 14 days');
      assert.match(text(q('[data-compare-status]', viewer()!)), /^A \(.*\) is no longer on this chart \(outside the date range/);
      assert.equal(pickText('a'), 'A: not set');
      assert.ok(pickText('b').startsWith('B: '));
      await rangePick('Body Recomposition Index range', 'Last 30 days');
      assert.equal(pickText('a'), 'A: not set', 'widening does not bring it back');
    });
  });

  describe('a macro chart: blank and partly logged days are not points', () => {
    const rows = [
      { date: iso(5), actual: 1800, intake: 'recorded', min: 1700, max: 2000 },
      { date: iso(4), actual: null, intake: 'no-meals', min: 1700, max: 2000 },
      { date: iso(3), actual: 0, intake: 'recorded', min: 1700, max: null },
      { date: iso(2), actual: null, intake: 'partial', min: 1700, max: 2000 },
      { date: iso(1), actual: 2100, intake: 'recorded', min: 1700, max: 2000 },
    ];
    const mountMacro = async () => {
      const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
      env.window.localStorage.setItem('fittrack_chart_macro_Calories_range', '14');
      return mount(React.createElement(MacroTargetChart, { data: rows, title: 'Calories', unit: 'cal', storageKey: 'Calories', metric: 'calories' }));
    };

    test('the Table offers a select button only on observed days; an explicit 0 is observed and compares as 0 (not as a gap)', async () => {
      await mountMacro();
      await openViewer('Calories');
      await viewTab('Table');
      const selectable = (d: string) => !!q('button[data-chart-row-select]', q(`tr[data-row-id="${d}"]`, viewer()!)!);
      assert.deepEqual([5, 4, 3, 2, 1].map((n) => selectable(iso(n))), [true, false, true, false, true]);
      for (const [d, slot] of [[iso(5), 'a'], [iso(3), 'b']] as const) {
        await clickEl(q('button[data-chart-row-select]', q(`tr[data-row-id="${d}"]`, viewer()!)!));
        await clickEl(q(`[data-compare-set="${slot}"]`, viewer()!));
      }
      assert.equal(deltaRow('actual'), `Actual | 1,800 cal | 0 cal | ${M}1,800 cal (lower)`);
      assert.equal(deltaRow('min'), 'Min target | 1,700 cal | 1,700 cal | 0 cal (no change)');
      assert.equal(deltaRow('max'), 'Max target | 2,000 cal | \u2014No B value | No difference: no value on B');
    });
  });

  describe('the reset message survives when fewer than two points remain', () => {
    const closeViewer = async () => {
      await act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      await settle(10);
    };
    const note = () => q('[data-compare-notice-row]', viewer()!);

    test('narrowing to ONE point then ZERO: marks, picks and link are gone, the message stays visible and live, nothing comes back on widening, and one point can not start a comparison', async () => {
      const { RecoveryChart } = await import('../../src/components/RecoveryChart');
      env.window.localStorage.setItem('fittrack_chart_recovery_range', '90');
      await mount(React.createElement(RecoveryChart, { data: [{ date: iso(60), recovery: 50 }, { date: iso(45), recovery: 60 }, { date: iso(20), recovery: 70 }] }));
      await openViewer('WHOOP Recovery');
      await viewTab('Table');
      for (const [d, slot] of [[iso(60), 'a'], [iso(45), 'b']] as const) {
        await clickEl(q('button[data-chart-row-select]', q(`tr[data-row-id="${d}"]`, viewer()!)!));
        await clickEl(q(`[data-compare-set="${slot}"]`, viewer()!));
      }
      assert.ok(q('[data-compare-difference]', viewer()!));
      await viewTab('Chart');
      await rangePick('WHOOP Recovery range', 'Last 30 days'); // only iso(20) is left
      assert.equal(q('[data-compare-pick]', viewer()!), null, 'no pick lines');
      assert.equal(q('[data-compare-difference]', viewer()!), null);
      assert.equal(all('[data-chart-open-compare]').length, 0);
      assert.match(text(note()), /A \(.*\) and B \(.*\) are no longer on this chart/);
      assert.match(text(q('[data-compare-status]', viewer()!)), /no longer on this chart/, 'announced');
      assert.equal(all('[data-compare-set]', viewer()!).length, 0, 'one point can not start a new comparison');
      await viewTab('Table');
      assert.equal(all('[data-compare-mark]', viewer()!).length, 0, 'no marks');
      await viewTab('Chart');
      await closeViewer();
      assert.ok(q('[data-chart-compare-strip-root] [data-compare-notice-row] [data-compare-dismiss]'), 'the card keeps the visible message too');
      assert.equal(q('[data-chart-compare-strip]'), null, 'with no pick summary');
      await openViewer('WHOOP Recovery');
      await rangePick('WHOOP Recovery range', 'Last 7 days'); // nothing at all is left
      assert.match(text(note()), /no longer on this chart/, 'the message is still there with zero points');
      await rangePick('WHOOP Recovery range', 'Last 90 days');
      assert.equal(q('[data-compare-pick]', viewer()!), null, 'widening does not resurrect the picks');
      assert.equal(all('[data-chart-open-compare]').length, 0);
      await clickEl(q('[data-compare-dismiss]', viewer()!));
      assert.equal(text(note()), '', 'dismissing removes the message');
      assert.equal(q('[data-compare-dismiss]', viewer()!), null);
    });

    test('a picker-only chart (Body Recomposition): the message stays, but with one date left there are no pickers to start a comparison', async () => {
      const { BodyRecompositionCard } = await import('../../src/components/BodyRecompositionCard');
      env.window.localStorage.setItem('fittrack_chart_body_recomp_range', '30');
      await mount(React.createElement(BodyRecompositionCard, { weight: [{ date: iso(20), value: 82 }, { date: iso(10), value: 81 }, { date: iso(2), value: 80.4 }], waist: [] }));
      await openViewer('Body Recomposition Index');
      await selectValue('a', iso(20));
      await selectValue('b', iso(10));
      await rangePick('Body Recomposition Index range', 'Last 7 days'); // only iso(2) left
      assert.match(text(note()), /A \(.*\) and B \(.*\) are no longer on this chart/);
      assert.equal(all('select[data-compare-select]', viewer()!).length, 0, 'one date is not enough to start');
      assert.equal(all('[data-compare-pick], [data-compare-difference], [data-compare-mark]', viewer()!).length, 0);
      assert.equal(q('[data-chart-compare] h3', viewer()!), null, 'no empty section around the message');
      await rangePick('Body Recomposition Index range', 'Last 30 days');
      assert.equal(all('select[data-compare-select]', viewer()!).length, 2, 'wider again: pickers are back, but empty');
      assert.equal(all('[data-compare-pick]', viewer()!).length, 0, 'nothing resurrected');
    });
  });

  describe('a plain daily chart with a gap', () => {
    test('a null day is not selectable and not pickable; two real days compare; the card shows the summary after the viewer closes', async () => {
      const { RecoveryChart } = await import('../../src/components/RecoveryChart');
      env.window.localStorage.setItem('fittrack_chart_recovery_range', '30');
      await mount(React.createElement(RecoveryChart, { data: [{ date: iso(6), recovery: 40 }, { date: iso(5), recovery: null as unknown as number }, { date: iso(1), recovery: 70 }] }));
      await openViewer('WHOOP Recovery');
      await viewTab('Table');
      assert.equal(q('button[data-chart-row-select]', q(`tr[data-row-id="${iso(5)}"]`, viewer()!)!), null);
      for (const [d, slot] of [[iso(6), 'a'], [iso(1), 'b']] as const) {
        await clickEl(q('button[data-chart-row-select]', q(`tr[data-row-id="${d}"]`, viewer()!)!));
        await clickEl(q(`[data-compare-set="${slot}"]`, viewer()!));
      }
      assert.match(text(q('[data-compare-difference]', viewer()!)), new RegExp(`B ${M} A: \\+30% \\(higher\\)`));
      await act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      await settle(10);
      const strip = q('[data-chart-compare-strip]')!;
      assert.ok(strip);
      assert.match(text(q('[data-compare-difference]', strip)), /B \u2212 A: \+30% \(higher\)/);
      assert.equal(all('[data-compare-set], select', strip).length, 0, 'the card never offers Set controls or pickers');
      assert.equal(all('[data-chart-open-compare]').length, 0);
      await act(async () => { setAccount('user-b'); });
      await settle(20);
      assert.equal(q('[data-chart-compare-strip]')?.querySelector('[data-compare-pick]') ?? null, null, 'a different account starts clean');
    });
  });
});
