import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPARE_LINK_CATEGORIES,
  COMPARE_PATH,
  COMPARE_URL_CATEGORIES,
  buildCompareHref,
  buildCompareHrefFromRefs,
  compareEligibility,
  decideCompareHistory,
  normalizeCompareSearch,
  parseCompareSearch,
  searchKey,
  toSearchString,
  withCompareSelection,
} from '../src/lib/compareUrl';
import { describeLinkResult, describeUrlIssues } from '../src/components/compare/compareLinkStatus';
import { CATEGORY_ORDER, buildEntries } from '../src/components/compare/compareModel';
import { ROUTES } from '../src/app/navigation';

// The Compare address contract: ordered A/B record ids, exact eligibility, history rules and plain-words messages.

describe('the contract stays in step with the page', () => {
  test('same route and same four metrics as Compare itself', () => {
    assert.equal(COMPARE_PATH, ROUTES.compare);
    assert.deepEqual([...COMPARE_URL_CATEGORIES], [...CATEGORY_ORDER]);
    assert.deepEqual([...COMPARE_LINK_CATEGORIES], ['weight', 'sleep']);
  });
});

describe('parseCompareSearch', () => {
  test('keeps A first and B second, exactly as written, never sorted', () => {
    assert.deepEqual(parseCompareSearch('?category=weight&a=zzz&b=aaa'), { category: 'weight', ids: ['zzz', 'aaa'], issues: [] });
    assert.deepEqual(parseCompareSearch('?category=sleep&b=2&a=1').ids, ['1', '2'], 'param order in the text does not matter; a is A');
  });
  test('accepts a leading "?" or none, and a URLSearchParams', () => {
    assert.deepEqual(parseCompareSearch('category=weight&a=x').ids, ['x']);
    assert.deepEqual(parseCompareSearch(new URLSearchParams('category=weight&a=x')).ids, ['x']);
  });
  test('an empty address is clean', () => {
    assert.deepEqual(parseCompareSearch(''), { category: null, ids: [], issues: [] });
    assert.deepEqual(parseCompareSearch('?tab=x'), { category: null, ids: [], issues: [] });
  });
  test('a metric alone is fine, and meals / gym open as a metric', () => {
    assert.deepEqual(parseCompareSearch('?category=weight'), { category: 'weight', ids: [], issues: [] });
    assert.deepEqual(parseCompareSearch('?category=meals'), { category: 'meals', ids: [], issues: [] });
  });
  test('the same id twice collapses to one pick', () => {
    assert.deepEqual(parseCompareSearch('?category=weight&a=x&b=x'), { category: 'weight', ids: ['x'], issues: ['duplicate-id'] });
  });
  test('a repeated a / b uses the first value only and is reported', () => {
    const parsed = parseCompareSearch('?category=weight&a=1&a=2&a=3&b=4');
    assert.deepEqual(parsed.ids, ['1', '4']);
    assert.deepEqual(parsed.issues, ['extra-values']);
  });
  test('a third id has nowhere to go: only a and b exist, other params are ignored', () => {
    const parsed = parseCompareSearch('?category=weight&a=1&b=2&c=3&third=4');
    assert.deepEqual(parsed, { category: 'weight', ids: ['1', '2'], issues: [] });
  });
  test('b without a: the only record becomes A and it is reported', () => {
    assert.deepEqual(parseCompareSearch('?category=sleep&b=9'), { category: 'sleep', ids: ['9'], issues: ['b-without-a'] });
  });
  test('malformed ids are dropped: empty, spaces, control characters, too long', () => {
    assert.deepEqual(parseCompareSearch('?category=weight&a=&b=ok'), { category: 'weight', ids: ['ok'], issues: ['invalid-id', 'b-without-a'] });
    assert.deepEqual(parseCompareSearch('?category=weight&a=has%20space&b=ok').ids, ['ok']);
    assert.deepEqual(parseCompareSearch('?category=weight&a=x%00y').ids, []);
    assert.deepEqual(parseCompareSearch(`?category=weight&a=${'x'.repeat(129)}`).ids, []);
    assert.deepEqual(parseCompareSearch(`?category=weight&a=${'x'.repeat(128)}`).ids, ['x'.repeat(128)]);
  });
  test('an unknown metric is dropped; its ids cannot be placed', () => {
    assert.deepEqual(parseCompareSearch('?category=waist&a=1&b=2'), { category: null, ids: [], issues: ['unknown-category', 'ids-without-category'] });
    assert.deepEqual(parseCompareSearch('?category=WEIGHT').category, null, 'case sensitive');
    assert.deepEqual(parseCompareSearch('?category=__proto__').category, null);
    assert.deepEqual(parseCompareSearch('?category=constructor').category, null);
  });
  test('ids with no metric are ignored, never guessed', () => {
    assert.deepEqual(parseCompareSearch('?a=1&b=2'), { category: null, ids: [], issues: ['ids-without-category'] });
  });
  test('Meals and Gym picks are not link-addressable: the metric opens, the ids are ignored', () => {
    assert.deepEqual(parseCompareSearch('?category=gym&a=1&b=2'), { category: 'gym', ids: [], issues: ['ids-unsupported-category'] });
    assert.deepEqual(parseCompareSearch('?category=meals&a=1').ids, []);
  });
  test('percent-encoded ids round-trip', () => {
    assert.deepEqual(parseCompareSearch('?category=weight&a=a%2Fb%3Fc').ids, ['a/b?c']);
  });
  test('ids that look like dates are just ids: nothing is matched by date', () => {
    assert.deepEqual(parseCompareSearch('?category=weight&a=2026-10-30&b=2026-10-31').ids, ['2026-10-30', '2026-10-31']);
  });
});

describe('writing the address', () => {
  test('sets category, a and b and keeps unrelated parameters in place', () => {
    const next = withCompareSelection('?utm=1&category=sleep&keep=a%20b&z=9', { category: 'weight', ids: ['x', 'y'] });
    assert.equal(next.get('utm'), '1');
    assert.equal(next.get('keep'), 'a b');
    assert.equal(next.get('z'), '9');
    assert.equal(next.get('category'), 'weight');
    assert.equal(next.get('a'), 'x');
    assert.equal(next.get('b'), 'y');
    assert.deepEqual([...next.keys()].slice(0, 3), ['utm', 'keep', 'z']);
  });
  test('changing metric clears incompatible ids; no metric clears all three', () => {
    assert.equal(withCompareSelection('?category=weight&a=1&b=2', { category: 'sleep', ids: [] }).toString(), 'category=sleep');
    assert.equal(withCompareSelection('?category=weight&a=1&b=2&x=1', { category: null, ids: [] }).toString(), 'x=1');
  });
  test('Meals and Gym never write ids', () => {
    assert.equal(withCompareSelection('', { category: 'meals', ids: ['1', '2'] }).toString(), 'category=meals');
  });
  test('only the first two distinct valid ids are written, in order', () => {
    assert.equal(withCompareSelection('', { category: 'weight', ids: ['b', 'b', 'a', 'c'] }).toString(), 'category=weight&a=b&b=a');
    assert.equal(withCompareSelection('', { category: 'weight', ids: ['bad id', 'a'] }).toString(), 'category=weight&a=a');
  });
  test('normalizing drops what could not be used and keeps everything else', () => {
    assert.equal(normalizeCompareSearch('?x=1&category=nope&a=1&b=2').toString(), 'x=1');
    assert.equal(normalizeCompareSearch('?category=weight&a=1&a=2&b=1&x=1').toString(), 'x=1&category=weight&a=1');
    assert.equal(normalizeCompareSearch('?x=1&category=weight&a=1&b=2').toString(), 'x=1&category=weight&a=1&b=2');
  });
  test('searchKey and toSearchString treat "?a=1" and "a=1" alike and never return a lone "?"', () => {
    assert.equal(searchKey('?a=1'), searchKey('a=1'));
    assert.equal(toSearchString(new URLSearchParams()), '');
    assert.equal(toSearchString(new URLSearchParams('a=1')), '?a=1');
  });
});

describe('history decisions', () => {
  test('a different metric, or starting over, adds an entry', () => {
    assert.equal(decideCompareHistory({ cause: 'category', from: 'weight', to: 'sleep' }), 'push');
    assert.equal(decideCompareHistory({ cause: 'category', from: null, to: 'weight' }), 'push');
    assert.equal(decideCompareHistory({ cause: 'category', from: 'weight', to: null }), 'push');
  });
  test('choosing the same metric again, ticking, swapping, clearing, cleanups and account resets replace', () => {
    assert.equal(decideCompareHistory({ cause: 'category', from: 'weight', to: 'weight' }), 'replace');
    for (const cause of ['pick', 'normalize', 'prune', 'account'] as const) {
      assert.equal(decideCompareHistory({ cause, from: 'weight', to: 'sleep' }), 'replace', cause);
      assert.equal(decideCompareHistory({ cause, from: 'weight', to: 'weight' }), 'replace', cause);
    }
  });
});

describe('eligibility', () => {
  test('exact Weight and exact manual Sleep records are eligible', () => {
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'weight', recordId: 'w1' }), { eligible: true, category: 'weight', recordId: 'w1' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'sleep', recordId: 's1', source: 'manual' }), { eligible: true, category: 'sleep', recordId: 's1' });
  });
  test('Waist, WHOOP sleep, aggregates, meals and gym are not', () => {
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'waist', recordId: 'x' }), { eligible: false, reason: 'unsupported-metric' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'sleep', recordId: 'x', source: 'whoop' }), { eligible: false, reason: 'not-manual-source' });
    assert.deepEqual(compareEligibility({ kind: 'daily-aggregate', metric: 'weight', recordId: 'x' }), { eligible: false, reason: 'not-a-record' });
    assert.deepEqual(compareEligibility({ kind: 'period-aggregate', metric: 'sleep' }), { eligible: false, reason: 'not-a-record' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'calories', recordId: 'x' }), { eligible: false, reason: 'unsupported-metric' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'meals', recordId: 'x' }), { eligible: false, reason: 'unsupported-metric' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: '__proto__', recordId: 'x' }), { eligible: false, reason: 'unsupported-metric' });
  });
  test('a record without a usable stored id (an index, a date placeholder, empty) is not eligible', () => {
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'weight' }), { eligible: false, reason: 'missing-record-id' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'weight', recordId: '' }), { eligible: false, reason: 'missing-record-id' });
    assert.deepEqual(compareEligibility({ kind: 'record', metric: 'weight', recordId: 'a b' }), { eligible: false, reason: 'missing-record-id' });
  });
});

describe('building a link for another page', () => {
  test('keeps the order the caller gives (A first), even when B is the older record', () => {
    assert.equal(buildCompareHref('weight', ['newer', 'older']), '/compare?category=weight&a=newer&b=older');
    assert.equal(buildCompareHref('sleep', ['only']), '/compare?category=sleep&a=only');
  });
  test('encodes ids safely and round-trips through the parser', () => {
    const href = buildCompareHref('weight', ['a/b?c', 'd&e=f'])!;
    assert.ok(href.startsWith('/compare?'));
    const parsed = parseCompareSearch(href.slice(href.indexOf('?')));
    assert.deepEqual(parsed, { category: 'weight', ids: ['a/b?c', 'd&e=f'], issues: [] });
  });
  test('no link for other metrics, bad ids, none or three', () => {
    assert.equal(buildCompareHref('waist', ['1']), null);
    assert.equal(buildCompareHref('meals', ['1']), null);
    assert.equal(buildCompareHref('weight', []), null);
    assert.equal(buildCompareHref('weight', ['1', '2', '3']), null);
    assert.equal(buildCompareHref('weight', ['1', '']), null);
    assert.equal(buildCompareHref('weight', [1 as unknown as string]), null);
    assert.equal(buildCompareHref(undefined, ['1']), null);
  });
  test('the same id twice is one pick', () => {
    assert.equal(buildCompareHref('weight', ['x', 'x']), '/compare?category=weight&a=x');
  });
  test('from chart points: order kept, every point must be eligible and from one metric', () => {
    const w = (recordId: string) => ({ kind: 'record' as const, metric: 'weight', recordId });
    assert.deepEqual(buildCompareHrefFromRefs([w('b'), w('a')]), { ok: true, href: '/compare?category=weight&a=b&b=a', category: 'weight', recordIds: ['b', 'a'] });
    assert.deepEqual(buildCompareHrefFromRefs([w('a'), { kind: 'record', metric: 'sleep', recordId: 's' }]), { ok: false, reason: 'mixed-metrics' });
    assert.deepEqual(buildCompareHrefFromRefs([w('a'), { kind: 'record', metric: 'waist', recordId: 'z' }]), { ok: false, reason: 'unsupported-metric' });
    assert.deepEqual(buildCompareHrefFromRefs([{ kind: 'record', metric: 'sleep', recordId: 's', source: 'whoop' }]), { ok: false, reason: 'not-manual-source' });
    assert.deepEqual(buildCompareHrefFromRefs([]), { ok: false, reason: 'wrong-record-count' });
    assert.deepEqual(buildCompareHrefFromRefs([w('1'), w('2'), w('3')]), { ok: false, reason: 'wrong-record-count' });
  });
});

describe('messages', () => {
  const entries = buildEntries('weight', {
    meals: [], gym: [], sleep: [],
    weight: [
      { id: 'w1', weight: 70.5, date: '2026-10-30' },
      { id: 'w2', weight: 70.2, date: '2026-10-29' },
    ],
  });
  const [w1, w2] = entries;

  test('everything found: announces which record is A and which is B, no on-screen notice', () => {
    const m = describeLinkResult({ category: 'weight', requested: 2, missingSlots: [], found: [w1, w2], fromLink: true });
    assert.equal(m.notice, null);
    assert.match(m.announcement, /^Opened from a link\./);
    assert.match(m.announcement, /A is 70\.5 kg on 30/10/2026, B is 70\.2 kg on 29/10/2026/);
  });
  test('B missing: says so, never invents a replacement', () => {
    const m = describeLinkResult({ category: 'weight', requested: 2, missingSlots: ['B'], found: [w1], fromLink: true });
    assert.match(m.notice!, /Record B from this link isn't available/);
    assert.match(m.notice!, /Pick one more weigh-in/);
    assert.equal(/now A/.test(m.notice!), false);
    assert.match(m.announcement, /1 of 2 records selected: A is 70\.5 kg/);
  });
  test('A missing: the other record moves up to A and the notice says so', () => {
    const m = describeLinkResult({ category: 'weight', requested: 2, missingSlots: ['A'], found: [w2], fromLink: true });
    assert.match(m.notice!, /Record A from this link isn't available/);
    assert.match(m.notice!, /The other one is now A\./);
  });
  test('nothing found: asks for two picks, names whether it was one or both', () => {
    assert.match(describeLinkResult({ category: 'sleep', requested: 2, missingSlots: ['A', 'B'], found: [], fromLink: true }).notice!, /The sleep logs in this link aren't available/);
    assert.match(describeLinkResult({ category: 'sleep', requested: 1, missingSlots: ['A'], found: [], fromLink: true }).notice!, /The sleep log in this link isn't available/);
  });
  test('a record removed while the page is open is described as removed, not as a bad link', () => {
    const m = describeLinkResult({ category: 'weight', requested: 2, missingSlots: ['B'], found: [w1], fromLink: false });
    assert.match(m.notice!, /Record B is no longer available/);
    assert.equal(/link/.test(m.notice!), false);
  });
  test('address problems get one plain sentence each, nothing technical', () => {
    assert.equal(describeUrlIssues([], null), null);
    assert.match(describeUrlIssues(['unknown-category'], null)!, /metric we don't know/);
    assert.match(describeUrlIssues(['ids-without-category'], null)!, /names records but not a metric/);
    assert.match(describeUrlIssues(['ids-unsupported-category'], 'meals')!, /Links can only open weigh-ins and sleep logs\. Meals is open/);
    assert.match(describeUrlIssues(['invalid-id', 'duplicate-id'], 'weight')!, /Part of that link could not be used/);
  });
});

describe('source guards', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  test('the contract file is pure: no React, router, component or hook imports', () => {
    assert.deepEqual(read('src/lib/compareUrl.ts').match(/^import .*$/gm) ?? [], []);
  });
  test('the page never sorts the picks and never writes the address except through the one hook', () => {
    const hook = read('src/components/compare/useCompareLink.ts');
    const page = read('src/pages/Compare.tsx');
    assert.equal(/\.sort\(/.test(hook), false);
    assert.equal(/\.sort\(/.test(page), false);
    assert.equal(/useNavigate|useSearchParams|history\./.test(page), false);
    assert.match(hook, /decideCompareHistory/);
  });
  test('a missing record is only reported once its source has loaded for good', () => {
    const hook = read('src/components/compare/useCompareLink.ts');
    assert.match(hook, /view !== 'ready' \|\| stale/);
  });
});
