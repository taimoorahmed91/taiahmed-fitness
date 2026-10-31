import { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Clock } from 'lucide-react';
import { useChartRange } from './ChartViewControls';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState, NO_DATA } from '@/components/charts/ChartEmptyState';
import { CATEGORY_COLORS, chartTooltipProps, formatChartValue, UNIT_LABEL } from '@/lib/chartTheme';
import { RANGE_LABELS } from '@/lib/chartRange';
import { chartMotionProps } from '@/lib/chartViewer';

interface MealTimeChartProps {
  data7: { name: string; calories: number; count: number }[];
  data14: { name: string; calories: number; count: number }[];
  data30: { name: string; calories: number; count: number }[];
  data90: { name: string; calories: number; count: number }[];
}

// Time of day has no good/bad meaning, so it uses the neutral categorical hues
// (never the green/red/amber status colours).
const PERIODS = ['Overnight', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Late night'];
const colorFor = (name: string) => CATEGORY_COLORS[Math.max(0, PERIODS.indexOf(name)) % CATEGORY_COLORS.length];

export const MealTimeChart = ({ data7, data14, data30, data90 }: MealTimeChartProps) => {
  // Categorical chart: date range only (a line/bar switch does not apply to a pie).
  const { range, setRange } = useChartRange('meal_time');
  const data = range === '7' ? data7 : range === '14' ? data14 : range === '90' ? data90 : data30;
  const cardRef = useRef<HTMLDivElement>(null);
  const filteredData = data.filter((d) => d.calories > 0);
  const hasAnyMeals = data90.some((d) => d.calories > 0);
  const total = filteredData.reduce((sum, d) => sum + d.calories, 0);
  const share = (calories: number) => (total ? Math.round((calories / total) * 100) : 0);
  const period = RANGE_LABELS[range];
  const title = 'Calories by Time of Day';
  const summary = total
    ? `${period}. ${formatChartValue(total, UNIT_LABEL.calories)} in total. ${filteredData.map((d) => `${d.name}: ${share(d.calories)}% (${formatChartValue(d.calories, UNIT_LABEL.calories)}, ${d.count} ${d.count === 1 ? 'meal' : 'meals'})`).join('; ')}.`
    : `No meals in the ${period.toLowerCase()}.`;

  const tableColumns = [{ key: 'name', label: 'Period' }, { key: 'calories', label: `Calories (${UNIT_LABEL.calories})` }, { key: 'count', label: 'Meals' }];

  const motion = chartMotionProps();
  // The card and the full-screen viewer draw the same chart from the same state; only `expanded` differs.
  const body = (expanded: boolean) => (
    <>
      {filteredData.length === 0 ? (
        // Nothing in the widest window: logging a meal is the fix. Otherwise a wider range is.
        hasAnyMeals
          ? <ChartEmptyState className="min-h-[190px]">No meals in the {period.toLowerCase()}. Try a wider date range.</ChartEmptyState>
          : <ChartEmptyState className="min-h-[190px]" action={NO_DATA.meals90.action}>{NO_DATA.meals90.message}</ChartEmptyState>
      ) : (
        <ChartFigure
          expanded={expanded}
          title={title}
          summary={summary}
          height={190}
          caption={`Share of ${UNIT_LABEL.calories} · ${period}`}
          table={{ columns: tableColumns, rows: data }}
        >
          <PieChart accessibilityLayer>
            {/* Fixed radii in the card; in the viewer the ring is a share of the free space so it grows with it. */}
            <Pie {...motion} data={filteredData} cx="50%" cy="50%" innerRadius={expanded ? '42%' : 50} outerRadius={expanded ? '72%' : 76} paddingAngle={4} dataKey="calories" nameKey="name">
              {filteredData.map((entry) => <Cell key={entry.name} fill={colorFor(entry.name)} />)}
            </Pie>
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number, name: string) => [`${formatChartValue(value, UNIT_LABEL.calories)} · ${share(value)}%`, name]}
            />
          </PieChart>
        </ChartFigure>
      )}
      {total > 0 && (
        <ul className={expanded ? 'mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3' : 'mt-2 grid grid-cols-2 gap-x-4 gap-y-2'} aria-label="Share of calories by time of day">
          {data.map((entry) => (
            <li key={entry.name} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorFor(entry.name) }} aria-hidden="true" />
              <span className="min-w-0 truncate text-muted-foreground">{entry.name}</span>
              <span className="ml-auto tabular-nums font-semibold text-foreground">{share(entry.calories)}%</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <Card ref={cardRef} titleSize="chart" className="shadow-md min-w-0">
      <ChartHeader
        title={title}
        icon={<Clock className="h-5 w-5 text-primary" />}
        view={{ range, setRange }}
        pdf={{
          targetRef: cardRef,
          subtitle: period,
          columns: [{ key: 'name', label: 'Period' }, { key: 'calories', label: 'Calories' }, { key: 'count', label: 'Meals' }, { key: 'pct', label: 'Share (%)' }],
          rows: data.map(d => ({ ...d, pct: share(d.calories) })),
        }}
        viewer={{ render: () => body(true) }}
      />
      <CardContent>{body(false)}</CardContent>
    </Card>
  );
};
