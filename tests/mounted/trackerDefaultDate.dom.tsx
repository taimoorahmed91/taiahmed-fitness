import { describe, test, mock, beforeAll as before, afterAll as after, afterEach, setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { installDom, loadJsdom } from './support/domHarness';
// Importing the suite module installs the scripted hook mocks (useWeight, useWaist, useSleep ...) for these pages.
import { registerTrackerPages } from './support/trackerPagesSuite';
void registerTrackerPages;

// Give the three trackers a few entries so the overview cards render their stat tiles (the suite's own mocks return none).
const entriesFor = (key: string, values: number[]) => values.map((v, i) => ({ id: `e${i}`, [key]: v, date: `2026-10-${String(30 - i).padStart(2, '0')}` }));
const hookWith = (entries: unknown[]) => () => ({
  entries, loading: false, addEntry: async () => true, updateEntry: async () => true, deleteEntry: async () => true, refetch: async () => {},
});
mock.module('@/hooks/useWeight', () => ({ useWeight: hookWith(entriesFor('weight', [82.4, 82.8, 83.1, 84.0])) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: hookWith(entriesFor('waist', [91.5, 92, 92.4, 93])) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: hookWith(entriesFor('hours', [7.5, 6.8, 8, 7.2])) }));

// Weight / Waist / Sleep mounted at the Poland-vs-UTC midnight boundary and with overview data:
//  - the date field defaults to the UTC calendar day (what Meals / Dashboard use), not the local day;
//  - the overview stat tiles use the 2x2-until-xl grid and the chart-sized title.
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

describe('mounted: tracker default date and overview layout', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  const originalTz = process.env.TZ;

  before(async () => {
    process.env.TZ = 'Europe/Warsaw';
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
    setSystemTime();
  });
  after(() => {
    env?.window.close();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(TooltipProvider, null, node)));
    return host;
  };

  const pages = [
    { name: 'Weight', page: () => import('../../src/pages/Weight'), title: 'Weight Overview' },
    { name: 'Waist', page: () => import('../../src/pages/Waist'), title: 'Waist Overview' },
    { name: 'Sleep', page: () => import('../../src/pages/Sleep'), title: 'Sleep Overview' },
  ];

  for (const t of pages) {
    test(`${t.name}: the date field is the UTC day at 00:30 Poland time (23:30 UTC the day before)`, async () => {
      setSystemTime(new Date('2026-10-31T23:30:00Z'));
      assert.equal(new Date().getDate(), 1, 'local day is Nov 1 in this test');
      const Page = (await t.page()).default;
      await mount(React.createElement(Page));
      const input = env.window.document.querySelector('input[type="date"]') as HTMLInputElement;
      assert.equal(input.value, '2026-10-31');
    });
  }

  for (const t of pages) {
    test(`${t.name} overview: chart-sized title and 2x2 tiles until xl`, async () => {
      const Page = (await t.page()).default;
      const host = await mount(React.createElement(Page));
      const title = [...host.querySelectorAll('h3')].find((h) => h.textContent?.includes(t.title)) as HTMLElement | undefined;
      assert.ok(title, `${t.title} heading`);
      assert.match(title.className, /\btext-lg\b/);
      assert.doesNotMatch(title.className, /text-2xl/);
      const grid = title.closest('.rounded-lg')?.querySelector('.grid') as HTMLElement | null;
      assert.ok(grid, 'stat grid');
      assert.match(grid.className, /\bgrid-cols-2\b/);
      assert.match(grid.className, /\bxl:grid-cols-4\b/);
      assert.doesNotMatch(grid.className, /\bsm:grid-cols-4\b/);
      assert.equal(grid.children.length, 4);
      for (const tile of [...grid.children] as HTMLElement[]) {
        assert.match(tile.className, /\bmin-w-0\b/);
        assert.match(tile.querySelector('p')?.className ?? '', /uppercase/);
        assert.match(tile.children[1].className, /tabular-nums/);
      }
    });
  }
});
