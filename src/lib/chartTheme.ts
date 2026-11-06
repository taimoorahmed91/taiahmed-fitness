// One place for how every chart looks. Colours are semantic roles defined in
// index.css (both themes), never raw hues.
//
// Meaning -> colour (keep these stable across cards and charts):
//   actual intake        chart-actual (neutral, strongest line)
//   min target / on target / good change   chart-min  (green)
//   max target / over max / bad change     chart-max  (red)
//   under min / behind / caution           chart-warn (amber)
//   note marker          foreground diamond (not a status colour)
// Metrics (one hue each, so a metric looks the same everywhere):
//   calories chart-1, protein chart-2, carbs chart-3, sleep chart-4,
//   weight chart-5, waist chart-3, WHOOP-sourced data chart-2.

/** Smallest text size (px) allowed on a chart: ticks, legend, tooltip, labels. */
export const MIN_CHART_FONT_SIZE = 12;

const v = (name: string) => `hsl(var(--${name}))`;

export const CHART_COLORS = {
  actual: v('chart-actual'),
  min: v('chart-min'),
  max: v('chart-max'),
  warn: v('chart-warn'),
  muted: v('muted-foreground'),
  grid: v('border'),
  /** Hairline gridlines, the axis line and the hover cursor (alpha tokens, see index.css). Decorative: data never relies on them. */
  gridline: v('chart-gridline'),
  axisline: v('chart-axisline'),
  cursor: v('chart-cursor'),
  card: v('card'),
  foreground: v('foreground'),
} as const;

export const METRIC_COLORS = {
  calories: v('chart-1'),
  protein: v('chart-2'),
  carbs: v('chart-3'),
  sleep: v('chart-4'),
  weight: v('chart-5'),
  waist: v('chart-3'),
  workout: v('chart-2'),
  whoop: v('chart-2'),
} as const;

export type MetricColor = keyof typeof METRIC_COLORS;

/** Categorical slices with no status meaning (time-of-day etc.). */
export const CATEGORY_COLORS = [v('chart-3'), v('chart-1'), v('chart-2'), v('chart-4'), v('chart-5'), v('chart-actual')] as const;

export const CHART_MARGIN = { top: 10, right: 10, left: 0, bottom: 0 } as const;
export const CHART_Y_AXIS_WIDTH = 44;
export const CHART_HEIGHT = 250;

const tick = { fill: CHART_COLORS.muted, fontSize: MIN_CHART_FONT_SIZE };

export const chartXAxisProps = {
  tick,
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.axisline },
  minTickGap: 16,
} as const;

export const chartYAxisProps = {
  tick,
  tickLine: false,
  axisLine: false,
  width: CHART_Y_AXIS_WIDTH,
} as const;

// Solid hairlines, not dashes: the Min / Max target lines are dashed and dotted, so a solid, faint grid keeps targets
// clearly apart from it.
export const chartGridProps = {
  vertical: false,
  stroke: CHART_COLORS.gridline,
} as const;

/** For Recharts' default tooltip. Custom tooltips use ChartTooltipCard instead. */
export const chartTooltipProps = {
  contentStyle: {
    backgroundColor: 'hsl(var(--popover) / 0.97)',
    border: '1px solid hsl(var(--panel-edge) / 0.2)',
    borderRadius: 10,
    boxShadow: '0 14px 32px -12px hsl(var(--panel-shadow) / 0.7)',
    padding: '8px 12px',
    color: CHART_COLORS.foreground,
    fontSize: MIN_CHART_FONT_SIZE,
  },
  labelStyle: { color: CHART_COLORS.foreground, fontWeight: 600, fontSize: MIN_CHART_FONT_SIZE, marginBottom: 2 },
  itemStyle: { fontSize: MIN_CHART_FONT_SIZE, paddingTop: 1, paddingBottom: 1 },
  // A soft band behind the hovered bars; on line charts the same colour is the thin vertical cursor.
  cursor: { fill: CHART_COLORS.cursor, stroke: CHART_COLORS.axisline, strokeWidth: 1, strokeDasharray: '2 3' },
} as const;

export const chartLegendProps = {
  wrapperStyle: { fontSize: MIN_CHART_FONT_SIZE, color: CHART_COLORS.muted, paddingTop: 6 },
} as const;

export const chartDotStroke = CHART_COLORS.card;

/** Standard unit spelling so "calories", "kcal" and "cal" never mix. */
export const UNIT_LABEL = {
  calories: 'cal',
  grams: 'g',
  kilograms: 'kg',
  centimeters: 'cm',
  hours: 'hrs',
  minutes: 'min',
  percent: '%',
} as const;

export const formatNumber = (value: number, digits?: number) =>
  Number(value).toLocaleString('en-US', digits == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "1,250 cal", "82.4 kg", "73%". Percent has no space. */
export const formatChartValue = (value: number | null | undefined, unit = '', digits?: number) => {
  if (value == null || !Number.isFinite(value)) return '--';
  const n = formatNumber(value, digits);
  if (!unit) return n;
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
};

/** "+0.4 kg" / "−0.4 kg" with a real minus sign, for changes. */
export const formatSigned = (value: number, unit = '', digits = 2) => {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}${formatNumber(Math.abs(value), digits)}${unit ? ` ${unit}` : ''}`;
};
