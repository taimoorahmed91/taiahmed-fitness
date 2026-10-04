import { Scale } from 'lucide-react';
import { TrendChart } from './TrendChart';

interface CalorieBalanceChartProps { data: { date: string; consumed: number; burned: number; balance: number }[] }
const series = [
  { key: 'consumed', label: 'Meals Consumed', color: 'hsl(var(--chart-actual))' },
  { key: 'burned', label: 'WHOOP Burned', color: 'hsl(var(--chart-min))', dashed: true },
  { key: 'balance', label: 'Balance (deficit +)', color: 'hsl(var(--chart-max))', dashed: true },
];
export const CalorieBalanceChart = ({ data }: CalorieBalanceChartProps) =>
  <TrendChart id="calorie_balance" title="Calorie Balance" icon={<Scale className="h-5 w-5 text-primary" />} data={data} series={series} unit="cal" empty="No overlapping WHOOP and meal data in this period." summary={rows => {
    const latest = rows[rows.length - 1]?.balance;
    const total = rows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
    return <span className="text-sm text-muted-foreground">{latest != null && `Latest: ${Number(latest) >= 0 ? '+' : ''}${latest} cal · `}Total: {total >= 0 ? '+' : ''}{total} cal</span>;
  }} />;
