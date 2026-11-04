import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimatedNumber } from '../src/components/ui/animated-number';
import { buttonVariants } from '../src/components/ui/button';

const render = (props: Parameters<typeof AnimatedNumber>[0]) => renderToStaticMarkup(createElement(AnimatedNumber, props));
const textOf = (html: string) => html.replace(/<[^>]+>/g, '');

describe('AnimatedNumber markup', () => {
  test('the DOM text is exactly the formatted value, once (no stacks of 0-9)', () => {
    expect(textOf(render({ value: 1234.5, format: (v) => v.toLocaleString('en-US', { minimumFractionDigits: 1 }), suffix: ' kg' }))).toBe('1,234.5 kg');
    expect(textOf(render({ value: 72.5 }))).toBe('72.5');
  });
  test('fallback text is kept exactly', () => {
    expect(textOf(render({ value: null }))).toBe('—');
    expect(textOf(render({ value: undefined, fallback: '--' }))).toBe('--');
  });
  test('screen readers get the real value; the columns are aria-hidden', () => {
    const html = render({ value: 305 });
    expect(html).toContain('<span class="sr-only">305</span>');
    expect(html).toContain('aria-hidden="true"');
  });
  test('one rolling column per digit, none for separators or units', () => {
    const html = render({ value: 1234, format: (v) => v.toLocaleString('en-US'), suffix: ' cal' });
    expect(html.match(/data-d="0"/g)?.length).toBe(4);
    expect(html).toContain('data-c=","');
  });
  test('each column starts on its digit (no animation on first render) and honours reduced motion', () => {
    const html = render({ value: 30 });
    expect(html).toContain('translateY(-30%)');
    expect(html).toContain('transition-delay:0ms');
    expect(html).toContain('motion-reduce:transition-none');
    expect(html).toContain('tabular-nums');
  });
});

describe('press feedback', () => {
  test('every Button variant and size carries the shared press class and the reduced-motion switch', () => {
    for (const variant of ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const) {
      const c = buttonVariants({ variant });
      expect(c).toMatch(/\bpress\b/);
      expect(c).toContain('motion-reduce:transition-none');
    }
  });
  test('link buttons do not squish', () => {
    expect(buttonVariants({ variant: 'link' })).toContain('[--press-scale:1]');
  });
});
