import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';

// Runs the mounted (real DOM) tests in tests/mounted/. Each file runs in its own process, so the fake
// DOM and the module stubs it installs can never leak into the other tests.
// jsdom is a dev dependency, so after `bun install` it is found automatically; JSDOM_PATH still
// overrides it (point it at any other copy). `bun run test` sets REQUIRE_MOUNTED=1, which turns a
// missing jsdom into a failure instead of a skip, so the canonical run can never pass without the DOM suites.
// Plain `bun test` keeps working without jsdom: the mounted files are skipped, everything else runs.
const requireMounted = process.env.REQUIRE_MOUNTED === '1';
const jsdomPath = process.env.JSDOM_PATH ?? 'jsdom';
const hasJsdom = (() => {
  try {
    createRequire(import.meta.url).resolve(jsdomPath);
    return true;
  } catch {
    return false;
  }
})();

const files = readdirSync(new URL('./mounted/', import.meta.url)).filter((f) => f.endsWith('.dom.tsx'));

/** Reads "N pass" / "N skip" / "N fail" from a child `bun test` summary. */
const count = (output: string, word: 'pass' | 'skip' | 'fail') => Number(new RegExp(`^\\s*(\\d+) ${word}\\b`, 'm').exec(output)?.[1] ?? 0);

describe('mounted tests (real DOM, separate process)', () => {
  test('there are mounted test files', () => {
    assert.ok(files.length >= 2);
  });
  test('jsdom is available when mounted suites are required', () => {
    if (requireMounted) assert.ok(hasJsdom, 'jsdom is missing: run `bun install` (it is a devDependency) or set JSDOM_PATH');
  });
  for (const file of files) {
    test.skipIf(!hasJsdom)(`${file} passes`, () => {
      const result = spawnSync(process.execPath, ['test', `./tests/mounted/${file}`], {
        cwd: new URL('../', import.meta.url).pathname,
        env: { ...process.env, JSDOM_PATH: jsdomPath },
        encoding: 'utf8',
        timeout: 90_000,
      });
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 0, `${file} failed:\n${output}`);
      // Proof the DOM suite really ran: at least one test passed and none were skipped.
      assert.ok(count(output, 'pass') > 0, `${file} ran no passing tests:\n${output}`);
      assert.equal(count(output, 'skip'), 0, `${file} skipped tests:\n${output}`);
    }, 120_000);
  }
}, { timeout: 120_000 });
