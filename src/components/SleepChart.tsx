import { Moon } from 'lucide-react';
import type { ChartDatasetStatus } from '@/lib/chartViewerData';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';
import { RecordTrendChart, type RecordChartLink } from '@/components/history/RecordTrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

/**
 * `recordId` / `entryCount` (and `recordLink`) are only given by the Sleep page. `recordId` is the exact MANUAL sleep record
 * behind a day's `hours`; WHOOP hours are a daily aggregate and never carry one. Without them (the Dashboard) the chart is the
 * plain daily-aggregate TrendChart, as before.
 */
interface SleepChartProps {
  data: { date: string; hours: number; whoopHours?: number; recordId?: string; entryCount?: number }[];
  notesMap?: Map<string, DailyNote>;
  status?: ChartDatasetStatus;
  recordLink?: RecordChartLink;
  /**
   * Dashboard opt-in: rows from src/lib/dashboardRecordRows.ts carry the exact MANUAL record id, so when both picked days have a manual entry
   * the viewer's A / B comparison can also Open in Compare (manual records only). The comparison itself covers manual AND WHOOP hours wherever
   * observed, in the viewer. A WHOOP-only day is a daily aggregate: comparable in the viewer, never a link. Off by default.
   */
  compare?: boolean;
}
const series = [
  { key: 'hours', label: 'Manual Sleep', color: METRIC_COLORS.sleep },
  { key: 'whoopHours', label: 'WHOOP In Bed', color: METRIC_COLORS.whoop, dashed: true },
];
const empty = 'No sleep data in this period. Try a wider date range.';
const summary = (rows: Record<string, unknown>[]) => {
  const avg = (key: 'hours' | 'whoopHours') => {
    const values = rows.map(d => d[key]).filter((value): value is number => typeof value === 'number' && value > 0);
    return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : null;
  };
  return <>{avg('hours') && `Manual avg: ${avg('hours')} ${UNIT_LABEL.hours}`}{avg('hours') && avg('whoopHours') && ' · '}{avg('whoopHours') && `WHOOP avg: ${avg('whoopHours')} ${UNIT_LABEL.hours}`}</>;
};
/** Only a row with a manual number AND a record id is one exact manual record; a WHOOP-only day stays a daily aggregate. */
const rowRecordId = (row: Record<string, unknown>) => (typeof row.recordId === 'string' && row.recordId !== '' && typeof row.hours === 'number' ? row.recordId : undefined);
const compareSelection = { recordId: rowRecordId, compare: { valueKey: 'hours', noun: 'manual sleep entry', unit: UNIT_LABEL.hours } };
const icon = <Moon className="h-5 w-5 text-primary" />;
/** Days with nothing drawable are dropped; a 0 means "no value" (not a real 0 hours), so it becomes null. */
const plotRows = (data: SleepChartProps['data']) => data.filter(d => d.hours > 0 || (d.whoopHours ?? 0) > 0).map(d => ({ ...d, hours: d.hours || null, whoopHours: d.whoopHours || null }));
export const SleepChart = ({ data, notesMap, status, recordLink, compare }: SleepChartProps) =>
  recordLink
    ? <RecordTrendChart status={status} id="sleep" title="Sleep" icon={icon} data={plotRows(data)} series={series} unit={UNIT_LABEL.hours} defaultStyle="bar" empty={empty} summary={summary} link={recordLink} />
    : <TrendChart status={status} id="sleep" title="Sleep" icon={icon} data={plotRows(data)} series={series} unit={UNIT_LABEL.hours} notesMap={notesMap} defaultStyle="bar" empty={empty} summary={summary} daySelection={compare ? compareSelection : undefined} />;
