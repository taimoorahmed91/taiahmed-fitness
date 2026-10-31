import { useEffect, useState } from 'react';
import { BarChart3, LineChart } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CHART_RANGES, ChartRange, ChartStyle, RANGE_LABELS, STANDARD_RANGES, clampRange } from '@/lib/chartRange';

// Range helpers live in @/lib/chartRange (pure, tested). Re-exported so existing imports keep working.
export { chartDateLabel, recentChartData } from '@/lib/chartRange';
export type { ChartRange, ChartStyle } from '@/lib/chartRange';

interface PreferenceOptions {
  /** Ranges this chart can show. Defaults to 7/14/30/90. */
  allowed?: readonly ChartRange[];
  /** Old storage prefix to read once when nothing is saved under the new key. */
  legacyPrefix?: string;
}

const readPreference = <T extends string>(keys: string[], values: readonly T[], fallback: T): T => {
  try {
    for (const key of keys) {
      const stored = localStorage.getItem(key) as T | null;
      if (stored && values.includes(stored)) return stored;
    }
  } catch { /* Storage may be unavailable. */ }
  return fallback;
};

const save = (key: string, value: string) => {
  try { localStorage.setItem(key, value); }
  catch { /* Storage may be unavailable. */ }
};

/**
 * Saved date range for one chart, stored under that chart's own key
 * (`fittrack_chart_<key>_range`). Charts never share a range: changing it on
 * one chart changes only that chart, even when many sit on the same page.
 * If a chart does not offer the saved range (for example "All"), it shows the
 * widest range it does support.
 */
export const useChartRange = (key: string, options: PreferenceOptions = {}) => {
  const allowed = options.allowed ?? STANDARD_RANGES;
  const storageKey = `fittrack_chart_${key}_range`;
  const [ownRange, setRange] = useState<ChartRange>(() =>
    readPreference<ChartRange>([storageKey, ...(options.legacyPrefix ? [`${options.legacyPrefix}_range`] : [])], CHART_RANGES, '7'));

  useEffect(() => { save(storageKey, ownRange); }, [storageKey, ownRange]);

  return { range: clampRange(ownRange, allowed), setRange };
};

export const useChartView = (key: string, defaultStyle: ChartStyle = 'line', options: PreferenceOptions = {}) => {
  const { range, setRange } = useChartRange(key, options);
  const [style, setStyle] = useState<ChartStyle>(() =>
    readPreference<ChartStyle>([`fittrack_chart_${key}_style`, ...(options.legacyPrefix ? [`${options.legacyPrefix}_style`] : [])], ['line', 'bar'], defaultStyle));

  useEffect(() => { save(`fittrack_chart_${key}_style`, style); }, [key, style]);

  return { range, setRange, style, setStyle };
};

const RANGE_SHORT: Record<ChartRange, string> = { '7': '7D', '14': '14D', '30': '30D', '90': '90D', all: 'All' };

interface RangeProps {
  range: ChartRange;
  setRange: (range: ChartRange) => void;
  /** Offer "All time" too. */
  extended?: boolean;
  /** Chart name, so screen readers hear "Weight Trend range". */
  label?: string;
}

/** Date range only. Use for categorical charts (pie, grids) where line/bar does not apply. */
export const ChartRangeControls = ({ range, setRange, extended = false, label }: RangeProps) => {
  const ranges = extended ? CHART_RANGES : STANDARD_RANGES;
  return (
    <div className="min-w-0 max-w-full" data-html2canvas-ignore="true">
      <SegmentedControl<ChartRange>
        size="sm"
        // Compact buttons, and wrap inside the card instead of pushing the page wider. The range always sits on its
        // own row in ChartHeader (the first control row), so it never competes with the actions for width.
        className="max-w-full flex-wrap [&>button]:px-2"
        ariaLabel={label ? `${label} range` : 'Chart range'}
        value={range}
        onValueChange={setRange}
        options={ranges.map((r) => ({ value: r, label: RANGE_SHORT[r], ariaLabel: RANGE_LABELS[r] }))}
      />
    </div>
  );
};

interface StyleProps {
  style: ChartStyle;
  setStyle: (style: ChartStyle) => void;
  /** Chart name, so screen readers hear "Weight Trend chart type". */
  label?: string;
}

/** Line / bar switch on its own: ChartHeader puts it first in the actions row, before PDF and full screen. */
export const ChartStyleControl = ({ style, setStyle, label }: StyleProps) => (
  <div className="min-w-0 max-w-full" data-html2canvas-ignore="true">
    <SegmentedControl<ChartStyle>
      size="sm"
      className="max-w-full [&>button]:px-2"
      ariaLabel={label ? `${label} chart type` : 'Chart type'}
      value={style}
      onValueChange={setStyle}
      options={[
        { value: 'line', ariaLabel: 'Line chart', label: <LineChart aria-hidden="true" /> },
        { value: 'bar', ariaLabel: 'Bar chart', label: <BarChart3 aria-hidden="true" /> },
      ]}
    />
  </div>
);
