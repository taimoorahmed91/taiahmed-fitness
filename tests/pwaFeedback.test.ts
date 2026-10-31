import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeCachedTemplates, describeUpdate, formatAge, OFFLINE_READY_TOAST, UPDATE_BLOCKED_TOAST,
} from '../src/components/pwa/pwaFeedbackCopy';
import { lastSessionWithFallback } from '../src/components/pwa/lastSessionFallback';

const root = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(f) ? [rel] : [];
  });

describe('update banner copy', () => {
  test('nothing to show when there is no update', () => {
    assert.equal(describeUpdate('none'), null);
  });

  test('ready: one clear "Update now" action, and it can be put off', () => {
    const c = describeUpdate('ready')!;
    assert.equal(c.action, 'Update now');
    assert.equal(c.dismissible, true);
    assert.match(c.body, /reloads once/);
  });

  test('blocked by a workout: says it will wait, has NO button and cannot be "updated anyway"', () => {
    const c = describeUpdate('blocked-by-workout')!;
    assert.match(c.title, /will wait/);
    assert.match(c.body, /workout/);
    assert.match(c.body, /nothing will reload/);
    assert.equal(c.action, null);
    assert.equal(c.dismissible, false);
  });

  test('copy does not offer to update anyway', () => {
    for (const s of ['ready', 'blocked-by-workout'] as const) {
      assert.equal(/anyway|force|override/i.test(JSON.stringify(describeUpdate(s))), false);
    }
    assert.match(UPDATE_BLOCKED_TOAST, /will wait/);
    assert.match(OFFLINE_READY_TOAST.message, /without a connection/);
  });
});

describe('update banner behaviour (source)', () => {
  const src = read('src/components/pwa/PwaFeedback.tsx');

  test('applyUpdate is only called from the button handler, with no override', () => {
    assert.equal((src.match(/applyUpdate\(/g) ?? []).length, 1);
    assert.match(src, /const update = async \(\) => \{[\s\S]*await applyUpdate\(\);/);
    assert.equal(/allowDuringWorkout/.test(src), false);
    assert.match(src, /onClick=\{update\}/);
  });

  test('nothing reloads or applies on a timer or on mount', () => {
    assert.equal(/location\.reload|window\.location\.(assign|replace)|skipWaiting/.test(src), false);
    // the only interval just re-reads the workout flag
    assert.equal((src.match(/setInterval/g) ?? []).length, 1);
    assert.match(src, /setInterval\(\(\) => controller\.refresh\(\), 3000\)/);
  });

  test('the banner is a polite live region and the offline-ready toast fires once', () => {
    assert.match(src, /role="status"/);
    assert.match(src, /announcedOffline/);
    assert.match(src, /from 'sonner'/);
  });

  test('the signed-in shell renders it', () => {
    const layout = read('src/components/layout/AppLayout.tsx');
    assert.match(layout, /import \{ PwaFeedback \} from '@\/components\/pwa\/PwaFeedback'/);
    assert.match(layout, /<PwaFeedback \/>/);
  });
});

describe('last session fallback', () => {
  type S = { id: string };
  const net: S = { id: 'net' };
  const saved: S = { id: 'saved' };

  test('the network answer wins and the saved copy is not read', async () => {
    let read = 0;
    const r = await lastSessionWithFallback('Push', async () => net, () => { read++; return saved; });
    assert.equal(r, net);
    assert.equal(read, 0);
  });

  test('an empty network answer falls back to the saved copy', async () => {
    assert.equal(await lastSessionWithFallback('Push', async () => null, () => saved), saved);
  });

  test('a network lookup that throws falls back too', async () => {
    assert.equal(await lastSessionWithFallback('Push', async () => { throw new Error('Failed to fetch'); }, () => saved), saved);
  });

  test('no session anywhere stays null, and a broken saved copy never throws', async () => {
    assert.equal(await lastSessionWithFallback('Push', async () => null, () => null), null);
    assert.equal(await lastSessionWithFallback('Push', async () => null, () => { throw new Error('storage'); }), null);
  });

  test('the template name is passed through unchanged to both sources', async () => {
    const seen: string[] = [];
    await lastSessionWithFallback('Pull Day', async (n) => { seen.push(n); return null; }, (n) => { seen.push(n); return null; });
    assert.deepEqual(seen, ['Pull Day', 'Pull Day']);
  });
});

describe('Gym wiring', () => {
  const gym = read('src/pages/Gym.tsx');

  test('network last-session first, then getCachedLastSession, via the fallback helper', () => {
    assert.match(gym, /lastSessionWithFallback\(templateName, getLastSessionByTemplateName, getCachedLastSession\)/);
    assert.match(gym, /getLastSession=\{getLastSession\}/);
    assert.equal(/getLastSession=\{getLastSessionByTemplateName\}/.test(gym), false);
  });

  test('cached templates are labelled and can be retried', () => {
    assert.match(gym, /isCached/);
    assert.match(gym, /describeCachedTemplates\(cachedAt, Date\.now\(\)\)/);
    assert.match(gym, /data-offline-templates-notice/);
    assert.match(gym, /role="status"/);
    assert.match(gym, /refetchTemplates/);
  });

  test('cached-templates wording', () => {
    assert.equal(describeCachedTemplates(null, 1), null);
    const c = describeCachedTemplates(1_000_000, 1_000_000 + 3 * 3600_000)!;
    assert.match(c.title, /saved on this device/);
    assert.match(c.body, /3 h ago/);
    assert.match(c.body, /changing templates needs a connection/);
  });

  test('age wording', () => {
    assert.equal(formatAge(1000, 1000), 'just now');
    assert.equal(formatAge(0, 5 * 60_000), '5 min ago');
    assert.equal(formatAge(0, 90 * 60_000), '1 h ago');
    assert.equal(formatAge(0, 3 * 24 * 3600_000), '3 days ago');
    assert.equal(formatAge(5000, 1000), 'just now');
  });
});

describe('toast adapter retired', () => {
  test('the adapter files are gone', () => {
    assert.equal(existsSync(join(root, 'src/hooks/use-toast.ts')), false);
    assert.equal(existsSync(join(root, 'src/lib/notify.ts')), false);
  });

  test('nothing in src or tests imports or calls the legacy adapter', () => {
    const self = 'tests/pwaFeedback.test.ts';
    const offenders = [...walk('src'), ...walk('tests')]
      .filter((f) => f !== self && f !== 'tests/feedbackGuard.test.ts')
      .filter((f) => /@\/hooks\/use-toast|\.\/use-toast|lib\/notify|\buseToast\b|mapLegacyToast/.test(read(f)));
    assert.deepEqual(offenders, []);
  });

  test('the four migrated files use Sonner directly and keep their messages', () => {
    for (const f of ['src/components/ChatBot.tsx', 'src/pages/Messaging.tsx', 'src/pages/Welcome.tsx', 'src/pages/AdminApproval.tsx']) {
      const s = read(f);
      assert.match(s, /from ['"]sonner['"]/, f);
      assert.equal(/toast\(\{/.test(s), false, `${f} still uses the object-style call`);
    }
    const chat = read('src/components/ChatBot.tsx');
    assert.match(chat, /toast\.error\('Rate limit reached', \{ description: 'You can only send 5 messages per hour\. Please wait\.' \}\)/);
    assert.match(chat, /toast\('Action', \{ description: 'This feature is not available yet' \}\)/);
    assert.match(chat, /toast\.error\('Failed to send message\. Please try again\.'\)/);
    assert.match(read('src/pages/Welcome.tsx'), /toast\.error\("Demo login failed", \{ description: "Couldn't open the demo account\. Please try again\." \}\)/);
    assert.match(read('src/pages/Welcome.tsx'), /toast\.error\("Sign in failed", \{ description: "Unable to sign in with Google\. Please try again\." \}\)/);
    assert.match(read('src/pages/AdminApproval.tsx'), /toast\.success\('User has been approved'\)/);
    const msg = read('src/pages/Messaging.tsx');
    assert.match(msg, /toast\.success\(subscribe \? 'Subscribed to Telegram notifications' : 'Unsubscribed from Telegram notifications'\)/);
    assert.match(msg, /toast\.error\('Please enter a Telegram Chat ID'\)/);
  });

  test('the chat button lifts above Sonner toasts only (no second toast queue)', () => {
    const chat = read('src/components/ChatBot.tsx');
    assert.match(chat, /const visibleToasts = sonnerToasts\.length;/);
  });
});

describe('demo banner refresh', () => {
  const banner = read('src/components/DemoBanner.tsx');
  test('is event based and never reloads the page', () => {
    assert.match(banner, /requestAppRefresh\(\)/);
    assert.equal(/location\.reload|window\.location|reload\(\)/.test(banner), false);
  });
});
