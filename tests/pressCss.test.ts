import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

describe('shared press utility (src/index.css)', () => {
  test('squish scale is only applied when motion is allowed', () => {
    const m = css.match(/@media \(prefers-reduced-motion: no-preference\)\s*{([\s\S]*?\n {2}})\n/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('.press:active');
    expect(m![1]).toContain('scale: var(--press-scale)');
  });
  test('disabled, aria-disabled and busy controls never scale', () => {
    expect(css).toMatch(/\.press:active:not\(:disabled\):not\(\[aria-disabled="true"\]\):not\(\[aria-busy="true"\]\)/);
  });
  test('quick press (100ms), springy release (350ms, overshoot), colour transitions stay 150ms', () => {
    expect(css).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(css).toMatch(/transition-duration:\s*150ms, 150ms, 150ms, 150ms, 150ms, 350ms/);
    expect(css).toMatch(/transition-duration:\s*150ms, 150ms, 150ms, 150ms, 150ms, 100ms/);
    expect(css).toMatch(/transition-property:\s*color, background-color, border-color, box-shadow, opacity, scale/);
  });
  test('uses the standalone scale property so layout and translate utilities are untouched', () => {
    expect(css).not.toMatch(/\.press:active[^}]*transform/);
  });
  test('iOS touch :active is switched on at startup', () => {
    expect(main).toContain('enableTouchActive()');
  });
});
