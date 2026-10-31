import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Sonner is the only toaster mounted', () => {
  const app = read('src/App.tsx');
  assert.equal((app.match(/<Sonner\b/g) ?? []).length, 1);
  assert.equal(/ui\/toaster|ToastProvider|ui\/toast['"]/.test(app), false);
  assert.equal(existsSync(new URL('../src/components/ui/toaster.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/components/ui/toast.tsx', import.meta.url)), false);
});

test('no data hook imports the legacy toast adapter', () => {
  const dir = new URL('../src/hooks/', import.meta.url);
  const offenders = readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'use-toast.ts')
    .filter((f) => /@\/hooks\/use-toast|\buseToast\b/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the legacy toast adapter is gone and nothing imports it', () => {
  assert.equal(existsSync(new URL('../src/hooks/use-toast.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/lib/notify.ts', import.meta.url)), false);
});

test('header refresh is answered by useAutoRefresh with its own refetchAll', () => {
  const hook = read('src/hooks/useAutoRefresh.ts');
  assert.match(hook, /APP_REFRESH_EVENT/);
  assert.match(hook, /createRefreshEventHandler\(refetchAll\)/);
  assert.equal(/location\.reload/.test(hook), false);
});

test('dashboard tiles never show a literal "..." placeholder', () => {
  assert.equal(/'\.\.\.'/.test(read('src/components/StatsCards.tsx')), false);
});
