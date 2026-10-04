import { HeartPulse } from 'lucide-react';
import { TrendChart } from './TrendChart';

interface RecoveryChartProps { data: { date: string; recovery: number }[] }
const series = [{ key: 'recovery', label: 'Recovery', color: 'hsl(var(--primary))' }];
export const RecoveryChart = ({ data }: RecoveryChartProps) =>
  <TrendChart id="recovery" title="WHOOP Recovery" icon={<HeartPulse className="h-5 w-5 text-primary" />} data={data} series={series} unit="%" cap={100} empty="No WHOOP recovery data yet." summary={rows => {
    const latest = rows[rows.length - 1]?.recovery;
    return latest != null && <span className="text-sm text-muted-foreground">Latest: <span className="font-semibold text-foreground">{latest}%</span></span>;
  }} />;
