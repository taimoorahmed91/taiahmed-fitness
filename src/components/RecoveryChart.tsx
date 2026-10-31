import { HeartPulse } from 'lucide-react';
import { TrendChart } from './TrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface RecoveryChartProps { data: { date: string; recovery: number }[] }
const series = [{ key: 'recovery', label: 'Recovery', color: METRIC_COLORS.whoop }];
export const RecoveryChart = ({ data }: RecoveryChartProps) =>
  <TrendChart id="recovery" title="WHOOP Recovery" icon={<HeartPulse className="h-5 w-5 text-primary" />} data={data} series={series} unit={UNIT_LABEL.percent} cap={100} empty="No WHOOP recovery data in this period. Try a wider date range." summary={rows => {
    const latest = rows[rows.length - 1]?.recovery;
    return latest != null && <>Latest: <span className="font-semibold text-foreground">{latest}{UNIT_LABEL.percent}</span></>;
  }} />;
