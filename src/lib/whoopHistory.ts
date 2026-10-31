/**
 * Display helpers for the WHOOP history: the five core readings shown on a collapsed row, the full metric
 * grid shown when a row is opened, and the plain weekly averages in a week header.
 *
 * Nothing is hidden: every metric the old table had (all 19) is in the grid. Missing values show as "—"
 * (unknown), never 0. No colour carries meaning on its own; the recovery band is a word.
 */
import type { WhoopEntry } from '@/hooks/useWhoopData';
import { fmt, MIN_FOR_AVERAGE, rangeOf, recoveryBand } from '@/lib/bodyHistory';

export interface MetricCell {
  key: string;
  label: string;
  /** Text to show, "—" when not recorded. */
  value: string;
  unit?: string;
  recorded: boolean;
}

export interface MetricGroup {
  key: 'recovery' | 'sleep' | 'activity';
  label: string;
  cells: MetricCell[];
}

const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

const cell = (key: string, label: string, n: number | null | undefined, format: (v: number) => string, unit?: string): MetricCell =>
  has(n) ? { key, label, value: format(n), unit, recorded: true } : { key, label, value: '—', recorded: false };

const one = (v: number) => fmt(v, 1);
/** Always one decimal, as the old table showed these (36.0 stays 36.0). */
const fixed1 = (v: number) => Number(v).toFixed(1);
const whole = (v: number) => fmt(v, 0);
export const hoursFromMilli = (milli: number) => (milli / 3_600_000).toFixed(1);
export const caloriesFromKilojoule = (kj: number) => Math.round(kj / 4.184);

/** The five readings that stay visible on a collapsed row. */
export const whoopCore = (e: WhoopEntry) => ({
  recovery: cell('recovery', 'Recovery', e.recovery_score, whole, '%'),
  band: recoveryBand(e.recovery_score),
  hrv: cell('hrv', 'HRV', e.hrv_rmssd_milli, whole, 'ms'),
  rhr: cell('rhr', 'Resting HR', e.resting_heart_rate, whole, 'bpm'),
  sleep: cell('sleep', 'Sleep', e.sleep_performance_percentage, whole, '%'),
  strain: cell('strain', 'Strain', e.strain, fixed1),
});

/** Every stored reading, grouped for the opened row. */
export const whoopMetricGroups = (e: WhoopEntry): MetricGroup[] => [
  {
    key: 'recovery',
    label: 'Recovery and body',
    cells: [
      cell('recovery', 'Recovery', e.recovery_score, whole, '%'),
      cell('hrv', 'HRV', e.hrv_rmssd_milli, whole, 'ms'),
      cell('rhr', 'Resting HR', e.resting_heart_rate, whole, 'bpm'),
      cell('spo2', 'SpO2', e.spo2_percentage, one, '%'),
      cell('skin', 'Skin temp', e.skin_temp_celsius, fixed1, '°C'),
      cell('resp', 'Resp rate', e.respiratory_rate, fixed1),
    ],
  },
  {
    key: 'sleep',
    label: 'Sleep',
    cells: [
      cell('perf', 'Sleep performance', e.sleep_performance_percentage, whole, '%'),
      cell('eff', 'Sleep efficiency', e.sleep_efficiency_percentage, whole, '%'),
      cell('inbed', 'In bed', e.total_in_bed_hours, one, 'h'),
      cell('rem', 'REM', e.total_rem_sleep_milli, hoursFromMilli, 'h'),
      cell('deep', 'Deep', e.total_deep_sleep_milli, hoursFromMilli, 'h'),
      cell('light', 'Light', e.total_light_sleep_milli, hoursFromMilli, 'h'),
      cell('awake', 'Awake', e.total_awake_time_milli, hoursFromMilli, 'h'),
      cell('dist', 'Disturbances', e.disturbance_count, whole),
      cell('cycles', 'Sleep cycles', e.sleep_cycle_count, whole),
    ],
  },
  {
    key: 'activity',
    label: 'Activity',
    cells: [
      cell('strain', 'Strain', e.strain, fixed1),
      cell('cal', 'Calories', e.kilojoule, (v) => String(caloriesFromKilojoule(v)), 'cal'),
      cell('avghr', 'Avg HR', e.average_heart_rate, whole, 'bpm'),
      cell('maxhr', 'Max HR', e.max_heart_rate, whole, 'bpm'),
    ],
  },
];

export interface WeekAverage {
  mean: number;
  /** How many days of the week had this reading. */
  days: number;
}

export interface WhoopWeekSummary {
  days: number;
  recovery: WeekAverage | null;
  hrv: WeekAverage | null;
  strain: WeekAverage | null;
}

const average = (values: (number | null | undefined)[]): WeekAverage | null => {
  const r = rangeOf(values);
  return r && r.count >= MIN_FOR_AVERAGE ? { mean: r.mean, days: r.count } : null;
};

/** Averages only when at least three days have the reading; otherwise null (no average from one or two days). */
export const summarizeWhoopWeek = (entries: readonly WhoopEntry[]): WhoopWeekSummary => ({
  days: entries.length,
  recovery: average(entries.map((e) => e.recovery_score)),
  hrv: average(entries.map((e) => e.hrv_rmssd_milli)),
  strain: average(entries.map((e) => e.strain)),
});
