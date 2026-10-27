import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_RECOVERY_CUTOFF, DEFAULT_SLEEP_CUTOFF } from '@/lib/crossMetricIntelligence';

const KEY = 'fittrack-insight-thresholds';
const EVENT = 'fittrack-insight-thresholds-change';

export type InsightThresholds = { recoveryCutoff: number; sleepCutoff: number };

const read = (): InsightThresholds => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      recoveryCutoff: Number.isFinite(raw.recoveryCutoff) ? raw.recoveryCutoff : DEFAULT_RECOVERY_CUTOFF,
      sleepCutoff: Number.isFinite(raw.sleepCutoff) ? raw.sleepCutoff : DEFAULT_SLEEP_CUTOFF,
    };
  } catch {
    return { recoveryCutoff: DEFAULT_RECOVERY_CUTOFF, sleepCutoff: DEFAULT_SLEEP_CUTOFF };
  }
};

/** Insight cutoffs, stored on this device. */
export const useInsightThresholds = () => {
  const [value, setValue] = useState<InsightThresholds>(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const save = useCallback((next: InsightThresholds) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { thresholds: value, save };
};
