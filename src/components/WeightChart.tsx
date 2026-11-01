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
  /**
   * Dashboard opt-in: rows that carry an exact `recordId` (see src/lib/dashboardRecordRows.ts), so that when both picked days are
   * weigh-ins the viewer's A / B comparison can also Open in Compare. Off by default: the chart still compares two days in the viewer
   * (B - A), but never links, so any other use of the plain chart stays a daily aggregate.
   */
  compare?: boolean;
}
const series = [{ key: 'weight', label: 'Weight', color: METRIC_COLORS.weight }];
const empty = 'No weight entries in this period. Try a wider date range.';
const summary = (rows: Record<string, unknown>[]) => {
  const latest = rows[rows.length - 1]?.weight;
  return latest != null && <>Latest: <span className="font-semibold text-foreground">{String(latest)}</span> {UNIT_LABEL.kilograms}</>;
};
const rowRecordId = (row: Record<string, unknown>) => (typeof row.recordId === 'string' && row.recordId !== '' && typeof row.weight === 'number' ? row.recordId : undefined);
const compareSelection = { recordId: rowRecordId, compare: { valueKey: 'weight', noun: 'weight entry', unit: UNIT_LABEL.kilograms } };
const icon = <Scale className="h-5 w-5 text-primary" />;
export const WeightChart = ({ data, notesMap, status, recordLink, compare }: WeightChartProps) =>
  recordLink
    ? <RecordTrendChart status={status} extendedRanges id="weight" title="Weight Trend" icon={icon} data={data.filter(d => d.weight > 0)} series={series} unit={UNIT_LABEL.kilograms} empty={empty} summary={summary} link={recordLink} />
    : <TrendChart status={status} extendedRanges id="weight" title="Weight Trend" icon={icon} data={data.filter(d => d.weight > 0)} series={series} unit={UNIT_LABEL.kilograms} notesMap={notesMap} empty={empty} summary={summary} daySelection={compare ? compareSelection : undefined} />;
