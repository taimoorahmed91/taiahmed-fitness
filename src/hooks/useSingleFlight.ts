import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps an async function so only one run is active at a time.
 * Extra calls while it is running return the SAME promise (arguments of the later calls are ignored).
 * Pure and framework-free so it can be tested on its own; `useSingleFlight` is the React wrapper.
 */
export function createSingleFlight<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R> | R,
  onChange?: (pending: boolean) => void,
): (...args: Args) => Promise<R> {
  let inFlight: Promise<R> | null = null;

  return (...args: Args) => {
    if (inFlight) return inFlight;
    onChange?.(true);
    const run = (async () => fn(...args))();
    const settled = run.finally(() => {
      inFlight = null;
      onChange?.(false);
    });
    inFlight = settled;
    return settled;
  };
}

export interface UseSingleFlightResult<Args extends unknown[], R> {
  /** Call this instead of your handler. Ignored (returns the running promise) while a run is active. */
  run: (...args: Args) => Promise<R>;
  /** True while a run is active. Drive `loading` / `disabled` from this. */
  pending: boolean;
}

/**
 * Stops double-taps and double-submits. The guard is a ref, so it blocks even two clicks in the same frame,
 * before React has re-rendered. Errors are re-thrown to the caller; `pending` always resets.
 *
 * ```tsx
 * const { run: save, pending } = useSingleFlight(async () => { await saveWorkout(); });
 * <Button loading={pending} onClick={save}>Save</Button>
 * ```
 */
export function useSingleFlight<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R> | R,
): UseSingleFlightResult<Args, R> {
  const [pending, setPending] = useState(false);
  const fnRef = useRef(fn);
  const mounted = useRef(true);

  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runRef = useRef<((...args: Args) => Promise<R>) | null>(null);
  if (!runRef.current) {
    runRef.current = createSingleFlight<Args, R>(
      (...args) => fnRef.current(...args),
      (next) => {
        if (mounted.current) setPending(next);
      },
    );
  }

  const run = useCallback((...args: Args) => runRef.current!(...args), []);
  return { run, pending };
}
