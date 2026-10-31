import { TrendingDown } from 'lucide-react';
import { DeltaChart } from '@/components/charts/DeltaChart';
import { UNIT_LABEL } from '@/lib/chartTheme';
import { useMemo } from 'react';

export const WeightDeltaChart = ({ data }: { data: { date: string; weight: number }[] }) => {
  const entries = useMemo(() => data.map((d) => ({ date: d.date, value: d.weight })), [data]);
  return <DeltaChart title="Weight Change" icon={<TrendingDown className="h-5 w-5 text-primary" />} unit={UNIT_LABEL.kilograms} entries={entries} emptyText="Log at least two weigh-ins on different days to see how your weight is changing." />;
};
