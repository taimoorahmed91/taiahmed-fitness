import { Beef } from 'lucide-react';
import { MacroTargetCard } from '@/components/MacroTargetCard';
import { macroRange } from '@/lib/targets';

interface ProteinTargetCardProps {
  multiplier: number | null;
  multiplierMax: number | null;
  currentWeight: number | null;
  todayProtein: number;
}

export const ProteinTargetCard = ({ multiplier, multiplierMax, currentWeight, todayProtein }: ProteinTargetCardProps) => (
  <MacroTargetCard
    title="Daily Protein Target"
    icon={<Beef className="h-5 w-5 text-chart-2" />}
    range={macroRange(multiplier, multiplierMax, currentWeight)}
    current={todayProtein}
    emptyText="Set protein multipliers in Personal Data and log a weight entry to see your daily target."
  />
);
