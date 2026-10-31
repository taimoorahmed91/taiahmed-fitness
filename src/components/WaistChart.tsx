import { Ruler } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface WaistChartProps { data: { date: string; waist: number }[]; notesMap?: Map<string, DailyNote> }
const series = [{ key: 'waist', label: 'Waist', color: METRIC_COLORS.waist }];
export const WaistChart = ({ data, notesMap }: WaistChartProps) =>
  <TrendChart extendedRanges id="waist" title="Waist Trend" icon={<Ruler className="h-5 w-5 text-primary" />} data={data.filter(d => d.waist > 0)} series={series} unit={UNIT_LABEL.centimeters} notesMap={notesMap} empty="No waist entries in this period. Try a wider date range." summary={rows => {
    const latest = rows[rows.length - 1]?.waist;
    return latest != null && <>Latest: <span className="font-semibold text-foreground">{latest}</span> {UNIT_LABEL.centimeters}</>;
  }} />;
