import { useMemo } from 'react';
import { useMeals } from './useMeals';
import { useGymSessions } from './useGymSessions';
import { useSleep } from './useSleep';
import { useWhoopData } from './useWhoopData';
import { useInsightThresholds } from './useInsightThresholds';
import { useSharedTableState } from '@/lib/sharedTable';
import {
  analyzeRecoveryVsGym, analyzeSleepVsNutrition, recoveryGymCopy, sleepNutritionCopy,
  type CrossMetricEvidence,
} from '@/lib/crossMetricIntelligence';
import type { CorrelationInsight } from './useReportData';

/** A cross-metric insight together with the exact days and cohorts it was computed from. */
export type CrossMetricInsight = CorrelationInsight & {
  id: 'recovery_vs_gym' | 'sleep_vs_nutrition';
  /** What `value` measures ("volume", "carbs"), so the number is never shown bare. */
  valueLabel?: string;
  evidence: CrossMetricEvidence;
  /** Names of sources whose latest refresh failed: the days shown are the last ones that loaded. */
  staleSources: string[];
};

/**
 * Recovery-vs-gym and sleep-vs-nutrition insights for dates on or after `since` (ISO).
 * Each insight needs BOTH of its sources to have loaded: a source that never loaded produces no claim and no
 * evidence (unknown is not empty). A source whose refresh failed over older rows is named in `staleSources`.
 * Every insight is `neutral`: it reports a difference between logged days, never a better or worse side.
 */
export const useCrossMetricInsights = (since: string): CrossMetricInsight[] => {
  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { entries: sleep } = useSleep();
  const { entries: whoop } = useWhoopData();
  const { thresholds } = useInsightThresholds();
  const mealsState = useSharedTableState('meals');
  const gymState = useSharedTableState('gym_sessions');
  const sleepState = useSharedTableState('sleep');
  const whoopState = useSharedTableState('whoop');

  return useMemo(() => {
    const insights: CrossMetricInsight[] = [];
    const window = { from: since, to: null };
    const stale = (pairs: [string, typeof mealsState][]) => pairs.filter(([, s]) => s.refreshFailed).map(([label]) => label);

    if (gymState.phase === 'ready' && whoopState.phase === 'ready') {
      const rec = analyzeRecoveryVsGym(
        whoop.map(w => ({ date: w.date, recovery_score: w.recovery_score, stamp: w.cycle_end_timestamp ?? w.created_at })),
        sessions, thresholds.recoveryCutoff, window,
      );
      if (rec) {
        const copy = recoveryGymCopy(rec);
        insights.push({
          id: 'recovery_vs_gym',
          title: 'Recovery vs. Gym',
          description: copy.description,
          correlation: 'neutral',
          value: copy.value ?? undefined,
          valueLabel: copy.valueLabel ?? undefined,
          evidence: rec.evidence,
          staleSources: stale([['workouts', gymState], ['WHOOP data', whoopState]]),
        });
      }
    }
    if (sleepState.phase === 'ready' && mealsState.phase === 'ready') {
      const sl = analyzeSleepVsNutrition(sleep, meals, thresholds.sleepCutoff, window);
      if (sl) {
        const copy = sleepNutritionCopy(sl);
        insights.push({
          id: 'sleep_vs_nutrition',
          title: 'Sleep vs. Nutrition',
          description: copy.description,
          correlation: 'neutral',
          value: copy.value ?? undefined,
          valueLabel: copy.valueLabel ?? undefined,
          evidence: sl.evidence,
          staleSources: stale([['sleep', sleepState], ['meals', mealsState]]),
        });
      }
    }
    return insights;
  }, [meals, sessions, sleep, whoop, thresholds, since, mealsState, gymState, sleepState, whoopState]);
};
