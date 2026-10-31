import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Self-contained on purpose: reads the real CSS tokens so the ratios below are
// computed from what ships, with no imports from src/.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');
const tailwind = readFileSync(join(root, 'tailwind.config.ts'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector} block`);
  const end = css.indexOf('\n  }', start);
  const out: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const themes = { light: block(':root'), dark: block('.dark') };

function toRgb(hsl: string): [number, number, number] {
  const m = hsl.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  assert.ok(m, `token is not a plain "H S% L%" triple: ${hsl}`);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hsl: string) => {
  const [r, g, b] = toRgb(hsl).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// CIE76 distance in Lab, used only to make sure categorical colours are
// visibly different from each other.
function lab(hsl: string): [number, number, number] {
  const [r, g, b] = toRgb(hsl).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a: string, b: string) => {
  const [A, B] = [lab(a), lab(b)];
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

const surfaces = ['background', 'card', 'popover'];
const categorical = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];
const semantic = ['chart-actual', 'chart-min', 'chart-max', 'chart-warn'];

for (const [name, t] of Object.entries(themes)) {
  describe(`${name} theme contrast`, () => {
    test('body text on surfaces >= 4.5', () => {
      for (const s of surfaces) {
        const fg = s === 'background' ? 'foreground' : `${s}-foreground`;
        assert.ok(contrast(t[fg], t[s]) >= 4.5, `${fg} on ${s}`);
      }
    });

    test('muted-foreground is >= 4.5 on every surface and differs from foreground', () => {
      for (const s of [...surfaces, 'muted']) {
        assert.ok(contrast(t['muted-foreground'], t[s]) >= 4.5, `muted-foreground on ${s}: ${contrast(t['muted-foreground'], t[s]).toFixed(2)}`);
      }
      assert.notEqual(t['muted-foreground'], t.foreground);
      // Clearly a softer tier: foreground contrast is at least 1.5x the muted-foreground contrast.
      const gap = contrast(t.foreground, t.background) / contrast(t['muted-foreground'], t.background);
      assert.ok(gap >= 1.5, `foreground vs muted-foreground tier gap ${gap.toFixed(2)}`);
    });

    for (const role of ['primary', 'secondary', 'accent', 'destructive']) {
      test(`${role} / ${role}-foreground >= 4.5`, () => {
        const r = contrast(t[role], t[`${role}-foreground`]);
        assert.ok(r >= 4.5, `${role} pair ${r.toFixed(2)}`);
      });
    }

    test('primary and destructive also work as text on background and card', () => {
      for (const role of ['primary', 'destructive']) {
        for (const s of ['background', 'card']) {
          assert.ok(contrast(t[role], t[s]) >= 4.5, `${role} text on ${s}: ${contrast(t[role], t[s]).toFixed(2)}`);
        }
      }
    });

    test('accent surface is visible (>= 1.15:1) against background, card and popover for hover states', () => {
      for (const s of surfaces) {
        assert.ok(contrast(t.accent, t[s]) >= 1.15, `accent vs ${s}: ${contrast(t.accent, t[s]).toFixed(2)}`);
        assert.ok(contrast(t['accent-foreground'], t[s]) >= 4.5, `accent-foreground text on ${s}`);
      }
    });

    test('input boundary >= 3:1 against background, card and popover', () => {
      for (const s of surfaces) {
        assert.ok(contrast(t.input, t[s]) >= 3, `input vs ${s}: ${contrast(t.input, t[s]).toFixed(2)}`);
      }
    });

    test('focus ring >= 3:1 against background and card', () => {
      for (const s of ['background', 'card']) assert.ok(contrast(t.ring, t[s]) >= 3, `ring vs ${s}`);
    });

    test('chart roles >= 3:1 (and >= 4.5 so they can be text) on card and background', () => {
      for (const k of [...categorical, ...semantic]) {
        assert.ok(t[k], `missing --${k}`);
        for (const s of ['card', 'background']) {
          const r = contrast(t[k], t[s]);
          assert.ok(r >= 4.5, `${k} on ${s}: ${r.toFixed(2)}`);
        }
      }
    });

    test('progress track exists and meaningful fills are >= 3:1 on it', () => {
      assert.ok(t['progress-track']);
      for (const k of ['primary', 'chart-min', 'chart-max', 'chart-warn', 'chart-actual']) {
        const r = contrast(t[k], t['progress-track']);
        assert.ok(r >= 3, `${k} on progress-track: ${r.toFixed(2)}`);
      }
    });

    test('categorical chart colours are visibly distinct (deltaE >= 24)', () => {
      const keys = [...categorical, ...semantic];
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const d = deltaE(t[keys[i]], t[keys[j]]);
          assert.ok(d >= 24, `${keys[i]} vs ${keys[j]} deltaE ${d.toFixed(1)}`);
        }
      }
    });

    test('sidebar tokens mirror app tokens', () => {
      assert.equal(t['sidebar-background'], t.card);
      assert.equal(t['sidebar-foreground'], t.foreground);
      assert.equal(t['sidebar-primary'], t.primary);
      assert.equal(t['sidebar-primary-foreground'], t['primary-foreground']);
      assert.equal(t['sidebar-accent'], t.accent);
      assert.equal(t['sidebar-accent-foreground'], t['accent-foreground']);
      assert.equal(t['sidebar-border'], t.border);
      assert.equal(t['sidebar-ring'], t.ring);
    });
  });
}

describe('tailwind registrations', () => {
  test('every chart role and progress-track is registered', () => {
    for (const k of [...categorical, ...semantic, 'progress-track']) {
      assert.ok(tailwind.includes(`'${k}': 'hsl(var(--${k}))'`), `tailwind.config.ts missing ${k}`);
    }
  });
});
