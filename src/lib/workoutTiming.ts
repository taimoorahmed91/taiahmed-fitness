// Pure workout clock helpers. Everything is computed from wall-clock start times,
// so a clock never needs to be stored "per second" and never drifts when the
// browser throttles timers in a background tab.

export type RestType = 'set' | 'exercise';

/** In-memory rest timer. `startedAt` is epoch milliseconds. */
export interface RestState {
  startedAt: number;
  total: number;
  type: RestType;
  /** `running` counts down; `over` is shown (and announced once) until dismissed or replaced. */
  status: 'running' | 'over';
}

/** The stored shape (unchanged for older saved workouts). */
export interface PersistedRestTimer {
  /**
   * Legacy field. It used to be rewritten every second. It is now written once
   * (equal to `total`) and ignored on restore: remaining time always comes from
   * `startedAt` + `total`.
   */
  remaining?: number;
  total: number;
  type: RestType;
  startedAt: string;
}

export const REST_OVER_MESSAGE = 'Rest over. Ready for your next set.';

/** Whole seconds between two instants; never negative. */
export const elapsedSeconds = (startMs: number, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - startMs) / 1000));

/** Seconds left on a rest timer; never negative. */
export const restRemaining = (startedAtMs: number, totalSeconds: number, nowMs: number): number =>
  Math.max(0, totalSeconds - elapsedSeconds(startedAtMs, nowMs));

/** 0..100 progress through a rest period. */
export const restProgressPercent = (totalSeconds: number, remainingSeconds: number): number =>
  totalSeconds > 0 ? Math.min(100, Math.max(0, ((totalSeconds - remainingSeconds) / totalSeconds) * 100)) : 0;

/** mm:ss. Minutes are not capped (75 minutes reads 75:00), matching the old display. */
export const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const startRest = (type: RestType, totalSeconds: number, nowMs: number): RestState => ({
  startedAt: nowMs,
  total: totalSeconds,
  type,
  status: 'running',
});

/**
 * Moves a running timer to `over`. `announce` is true only for the one real
 * transition, so repeated ticks or a stale timer can never announce twice.
 */
export const transitionRestOver = (
  rest: RestState | null,
  startedAtMs: number,
): { rest: RestState | null; announce: boolean } => {
  if (!rest || rest.status !== 'running' || rest.startedAt !== startedAtMs) return { rest, announce: false };
  return { rest: { ...rest, status: 'over' }, announce: true };
};

/** Chime only for timers that ran out just now, not ones that finished while the tab was away. */
export const shouldChime = (startedAtMs: number, totalSeconds: number, nowMs: number, graceSeconds = 5): boolean =>
  nowMs - startedAtMs < (totalSeconds + graceSeconds) * 1000;

/** Stored form of a running timer. Only written when the timer starts, stops or changes type. */
export const serializeRestTimer = (rest: RestState | null): PersistedRestTimer | null =>
  rest && rest.status === 'running'
    ? { remaining: rest.total, total: rest.total, type: rest.type, startedAt: new Date(rest.startedAt).toISOString() }
    : null;

/** Rebuilds a timer from storage; expired or malformed timers are dropped. */
export const restoreRestTimer = (saved: unknown, nowMs: number): RestState | null => {
  if (!saved || typeof saved !== 'object') return null;
  const s = saved as Partial<PersistedRestTimer>;
  const total = Number(s.total);
  const startedAt = typeof s.startedAt === 'string' ? new Date(s.startedAt).getTime() : NaN;
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(startedAt)) return null;
  if (restRemaining(startedAt, total, nowMs) <= 0) return null;
  return { startedAt, total, type: s.type === 'exercise' ? 'exercise' : 'set', status: 'running' };
};
