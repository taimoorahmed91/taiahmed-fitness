import { TrendingDown } from 'lucide-react';
import { DeltaChart } from '@/components/charts/DeltaChart';
import { UNIT_LABEL } from '@/lib/chartTheme';
import { useMemo } from 'react';

export const WaistDeltaChart = ({ data }: { data: { date: string; waist: number }[] }) => {
  const entries = useMemo(() => data.map((d) => ({ date: d.date, value: d.waist })), [data]);
  return <DeltaChart title="Waist Change" icon={<TrendingDown className="h-5 w-5 text-primary" />} unit={UNIT_LABEL.centimeters} entries={entries} emptyText="Log at least two waist measurements on different days to see how it is changing." />;
};
