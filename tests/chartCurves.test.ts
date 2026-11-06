import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CHART_CURVE, TARGET_CURVE, curveFor, seriesHasGaps } from '../src/lib/chartCurves';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lines = (src: string) => src.match(/<Line [^>]*>/g) ?? [];

describe('curve choice per chart (documented in src/lib/chartCurves.ts)', () => {
  test('smooth only where the measure is continuous: weight, waist, body recomposition', () => {
    for (const id of ['weight', 'waist', 'body_recomposition']) expect(curveFor(id)).toBe('monotone');
  });
  test('daily totals and scores are drawn with straight segments', () => {
    for (const id of ['sleep', 'recovery', 'workout_duration', 'calorie_balance', 'macro_actual', 'report_sleep', 'unlisted-chart']) expect(curveFor(id)).toBe('linear');
  });
  test('targets hold one value per day (step), so a gym / rest change is a step, not a slide', () => {
    expect(TARGET_CURVE).toBe('step');
  });
  test('no overshooting curve type exists anywhere', () => {
    for (const curve of [...Object.values(CHART_CURVE), TARGET_CURVE]) expect(['linear', 'monotone', 'step']).toContain(curve);
    for (const file of ['TrendChart', 'MacroTargetChart', 'history/RecordTrendChart', 'BodyRecompositionCard', 'ReportCharts']) {
      expect(read(`src/components/${file}.tsx`)).not.toMatch(/type="(natural|basis|cardinal|bump|monotone)"/);
    }
  });
});

describe('every Line takes its curve from the shared rule', () => {
  test('TrendChart and RecordTrendChart use the chart id\'s curve', () => {
    for (const file of ['TrendChart', 'history/RecordTrendChart']) {
      const src = read(`src/components/${file}.tsx`);
      expect(src).toContain('const curve = curveFor(id);');
      expect(lines(src).every((l) => l.includes('type={curve}'))).toBe(true);
    }
  });
  test('MacroTargetChart: actual is linear, Min and Max are steps', () => {
    const ls = lines(read('src/components/MacroTargetChart.tsx'));
    expect(ls).toHaveLength(3);
    expect(ls.find((l) => l.includes('dataKey="actual"'))).toContain("type={curveFor('macro_actual')}");
    for (const key of ['min', 'max']) expect(ls.find((l) => l.includes(`dataKey="${key}"`))).toContain('type={TARGET_CURVE}');
  });
  test('Body Recomposition and the Reports sleep line use their documented curves', () => {
    expect(lines(read('src/components/BodyRecompositionCard.tsx')).every((l) => l.includes('type={curve}'))).toBe(true);
    expect(read('src/components/BodyRecompositionCard.tsx')).toContain("curveFor('body_recomposition')");
    expect(read('src/components/ReportCharts.tsx')).toContain("type={curveFor('report_sleep')}");
  });
});

describe('gaps stay gaps', () => {
  test('actual intake, Trend and Record lines never connect across missing values', () => {
    for (const file of ['TrendChart', 'history/RecordTrendChart', 'ReportCharts']) expect(read(`src/components/${file}.tsx`)).not.toContain('connectNulls');
    const macro = lines(read('src/components/MacroTargetChart.tsx'));
    expect(macro.find((l) => l.includes('dataKey="actual"'))).not.toContain('connectNulls');
  });
  test('the only joins across empty rows are the Min / Max targets and the two sparse body series (documented)', () => {
    const macro = lines(read('src/components/MacroTargetChart.tsx'));
    for (const key of ['min', 'max']) expect(macro.find((l) => l.includes(`dataKey="${key}"`))).toContain('connectNulls');
    expect(read('src/components/BodyRecompositionCard.tsx')).toContain('Every other chart leaves gaps as gaps');
  });
  test('a lone point between gaps still shows (dashed series get a dot when they have gaps)', () => {
    expect(read('src/components/TrendChart.tsx')).toContain('seriesHasGaps(shown, s.key)');
    expect(read('src/components/history/RecordTrendChart.tsx')).toContain('seriesHasGaps(shown, s.key)');
    expect(seriesHasGaps([{ a: 1 }, { a: null }, { a: 3 }], 'a')).toBe(true);
    expect(seriesHasGaps([{ a: 1 }, { a: 2 }], 'a')).toBe(false);
    expect(seriesHasGaps([{ a: null }, { a: null }], 'a')).toBe(false);
    expect(seriesHasGaps([{ a: 1 }, {}], 'a')).toBe(true);
  });
});
