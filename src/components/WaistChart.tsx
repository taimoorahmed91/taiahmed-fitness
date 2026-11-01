import { Ruler } from 'lucide-react';
import type { ChartDatasetStatus } from '@/lib/chartViewerData';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';
import { RecordTrendChart, type RecordChartLink } from '@/components/history/RecordTrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

/**
 * `recordId` / `entryCount` (and `recordLink`) are only given by the Waist page, whose rows are exact stored measurements
 * linked to its history list. Without them (the Dashboard) the chart is the plain daily-aggregate TrendChart, as before.
 */
interface WaistChartProps {
  data: { date: string; waist: number; recordId?: string; entryCount?: number }[];
  notesMap?: Map<string, DailyNote>;
  status?: ChartDatasetStatus;
  recordLink?: RecordChartLink;
}
const series = [{ key: 'waist', label: 'Waist', color: METRIC_COLORS.waist }];
const empty = 'No waist entries in this period. Try a wider date range.';
const summary = (rows: Record<string, unknown>[]) => {
  const latest = rows[rows.length - 1]?.waist;
  return latest != null && <>Latest: <span className="font-semibold text-foreground">{String(latest)}</span> {UNIT_LABEL.centimeters}</>;
};
const icon = <Ruler className="h-5 w-5 text-primary" />;
export const WaistChart = ({ data, notesMap, status, recordLink }: WaistChartProps) =>
  recordLink
    ? <RecordTrendChart status={status} extendedRanges id="waist" title="Waist Trend" icon={icon} data={data.filter(d => d.waist > 0)} series={series} unit={UNIT_LABEL.centimeters} empty={empty} summary={summary} link={recordLink} />
    : <TrendChart status={status} extendedRanges id="waist" title="Waist Trend" icon={icon} data={data.filter(d => d.waist > 0)} series={series} unit={UNIT_LABEL.centimeters} notesMap={notesMap} empty={empty} summary={summary} />;
