## Goal
When a user edits a workout session's **start time** in the edit modal, the **duration** should be recalculated automatically on save instead of staying frozen at its original value.

## Approach
Duration today is written once (manual entry or template completion) and never recomputed. To make edits drive duration, we need a stable "end time" anchor.

Add an `end_time` column to `fittrack_gym_sessions` so duration always equals `end_time − start_time`. End time becomes the source of truth that doesn't shift when the user adjusts start time.

## Changes

### Database (migration)
- Add `end_time timestamptz` to `fittrack_gym_sessions` (nullable).
- Backfill existing rows: `end_time = start_time + (duration * interval '1 minute')` where both are present.

### Write paths
- **`ActiveWorkoutModal.tsx`** (template + manual-via-start flow): on Complete, save both `start_time` (already saved) and `end_time = now()`. Duration stays as the rounded minute diff (unchanged behavior for new sessions).
- **`useGymSessions.ts`**: include `end_time` in insert/update payloads and in the `GymSession` shape.
- **`types/index.ts`**: add `end_time?: string` to `GymSession`.

### Edit path
- **`EditWorkoutSessionModal.tsx`**:
  - When the modal opens, if `end_time` is missing but `start_time` + `duration` exist, derive `end_time = start_time + duration min` in memory so we have an anchor.
  - On save, if the user changed `start_time`:
    - New `duration = round((end_time − new start_time) / 60_000)`, clamped to a minimum of 1 minute.
    - If the result is non-positive (user picked a start after end), show an inline error and block save.
  - Persist `start_time`, recalculated `duration`, and (if newly derived) `end_time`.
  - Show the recalculated duration in the UI before save so the user sees the effect.

## Out of scope
- Editing end time directly (only start time triggers recalc, as requested).
- Recalculating durations for very old rows beyond the one-time backfill.

## Technical notes
- `end_time` stored as `timestamptz` for consistency with `start_time`.
- No RLS changes — column inherits existing row-level policies.
- No grants needed — adding a column doesn't require new GRANTs.
