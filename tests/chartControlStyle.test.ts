import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartRangeControls, ChartStyleControl } from '../src/components/ChartViewControls';
import { ChartTooltipCard } from '../src/components/charts/ChartTooltipCard';
import { CHART_COLORS, chartGridProps, chartXAxisProps } from '../src/lib/chartTheme';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/index.css');

describe('chart controls share one look (v1.10)', () => {
  test('range and line/bar switches carry the chart-segmented class, keep their radio roles and labels', () => {
    const range = renderToStaticMarkup(createElement(ChartRangeControls, { range: '7', setRange: () => {}, extended: true, label: 'Weight Trend' }));
    const style = renderToStaticMarkup(createElement(ChartStyleControl, { style: 'line', setStyle: () => {}, label: 'Weight Trend' }));
    for (const html of [range, style]) {
      expect(html).toContain('chart-segmented');
      expect(html).toContain('role="radio"');
    }
    for (const text of ['7D', '14D', '30D', '90D', 'All']) expect(range).toContain(`>${text}<`);
    expect(range).toContain('aria-label="Weight Trend range"');
    expect(style).toContain('aria-label="Weight Trend chart type"');
  });

  test('PDF, full screen and CSV buttons use the matching chart-action class', () => {
    for (const file of ['src/components/ChartPdfButton.tsx', 'src/components/charts/ChartFullscreenDialog.tsx']) {
      expect(read(file)).toContain('chart-action');
    }
  });

  test('selected = orange wash drawn by a pseudo-element, so the keyboard focus ring (a box-shadow) is never replaced', () => {
    const checked = css.match(/\.chart-segmented \[role='radio'\]\[data-state='checked'\] \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(checked).toContain('--glow-accent');
    expect(checked).not.toMatch(/(^|\n)\s*box-shadow:/);
    expect(css).toContain(".chart-segmented [role='radio'][data-state='checked']::after");
    const action = css.match(/\.chart-action\.chart-action \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(action).not.toMatch(/(^|\n)\s*(box-shadow|outline):/);
  });

  test('hover only on devices that hover', () => {
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.chart-segmented \[role='radio'\]\[data-state='unchecked'\]:hover/);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.chart-action\.chart-action:hover/);
  });

  test('plot furniture is a semantic role token in both themes, and data colours are unchanged', () => {
    for (const name of ['chart-gridline', 'chart-axisline', 'chart-cursor']) {
      expect(css.match(new RegExp(`--${name}:`, 'g'))?.length).toBe(2);
    }
    expect(CHART_COLORS.gridline).toBe('hsl(var(--chart-gridline))');
    expect(chartGridProps.stroke).toBe(CHART_COLORS.gridline);
    expect(chartXAxisProps.axisLine.stroke).toBe(CHART_COLORS.axisline);
    expect(CHART_COLORS.actual).toBe('hsl(var(--chart-actual))');
    expect(CHART_COLORS.min).toBe('hsl(var(--chart-min))');
    expect(CHART_COLORS.max).toBe('hsl(var(--chart-max))');
  });

  test('the tooltip keeps its title, labels, values and series swatches', () => {
    const html = renderToStaticMarkup(createElement(ChartTooltipCard, { title: '11/03', rows: [{ label: 'Min target', value: '2,000 cal', color: 'red' }] }));
    expect(html).toContain('chart-tooltip');
    for (const text of ['11/03', 'Min target', '2,000 cal']) expect(html).toContain(text);
    expect(html).toContain('background-color:red');
  });
});
