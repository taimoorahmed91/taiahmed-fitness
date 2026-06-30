## Goal

Make the manual log path behave identically to a template start: just a **Start** button that opens the `ActiveWorkoutModal`. The only difference from a template start is that no exercises are pre-listed and no reps/weight placeholders are pulled from history.

## Changes

### 1. `src/components/GymForm.tsx` — replace with a minimal Start card

Strip the form down to:
- Optional workout name input (defaults to `"Workout"` if blank) — this becomes the `exercise` field saved to DB, matching how template workouts save `template.name`.
- A single **Start Workout** button.
- Remove duration, date, start time, and notes inputs — those are captured automatically by the active modal (wall-clock duration, today's date, real start time, per-exercise notes aggregated on finish), exactly as with template starts.

New prop: `onStart: (name: string) => void` (replaces `onSubmit`).

### 2. `src/pages/Gym.tsx` — wire Start to the active modal

- Replace `<GymForm onSubmit={addSession} />` with `<GymForm onStart={handleStartManualWorkout} />`.
- Add `handleStartManualWorkout(name)` that:
  - Runs the same "already-in-progress" guard used by `handleStartWorkout` (checks `activeTemplate` and `readPausedWorkout()`; opens the blocking dialog with a Resume option when another workout is paused).
  - If clear, constructs a synthetic template object and sets it as `activeTemplate`:
    ```ts
    { id: `manual-${Date.now()}`, name: name || 'Workout', exercises: [] }
    ```
  - The unique `manual-…` id ensures the modal's `localStorage` persistence (which keys by `templateId`) doesn't collide with real templates or paused sessions.

### 3. `src/components/ActiveWorkoutModal.tsx` — confirm empty-template behavior works

The modal already supports `extraExercises` via the existing "Add exercise (session only)" UI at the bottom. With `template.exercises = []`, the user will:
- Open the modal with zero exercise rows.
- Use the existing **Add exercise** input to add as many ad-hoc exercises as they want.
- Each added exercise gets the same sequence numbering, rest timers, set rows (+ warmup, +set buttons up to 6), notes, and completion flow as a templated workout.

History-based placeholder pre-fills (`getLastSession`/`parseNotesToPreviousReps`) are keyed by `template.name`; for a synthetic name like `"Workout"` they will simply find nothing for a brand-new manual start, satisfying the "no pre-filled numbers" requirement. No code change needed here — verify only.

On finish, the modal already saves `{ exercise: template.name, duration, date, notes, start_time }` via `onFinish` → `addSession`, which is the same DB shape the old `GymForm` produced, so `GymList`, stats, and exports remain unchanged.

### 4. Out of scope (unchanged)

- Templates tab, template list/start flow.
- `EditWorkoutSessionModal` (manual edits to past sessions still work).
- DB schema, hooks (`useGymSessions`), exports.

## Result

The "Log Workout" tab shows just a name field + Start button. Pressing Start launches the same in-progress workout experience as a template start — empty exercise list, no history pre-fills, full set/rep/weight/notes/timer tracking, and the same active-workout guard preventing two workouts at once.
