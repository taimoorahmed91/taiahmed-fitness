import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { TrendChart } from './TrendChart';
import { CHART_COLORS, METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';
import { formatChartDate, isIsoDate } from '@/lib/chartRange';

type BalanceRow = { date: string; consumed: number; burned: number; balance: number };
interface CalorieBalanceChartProps { data: BalanceRow[] }

/**
 * One row per UTC calendar day, oldest first. The x-axis is a category axis keyed by `date`, so two rows
 * with the same date would draw two points on one tick and repeat that date's label. When a day appears
 * more than once, the later row in the input wins. Rows without an ISO `YYYY-MM-DD` date cannot be placed
 * on the calendar axis and are left out.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const calorieBalanceRows = (data: BalanceRow[]): BalanceRow[] => {
  const byDate = new Map<string, BalanceRow>();
  for (const row of data) if (isIsoDate(row.date)) byDate.set(row.date, row);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

/** The label each x-axis tick shows: the row's own UTC date as MM/DD (a string slice, no timezone maths). */
// eslint-disable-next-line react-refresh/only-export-components
export const calorieBalanceTickLabels = (rows: BalanceRow[]): string[] => rows.map((row) => formatChartDate(row.date));

const series = [
  { key: 'consumed', label: 'Meals Consumed', color: METRIC_COLORS.calories },
  { key: 'burned', label: 'WHOOP Burned', color: METRIC_COLORS.whoop, dashed: true },
  { key: 'balance', label: 'Balance (deficit +)', color: CHART_COLORS.actual, dashed: true },
];
const signed = (n: number) => `${n >= 0 ? '+' : '\u2212'}${Math.abs(n)}`;
export const CalorieBalanceChart = ({ data }: CalorieBalanceChartProps) => {
  const rows = useMemo(() => calorieBalanceRows(data), [data]);
  return <TrendChart id="calorie_balance" title="Calorie Balance" icon={<Scale className="h-5 w-5 text-primary" />} data={rows} series={series} unit={UNIT_LABEL.calories} empty="No days with both WHOOP and meal data in this period. Try a wider date range." summary={shown => {
    const latest = shown[shown.length - 1]?.balance;
    const total = shown.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
    return <>{latest != null && `Latest: ${signed(Number(latest))} ${UNIT_LABEL.calories} · `}Total: {signed(total)} {UNIT_LABEL.calories}</>;
  }} />;
};
