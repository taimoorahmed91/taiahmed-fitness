import { useMemo } from 'react';
import { useMeals } from './useMeals';
import { useGymSessions } from './useGymSessions';
import { useSleep } from './useSleep';
import { useWhoopData } from './useWhoopData';
import { useInsightThresholds } from './useInsightThresholds';
import { analyzeRecoveryVsGym, analyzeSleepVsNutrition } from '@/lib/crossMetricIntelligence';
import type { CorrelationInsight } from './useReportData';

const signed = (n: number, unit = '%') => `${n >= 0 ? '+' : ''}${Math.round(n)}${unit}`;

/** Recovery-vs-gym and sleep-vs-nutrition insights for dates on or after `since` (ISO). */
export const useCrossMetricInsights = (since: string) => {
  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { entries: sleep } = useSleep();
  const { entries: whoop } = useWhoopData();
  const { thresholds } = useInsightThresholds();

  return useMemo(() => {
    const insights: CorrelationInsight[] = [];
    const rec = analyzeRecoveryVsGym(whoop.filter(w => w.date >= since), sessions.filter(s => s.date >= since), thresholds.recoveryCutoff);
    if (rec) {
      const better = rec.volumeDeltaPct >= 0;
      insights.push({
        title: 'Recovery vs. Gym',
        description: `Workouts on days with ≥${thresholds.recoveryCutoff}% WHOOP recovery average ${signed(rec.volumeDeltaPct)} volume (${Math.round(rec.highVolume).toLocaleString()} vs ${Math.round(rec.lowVolume).toLocaleString()} kg) and ${signed(rec.highDuration - rec.lowDuration, ' min')} duration. Based on ${rec.highDays} high and ${rec.lowDays} low recovery days.`,
        correlation: Math.abs(rec.volumeDeltaPct) < 5 ? 'neutral' : better ? 'positive' : 'negative',
        value: signed(rec.volumeDeltaPct),
      });
    }
    const sl = analyzeSleepVsNutrition(sleep.filter(s => s.date >= since), meals.filter(m => m.date >= since), thresholds.sleepCutoff);
    if (sl) {
      const more = sl.carbDeltaPct > 0;
      insights.push({
        title: 'Sleep vs. Nutrition',
        description: `Days after <${thresholds.sleepCutoff}h sleep average ${Math.round(sl.shortCarbs)}g carbs vs ${Math.round(sl.normalCarbs)}g (${signed(sl.carbDeltaPct)}) and ${signed(sl.calorieDelta, ' cal')}. Based on ${sl.shortDays} short and ${sl.normalDays} normal nights.`,
        correlation: Math.abs(sl.carbDeltaPct) < 5 ? 'neutral' : more ? 'negative' : 'positive',
        value: signed(sl.carbDeltaPct),
      });
    }
    return insights;
  }, [meals, sessions, sleep, whoop, thresholds, since]);
};
