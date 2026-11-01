import { describe, test, mock, beforeAll as before, afterAll as after, afterEach, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import * as ReactNS from 'react';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Compare opened from an address (?category=weight&a=<id>&b=<id>): direct load, async hydration, Back / Forward, failure and
// retry, deleted ids, account changes and B-minus-A order. Real DOM, own process, scripted hooks (same approach as compareCalendar.dom.tsx).
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=jsdom bun test ./tests/mounted/compareUrl.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Table = 'meals' | 'gym_sessions' | 'weight' | 'sleep';
const TABLES: Table[] = ['meals', 'gym_sessions', 'weight', 'sleep'];
type Phase = 'loading' | 'ready' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: Record<string, any> = {};
const tableState = {} as Record<Table, { phase: Phase; refreshFailed: boolean }>;
let onRefetch: (table: Table) => void = () => {};

let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const useVersion = () =>
  ReactNS.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
const setPhase = (table: Table, phase: Phase, refreshFailed = false) => {
  tableState[table] = { phase, refreshFailed };
};

const TODAY = new Date().toISOString().slice(0, 10);
const day = (iso: string, delta: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

const resetData = () => {
  TABLES.forEach((t) => setPhase(t, 'ready'));
  onRefetch = () => {};
  data.meals = [{ id: 'm1', food: 'Oats', calories: 300, protein: 12, carbs: 50, time: '08:05', date: TODAY }];
  data.gym = [];
  data.weight = [
    { id: 'w1', weight: 70.5, date: TODAY },
    { id: 'w2', weight: 70.2, date: day(TODAY, -1), notes: 'morning' },
    { id: 'w3', weight: 71, date: day(TODAY, -7) },
  ];
  data.sleep = [
    { id: 's1', hours: 7.5, date: TODAY },
    { id: 's2', hours: 6, date: day(TODAY, -1) },
  ];
};
resetData();

const rows = (table: Table, list: unknown[]) => (tableState[table].phase === 'ready' ? list : []);
const refetchFor = (table: Table) => async () => {
  await new Promise((r) => setTimeout(r, 5));
  onRefetch(table);
  bump();
};
mock.module('@/lib/sharedTable', () => ({
  useSharedTable: () => ({}),
  useSharedTableState: (table: Table) => {
    useVersion();
    const { phase, refreshFailed } = tableState[table];
    return { phase, loadFailed: phase === 'error', refreshFailed: phase === 'ready' && refreshFailed, error: null };
  },
}));
mock.module('@/hooks/useMeals', () => ({ useMeals: () => (useVersion(), { meals: rows('meals', data.meals), refetch: refetchFor('meals') }) }));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => (useVersion(), { sessions: rows('gym_sessions', data.gym), refetch: refetchFor('gym_sessions') }) }));
mock.module('@/hooks/useWeight', () => ({ useWeight: () => (useVersion(), { entries: rows('weight', data.weight), refetch: refetchFor('weight') }) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: () => (useVersion(), { entries: rows('sleep', data.sleep), refetch: refetchFor('sleep') }) }));

describe('mounted: Compare opened from an address', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any, Router: any, Ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  // Every location change the router reports, with HOW it got there (PUSH / REPLACE / POP).
  let navLog: { search: string; type: string }[] = [];
  let go: (to: number | string) => void = () => {};
  let setAccount: (id: string | null) => void = () => {};

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    Router = await import('react-router-dom');
    Ctx = await import('../../src/contexts/userContextCore');
  });
  beforeEach(() => {
    resetData();
    navLog = [];
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  const doc = () => env.window.document as Document;
  const all = (sel: string) => [...doc().querySelectorAll<HTMLElement>(sel)];
  const q = (sel: string) => doc().querySelector<HTMLElement>(sel);
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const body = () => text(doc().body);
  const clickEl = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click exists');
    await act(async () => click(env.window, el!));
  };
  const settle = async (ms = 30) => act(async () => { await sleep(ms); });
  const radio = (name: string) => all('[role="radio"]').find((r) => text(r).startsWith(name))!;
  const checkboxes = () => all('ul[role="list"] [role="checkbox"]');
  const tick = async (contains: string) => clickEl(checkboxes().find((c) => text(c.closest('label')).includes(contains)));
  const tray = () => text(q('ol[aria-label="Selected records"]'));
  const status = () => text(q('[data-compare-link-status]'));
  const notice = () => q('[data-compare-link-notice]');
  const buttonWith = (label: string) => all('button').find((b) => text(b).includes(label));
  const lastSearch = () => navLog[navLog.length - 1]?.search ?? '';
  const checked = () => checkboxes().filter((c) => c.getAttribute('aria-checked') === 'true').length;

  const Probe = () => {
    const location = Router.useLocation();
    const type = Router.useNavigationType();
    const navigate = Router.useNavigate();
    go = (to) => navigate(to as never);
    React.useEffect(() => {
      navLog.push({ search: location.search, type });
    }, [location.key, location.search, type]);
    return null;
  };
  const Harness = ({ page, initialAccount }: { page: unknown; initialAccount: string | null }) => {
    const [account, setAcc] = React.useState(initialAccount);
    setAccount = setAcc;
    const value = account === null ? { user: null } : { user: { id: account } };
    return React.createElement(Ctx.UserContext.Provider, { value }, React.createElement(TooltipProvider, null, React.createElement(Probe), React.createElement(page as never)));
  };

  /** Opens Compare at `url` as a fresh page load. */
  const open = async (url: string, account: string | null = 'user-a') => {
    const Page = (await import('../../src/pages/Compare')).default;
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () =>
      root.render(
        React.createElement(Router.MemoryRouter, { initialEntries: [url] }, React.createElement(Harness, { page: Page, initialAccount: account })),
      ),
    );
    await settle(10);
  };

  describe('direct load', () => {
    test('both ids named: records are picked in link order and the comparison is B minus A', async () => {
      await open('/compare?category=weight&a=w2&b=w1');
      assert.equal(radio('Weight').getAttribute('aria-checked'), 'true');
      assert.equal(checked(), 2);
      const t = tray();
      assert.ok(t.indexOf('70.2 kg') < t.indexOf('70.5 kg'), `A is 70.2 then B is 70.5: ${t}`);
      assert.match(body(), /B is 0\.3 kg higher than A, 1 day later\./);
      assert.match(status(), /^Opened from a link\. 2 of 2 records selected: A is 70\.2 kg on .*, B is 70\.5 kg on /);
      assert.equal(notice(), null);
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1', 'address untouched');
    });

    test('order is never sorted by date: A newer than B stays A newer than B', async () => {
      await open('/compare?category=weight&a=w1&b=w3');
      // B (71 kg, 7 days earlier) minus A (70.5 kg) is +0.5: higher, and earlier in time.
      assert.match(body(), /B is 0\.5 kg higher than A, 7 days earlier\./);
      await open('/compare?category=weight&a=w3&b=w1');
      assert.match(body(), /B is 0\.5 kg lower than A, 7 days later\./);
    });

    test('opening a link adds no history entries and does not loop', async () => {
      await open('/compare?category=weight&a=w2&b=w1');
      await settle(40);
      assert.deepEqual(navLog.map((e) => e.type), ['POP'], 'only the initial entry');
    });

    test('manual sleep works the same way', async () => {
      await open('/compare?category=sleep&a=s2&b=s1');
      assert.equal(radio('Sleep').getAttribute('aria-checked'), 'true');
      assert.match(body(), /B is 1\.5 hours higher than A, 1 day later\./);
    });

    test('a metric alone opens that metric with nothing picked', async () => {
      await open('/compare?category=weight');
      assert.equal(radio('Weight').getAttribute('aria-checked'), 'true');
      assert.equal(checked(), 0);
      assert.equal(status(), '');
    });

    test('one id: A is filled and the page asks for one more', async () => {
      await open('/compare?category=weight&a=w3');
      assert.match(status(), /1 of 2 records selected: A is 71 kg/);
      assert.match(body(), /Pick one more record/);
    });

    test('duplicate ids collapse to one pick and the address is cleaned with a replace', async () => {
      await open('/compare?category=weight&a=w1&b=w1');
      assert.equal(checked(), 1);
      assert.match(status(), /1 of 2 records selected: A is 70\.5 kg/);
      assert.equal(lastSearch(), '?category=weight&a=w1');
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'REPLACE']);
    });

    test('malformed and unsupported params never crash; unusable parts are removed, unrelated ones kept', async () => {
      await open('/compare?x=1&category=waist&a=w1&b=w2&c=3');
      assert.equal(all('[role="radio"]').every((r) => r.getAttribute('aria-checked') === 'false'), true);
      assert.match(text(notice()), /metric we don't know/);
      assert.match(status(), /metric we don't know/);
      assert.equal(lastSearch(), '?x=1&c=3', 'x and c are not ours: kept');
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'REPLACE']);
    });

    test('a third id is simply not part of the contract (extra params are ignored, address untouched)', async () => {
      await open('/compare?category=weight&a=w2&b=w1&c=w3&d=zzz');
      assert.equal(checked(), 2);
      assert.equal(notice(), null);
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1&c=w3&d=zzz');
    });

    test('Meals and Gym open as metrics; ids next to them are ignored with a plain explanation', async () => {
      await open('/compare?category=meals&a=m1');
      assert.equal(radio('Meals').getAttribute('aria-checked'), 'true');
      assert.equal(checked(), 0);
      assert.match(text(notice()), /Links can only open weigh-ins and sleep logs\. Meals is open/);
      assert.equal(lastSearch(), '?category=meals');
    });

    test('ids with no metric are ignored, never guessed from the rows', async () => {
      await open('/compare?a=w1&b=w2');
      assert.equal(all('[role="radio"]').every((r) => r.getAttribute('aria-checked') === 'false'), true);
      assert.match(text(notice()), /names records but not a metric/);
      assert.equal(lastSearch(), '');
    });

    test('the status region is always in the page, so announcements are reliable', async () => {
      await open('/compare');
      assert.ok(q('[data-compare-link-status][role="status"][aria-live="polite"]'));
    });
  });

  describe('records that are not there', () => {
    test('B missing: pruned from the address with one replace, A stays, guidance says what to do', async () => {
      await open('/compare?category=weight&a=w2&b=gone');
      assert.equal(checked(), 1);
      assert.match(text(notice()), /Record B from this link isn't available\. It may have been deleted, or belong to a different account\. Pick one more weigh-in below\./);
      assert.match(status(), /Record B from this link isn't available.*1 of 2 records selected: A is 70\.2 kg/);
      assert.equal(lastSearch(), '?category=weight&a=w2');
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'REPLACE']);
    });

    test('A missing: the only real record moves up to A, and says so; it is not matched to anything else', async () => {
      await open('/compare?category=weight&a=gone&b=w3');
      assert.match(text(notice()), /Record A from this link isn't available.*The other one is now A\./);
      assert.equal(lastSearch(), '?category=weight&a=w3');
      assert.match(tray(), /71 kg/);
    });

    test('both missing: nothing is picked and nothing is substituted', async () => {
      await open('/compare?category=weight&a=gone&b=alsogone');
      assert.equal(checked(), 0);
      assert.match(text(notice()), /The weigh-ins in this link aren't available/);
      assert.equal(lastSearch(), '?category=weight');
    });

    test('an id of the OTHER metric is a mismatch: it is not found in this metric and is not mapped to it', async () => {
      await open('/compare?category=sleep&a=w1&b=s1');
      assert.equal(checked(), 1);
      assert.match(tray(), /7\.5 h/);
      assert.match(text(notice()), /Record A from this link isn't available/);
      assert.equal(lastSearch(), '?category=sleep&a=s1');
    });

    test('a record deleted elsewhere while the page is open is removed from the picks and the address, with its own wording', async () => {
      await open('/compare?category=weight&a=w2&b=w1');
      assert.equal(checked(), 2);
      data.weight = data.weight.filter((w: { id: string }) => w.id !== 'w1');
      await act(async () => bump());
      await settle();
      assert.equal(checked(), 1);
      assert.match(text(notice()), /Record B is no longer available, so it was removed from your picks/);
      assert.equal(/from this link/.test(text(notice())), false);
      assert.equal(lastSearch(), '?category=weight&a=w2');
    });
  });

  describe('loading and failure are not "missing"', () => {
    test('while the source loads nothing is pruned or announced; when it arrives the link hydrates', async () => {
      setPhase('weight', 'loading');
      await open('/compare?category=weight&a=w2&b=w1');
      await settle(40);
      assert.match(body(), /Loading records/);
      assert.equal(notice(), null);
      assert.equal(status(), '', 'no announcement while loading');
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1', 'address kept');
      assert.deepEqual(navLog.map((e) => e.type), ['POP']);

      setPhase('weight', 'ready');
      await act(async () => bump());
      await settle();
      assert.equal(checked(), 2);
      assert.match(status(), /^Opened from a link\. 2 of 2 records selected/);
      assert.match(body(), /B is 0\.3 kg higher than A/);
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1');
    });

    test('a missing id is still only reported after the late load finishes', async () => {
      setPhase('weight', 'loading');
      await open('/compare?category=weight&a=w2&b=gone');
      await settle(40);
      assert.equal(notice(), null);
      assert.equal(lastSearch(), '?category=weight&a=w2&b=gone');
      setPhase('weight', 'ready');
      await act(async () => bump());
      await settle();
      assert.match(text(notice()), /Record B from this link isn't available/);
      assert.equal(lastSearch(), '?category=weight&a=w2');
    });

    test('a failed load keeps the address and the request, shows the load error (not "unavailable"), and Try again hydrates', async () => {
      setPhase('weight', 'error');
      onRefetch = (t) => { if (t === 'weight') setPhase('weight', 'ready'); };
      await open('/compare?category=weight&a=w2&b=w1');
      assert.equal(radio('Weight').getAttribute('aria-checked'), 'true');
      assert.ok(all('[role="alert"]').some((a) => /We couldn't load your weigh-ins/.test(text(a))));
      assert.equal(notice(), null, 'a load failure is not a bad link');
      assert.equal(/isn't available/.test(body()), false);
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1');
      assert.equal(status(), '');

      await clickEl(buttonWith('Try again'));
      await settle();
      assert.equal(checked(), 2);
      assert.match(status(), /^Opened from a link\. 2 of 2 records selected/);
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1');
      assert.deepEqual(navLog.map((e) => e.type), ['POP']);
    });

    test('a failed refresh over loaded rows (stale) does not prune what it cannot verify', async () => {
      setPhase('weight', 'ready', true);
      await open('/compare?category=weight&a=w2&b=gone');
      await settle(40);
      assert.equal(notice(), null, 'stale rows cannot prove an id is gone');
      assert.equal(lastSearch(), '?category=weight&a=w2&b=gone');
      onRefetch = (t) => { if (t === 'weight') setPhase('weight', 'ready', false); };
      await clickEl(all('[role="status"]').flatMap((n) => [...n.querySelectorAll('button')]).find((b) => /Try again/.test(text(b))));
      await settle();
      assert.match(text(notice()), /Record B from this link isn't available/);
      assert.equal(lastSearch(), '?category=weight&a=w2');
    });
  });

  describe('using the page changes the address deliberately', () => {
    test('picking updates the address by REPLACE (no flood) and keeps unrelated params', async () => {
      await open('/compare?keep=me');
      await clickEl(radio('Weight'));
      assert.equal(lastSearch(), '?keep=me&category=weight');
      await tick('71 kg');
      assert.equal(lastSearch(), '?keep=me&category=weight&a=w3');
      await tick('70.2 kg');
      assert.equal(lastSearch(), '?keep=me&category=weight&a=w3&b=w2');
      await tick('70.5 kg'); // third tick: A drops, newest is B
      assert.equal(lastSearch(), '?keep=me&category=weight&a=w2&b=w1');
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'PUSH', 'REPLACE', 'REPLACE', 'REPLACE'], 'one entry for the metric, none per tick');
    });

    test('Swap writes B first as A and the comparison flips; Clear and Remove replace too', async () => {
      await open('/compare?category=weight&a=w2&b=w1');
      await clickEl(buttonWith('Swap A and B'));
      assert.equal(lastSearch(), '?category=weight&a=w1&b=w2');
      assert.match(body(), /B is 0\.3 kg lower than A/);
      await clickEl(all('button').find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Remove record B')));
      assert.equal(lastSearch(), '?category=weight&a=w1');
      await clickEl(buttonWith('Clear picks'));
      assert.equal(lastSearch(), '?category=weight');
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'REPLACE', 'REPLACE', 'REPLACE']);
    });

    test('choosing another metric adds ONE entry and clears the incompatible ids; Start over clears the address parts', async () => {
      await open('/compare?x=1&category=weight&a=w2&b=w1');
      await clickEl(radio('Sleep'));
      assert.equal(lastSearch(), '?x=1&category=sleep');
      assert.equal(checked(), 0);
      assert.equal(notice(), null);
      await clickEl(buttonWith('Start over'));
      assert.equal(lastSearch(), '?x=1');
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'PUSH', 'PUSH']);
    });

    test('Meals picks stay out of the address', async () => {
      await open('/compare');
      await clickEl(radio('Meals'));
      assert.equal(lastSearch(), '?category=meals');
      assert.equal(checkboxes().length, 1);
    });
  });

  describe('Back and Forward', () => {
    test('Back returns to the previous metric with its picks; Forward returns; nothing loops', async () => {
      await open('/compare?category=weight&a=w2&b=w1');
      await clickEl(radio('Sleep'));
      await tick('6 h');
      assert.equal(lastSearch(), '?category=sleep&a=s2');

      await act(async () => go(-1));
      await settle();
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1');
      assert.equal(radio('Weight').getAttribute('aria-checked'), 'true');
      assert.equal(checked(), 2);
      assert.match(body(), /B is 0\.3 kg higher than A/);
      assert.match(status(), /^Opened from a link\. 2 of 2 records selected/);

      await act(async () => go(1));
      await settle();
      assert.equal(lastSearch(), '?category=sleep&a=s2');
      assert.equal(radio('Sleep').getAttribute('aria-checked'), 'true');
      assert.equal(checked(), 1);
      assert.match(status(), /1 of 2 records selected: A is 6 hours/);
      assert.deepEqual(navLog.map((e) => e.type), ['POP', 'PUSH', 'REPLACE', 'POP', 'POP']);
    });

    test('Back to a link whose record was deleted in the meantime prunes it then, with guidance', async () => {
      await open('/compare?category=weight&a=w2&b=w1');
      await clickEl(radio('Sleep'));
      data.weight = data.weight.filter((w: { id: string }) => w.id !== 'w2');
      await act(async () => bump());
      await act(async () => go(-1));
      await settle();
      assert.match(text(notice()), /Record A from this link isn't available/);
      assert.equal(lastSearch(), '?category=weight&a=w1');
    });
  });

  describe('accounts', () => {
    test('a different account never inherits the picks, even when the same ids exist in its rows', async () => {
      await open('/compare?category=weight&a=w2&b=w1', 'user-a');
      assert.equal(checked(), 2);
      // Account B has rows with the very same ids (coincidence / cached data): they must not be picked.
      await act(async () => setAccount('user-b'));
      await settle();
      assert.equal(checked(), 0, 'no picks');
      assert.equal(all('[role="radio"]').every((r) => r.getAttribute('aria-checked') === 'false'), true);
      assert.equal(lastSearch(), '', 'address cleared');
      assert.equal(/B is .* than A/.test(body()), false);
      assert.equal(navLog[navLog.length - 1].type, 'REPLACE');
    });

    test('there is no frame where the new account shows the old picks', async () => {
      await open('/compare?category=weight&a=w2&b=w1', 'user-a');
      const seen: number[] = [];
      const observer = new env.window.MutationObserver(() => seen.push(checked()));
      observer.observe(doc().body, { subtree: true, attributes: true, childList: true });
      await act(async () => setAccount('user-b'));
      observer.disconnect();
      assert.equal(seen.includes(2), false, `picks seen during the switch: ${seen.join(',')}`);
    });

    test('signing out clears them too; the first sign-in after a load does not (that is just the account becoming known)', async () => {
      await open('/compare?category=weight&a=w2&b=w1', null);
      await act(async () => setAccount('user-a'));
      await settle();
      assert.equal(checked(), 2, 'null to an account is initial resolution');
      assert.equal(lastSearch(), '?category=weight&a=w2&b=w1');
      await act(async () => setAccount(null));
      await settle();
      assert.equal(checked(), 0);
      assert.equal(lastSearch(), '');
    });

    test('same account re-rendering keeps the picks', async () => {
      await open('/compare?category=weight&a=w2&b=w1', 'user-a');
      await act(async () => setAccount('user-a'));
      await act(async () => bump());
      assert.equal(checked(), 2);
    });
  });
});
