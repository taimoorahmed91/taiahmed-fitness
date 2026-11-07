import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every disclosure animates: the panel grows open (height), the chevron turns, and reduced motion turns it all off.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('collapsible animation foundation', () => {
  const tw = read('tailwind.config.ts');
  test('tailwind has collapsible-down / collapsible-up on the Radix collapsible height variable', () => {
    assert.match(tw, /'collapsible-down':\s*\{[\s\S]*?--radix-collapsible-content-height/);
    assert.match(tw, /'collapsible-up':\s*\{[\s\S]*?--radix-collapsible-content-height/);
    assert.match(tw, /'collapsible-down': 'collapsible-down 0\.4s/);
    assert.match(tw, /'collapsible-up': 'collapsible-up 0\.4s/);
  });
  test('the keyframes clip only while animating (no static overflow-hidden, so focus rings are never cut off)', () => {
    assert.match(tw, /'collapsible-down':\s*\{[\s\S]*?overflow: 'hidden'/);
    const content = read('src/components/ui/collapsible.tsx');
    assert.doesNotMatch(content, /(^|[\s"])overflow-hidden/);
  });
  test('CollapsibleContent animates both ways and turns off for reduced motion', () => {
    const content = read('src/components/ui/collapsible.tsx');
    assert.match(content, /data-\[state=open\]:animate-collapsible-down/);
    assert.match(content, /data-\[state=closed\]:animate-collapsible-up/);
    assert.match(content, /motion-reduce:animate-none/);
    assert.match(content, /forwardRef/);
  });
  test('CollapsePanel (always-mounted variant) slides the row and respects reduced motion', () => {
    const panel = read('src/components/ui/collapse-panel.tsx');
    assert.match(panel, /grid-rows-\[0fr\]/);
    assert.match(panel, /grid-rows-\[1fr\]/);
    assert.match(panel, /motion-reduce:transition-none/);
  });
});

describe('disclosures use the animated panels', () => {
  const COLLAPSIBLE = [
    'src/components/history/HistoryRow.tsx',
    'src/components/history/HistoryTile.tsx',
    'src/components/insights/InsightEvidence.tsx',
    'src/pages/ActivityLogs.tsx',
    'src/pages/WhoopData.tsx',
    'src/components/WorkoutTemplateList.tsx',
    'src/components/GoalsCard.tsx',
    'src/components/EditWorkoutSessionModal.tsx',
    'src/components/ActiveWorkoutModal.tsx',
  ];
  for (const file of COLLAPSIBLE) {
    test(`${file}: Collapsible, no hand-rolled hidden panel`, () => {
      const src = read(file);
      assert.match(src, /CollapsibleContent/);
      assert.doesNotMatch(src, /hidden=\{!/);
    });
  }
  for (const file of ['src/components/history/TrendSection.tsx', 'src/components/ui/filter-disclosure.tsx', 'src/components/charts/ChartFigure.tsx']) {
    test(`${file}: always-mounted CollapsePanel (children must stay mounted)`, () => {
      assert.match(read(file), /<CollapsePanel/);
    });
  }
  test('ChartFigure keeps the PDF-export and style hooks on the summary wrapper', () => {
    assert.match(read('src/components/charts/ChartFigure.tsx'), /data-chart-summary data-html2canvas-ignore="true" className="chart-footer/);
  });
  test('no panel passes padding or space-y on CollapsibleContent itself (it makes the height animation jump)', () => {
    for (const file of COLLAPSIBLE) {
      for (const m of read(file).matchAll(/<CollapsibleContent([^>]*)>/g)) {
        assert.doesNotMatch(m[1], /className="[^"]*\b(p[trblxy]?-\d|space-y|my?-\d)/, `${file}: ${m[0]}`);
      }
    }
  });
});
