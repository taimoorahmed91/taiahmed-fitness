import { Scale } from 'lucide-react';
import type { ChartDatasetStatus } from '@/lib/chartViewerData';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';
import { RecordTrendChart, type RecordChartLink } from '@/components/history/RecordTrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

/**
 * `recordId` / `entryCount` (and `recordLink`) are only given by the Weight page, whose rows are exact stored weigh-ins
 * linked to its history list. Without them (the Dashboard) the chart is the plain daily-aggregate TrendChart, as before.
 */
interface WeightChartProps {
  data: { date: string; weight: number; recordId?: string; entryCount?: number }[];
  notesMap?: Map<string, DailyNote>;
  status?: ChartDatasetStatus;
  recordLink?: RecordChartLink;
}
const series = [{ key: 'weight', label: 'Weight', color: METRIC_COLORS.weight }];
const empty = 'No weight entries in this period. Try a wider date range.';
const summary = (rows: Record<string, unknown>[]) => {
  const latest = rows[rows.length - 1]?.weight;
  return latest != null && <>Latest: <span className="font-semibold text-foreground">{String(latest)}</span> {UNIT_LABEL.kilograms}</>;
};
const icon = <Scale className="h-5 w-5 text-primary" />;
export const WeightChart = ({ data, notesMap, status, recordLink }: WeightChartProps) =>
  recordLink
    ? <RecordTrendChart status={status} extendedRanges id="weight" title="Weight Trend" icon={icon} data={data.filter(d => d.weight > 0)} series={series} unit={UNIT_LABEL.kilograms} empty={empty} summary={summary} link={recordLink} />
    : <TrendChart status={status} extendedRanges id="weight" title="Weight Trend" icon={icon} data={data.filter(d => d.weight > 0)} series={series} unit={UNIT_LABEL.kilograms} notesMap={notesMap} empty={empty} summary={summary} />;
