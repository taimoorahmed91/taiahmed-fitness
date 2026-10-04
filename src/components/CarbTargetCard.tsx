import { Wheat } from 'lucide-react';
import { MacroTargetCard } from '@/components/MacroTargetCard';
import { macroRange } from '@/lib/targets';

interface CarbTargetCardProps {
  multiplier: number | null;
  multiplierMax: number | null;
  currentWeight: number | null;
  todayCarbs: number;
}

export const CarbTargetCard = ({ multiplier, multiplierMax, currentWeight, todayCarbs }: CarbTargetCardProps) => (
  <MacroTargetCard
    title="Daily Carb Target"
    icon={<Wheat className="h-5 w-5 text-chart-3" />}
    range={macroRange(multiplier, multiplierMax, currentWeight)}
    current={todayCarbs}
    emptyText="Set carb multipliers in Personal Data and log a weight entry to see your daily target."
  />
);
