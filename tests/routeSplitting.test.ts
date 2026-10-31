import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const app = read('src/App.tsx');
const pageFiles = readdirSync(join(root, 'src/pages')).filter((f) => f.endsWith('.tsx')).map((f) => f.replace(/\.tsx$/, ''));

describe('route code splitting', () => {
  test('no page is imported statically in App.tsx', () => {
    const staticPageImports = app.match(/^import\s.+from\s+["']\.\/pages\/.+["'];?$/gm) ?? [];
    assert.deepEqual(staticPageImports, []);
  });

  test('every page file is a lazy() dynamic import that is actually routed', () => {
    for (const page of pageFiles) {
      const lazyDecl = new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(["']\\./pages/${page}["']\\)\\);`);
      assert.match(app, lazyDecl, `${page} should be lazy-loaded`);
      assert.match(app, new RegExp(`<${page} />`), `${page} should still be routed`);
    }
  });

  test('tiny shared pieces stay static (providers, layout shell, ChatBot)', () => {
    for (const name of ['UserProvider', 'AppLayout', 'ChatBot']) {
      assert.doesNotMatch(app, new RegExp(`const ${name} = lazy`), `${name} must not be lazy`);
    }
  });

  test('lazy pages sit under Suspense with an accessible status fallback', () => {
    assert.match(app, /<Suspense fallback=\{<LoadingSpinner \/>\}>/, 'outer boundary for pages outside the shell');
    assert.match(app, /<Suspense fallback=\{<PageFallback \/>\}>\s*<Outlet \/>/, 'inner boundary keeps the shell mounted');
    const fallback = app.slice(app.indexOf('const PageFallback'), app.indexOf('const LayoutPageBoundary'));
    assert.match(fallback, /role="status"/);
    assert.match(fallback, /aria-live="polite"/);
    assert.match(fallback, /sr-only/);
    assert.match(fallback, /motion-safe:animate-spin/, 'spinner must respect reduced motion');
  });

  test('auth and layout wiring is unchanged', () => {
    assert.match(app, /<ProtectedRoute>\s*<AppLayout \/>\s*<\/ProtectedRoute>/);
    assert.match(app, /path="\*" element=\{<NotFound \/>\}/);
    assert.match(app, /isLoggedIn \? getLoggedInRedirect\(\) : <Welcome \/>/);
  });
});

describe('Reports export', () => {
  const reports = read('src/pages/Reports.tsx');

  test('html2canvas is never imported statically', () => {
    assert.doesNotMatch(reports, /^import\s.*from\s+['"]html2canvas['"]/m);
    assert.match(reports, /await import\(['"]html2canvas['"]\)/);
  });

  test('both export paths go through the lazy loader', () => {
    assert.equal((reports.match(/renderSummaryCanvas\(summaryRef\.current\)/g) ?? []).length, 2);
    assert.match(reports, /backgroundColor: null, scale: 2/, 'export options preserved');
  });
});

describe('fonts and dead assets', () => {
  const css = read('src/index.css');

  test('no render-blocking font imports and no Libre Caslon in CSS', () => {
    assert.doesNotMatch(css, /@import\s+url\(/);
    assert.doesNotMatch(css, /fonts\.googleapis\.com/);
    assert.doesNotMatch(css, /Libre Caslon/i);
  });

  test('font stacks are system-first and end in a generic family', () => {
    const decl = (name: string) => css.match(new RegExp(`--font-${name}:\\s*([^;]+);`))?.[1] ?? '';
    assert.match(decl('sans'), /^ui-sans-serif.*sans-serif$/);
    assert.match(decl('serif'), /^ui-serif.*serif$/);
    assert.match(decl('mono'), /^ui-monospace.*monospace$/);
  });

  test('the unused Vite starter stylesheet is gone and not imported', () => {
    assert.equal(existsSync(join(root, 'src/App.css')), false);
    assert.doesNotMatch(app, /App\.css/);
    assert.doesNotMatch(read('src/main.tsx'), /App\.css/);
  });
});

describe('vite config', () => {
  const config = read('vite.config.ts');

  test('vendor chunks are explicit, directory-matched and do not force PDF libs up front', () => {
    assert.match(config, /manualChunks/);
    assert.match(config, /vendor-charts/);
    assert.match(config, /vendor-supabase/);
    assert.match(config, /vendor-core/);
    const body = config.slice(config.indexOf('const manualChunks'), config.indexOf('// https://vitejs.dev/config/'));
    assert.doesNotMatch(body, /jspdf|html2canvas|pdf/i);
  });

  test('PWA policy is untouched', () => {
    assert.match(config, /registerType: "prompt"/);
    assert.match(config, /skipWaiting: false/);
    assert.match(config, /clientsClaim: false/);
    assert.match(config, /injectRegister: false/);
    assert.match(config, /importScripts: \["sw-recovery\.js"\]/);
    assert.equal((config.match(/handler: "NetworkOnly"/g) ?? []).length, 2, 'both NetworkOnly rules stay');
    assert.match(config, /\.\.\.neverCache\.map\(\(urlPattern\) => \(\{ urlPattern, handler: "NetworkOnly"/);
  });
});
