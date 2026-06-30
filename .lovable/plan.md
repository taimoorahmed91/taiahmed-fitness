
## Problem

A Pull Day session shows `174 min` even though the parsed notes say `Start: 09:39 End: 10:51` (72 min). Two root causes:

1. The end-time anchor we recently added uses either (a) `new Date()` at the moment **Complete** is tapped — which drifts if the user pauses, gets interrupted, or finishes late — or (b) for older rows, the backfill `start_time + duration`, which is circular and can't correct a wrong duration.
2. Edit-modal recalculation only fires when the user changes the **start time**. If they don't touch it (or only fix the duration), nothing is recomputed.

The actual end of work is best represented by the **last set's `@HH:MM` timestamp** already recorded in the notes (e.g. `S3:15@20kg@10:51`). That's wall-clock truth captured per-set during the workout.

## Fix

### 1. `EditWorkoutSessionModal.tsx` — anchor from notes, not from stored `end_time`

When computing the end-time anchor on load, prefer in this order:

1. The **latest `@HH:MM` timestamp** found across all parsed exercise sets (combined with the session `date`).
2. The stored `end_time` column.
3. `start_time + duration` fallback (legacy behavior).

This makes the anchor reflect the real workout span even for sessions completed long after the last set, or paused sessions.

### 2. Always recalc on save when anchor is available

Right now we only recompute duration when `startTimeField !== originalStartTime || date !== originalDate`. Change this so that whenever a valid notes-derived anchor exists **and** a valid `start_time` exists, we always set:

```
finalDuration = round((anchor - startTime) / 60_000)
finalEndIso   = anchor (ISO)
```

This silently corrects stale rows on the next save without the user having to fiddle with the start time.

### 3. Add a visible "Recalculate from sets" button + preview line

In the Edit modal, next to the Duration field, render:

- A small caption: `Sets span: 09:39 → 10:51 (72 min)` when notes have timestamps.
- A `Recalculate` button that fills the Duration field with the computed value immediately (so the user sees what will be saved).

This makes the behavior transparent and lets the user one-tap fix the 174-min session you flagged.

### 4. `ActiveWorkoutModal.tsx` — set `end_time` from last logged set, not `new Date()`

In `handleComplete`, before calling `onFinish`, scan `setLogs` for the latest `@HH:MM` timestamp and use that as `end_time` (combined with today's date). Fall back to `new Date()` only if no sets were logged. This prevents future sessions from inheriting wrong end anchors when the user taps Complete after a long delay.

### 5. One-time DB cleanup (optional, recommended)

Run a SQL migration that, for existing rows where notes contain `@HH:MM` set timestamps, recomputes `end_time = date + max(set_time)` and `duration = (end_time - start_time)` in minutes. Scoped to your user only. I'll only run this if you want — otherwise the next time you open & save each affected session in the Edit modal, step 2 will fix it.

## Technical notes

- Parsing: reuse the existing `parseSessionNotes` util to enumerate sets and pick `max(timestamp)`.
- Edge case: if `lastSetTime < startTime` (e.g. workout crossed midnight), add 24h before computing duration.
- The green-border "touched" tracking stays as-is; the auto-recalc on save is independent of user edits.
- No schema change required — `end_time` column already exists.

## Files

- `src/components/EditWorkoutSessionModal.tsx` — anchor priority, always-recalc, Recalculate button + caption.
- `src/components/ActiveWorkoutModal.tsx` — derive `end_time` from last set timestamp in `handleComplete`.
- Optional: one migration to backfill correct `end_time`/`duration` for rows whose notes contain set timestamps.

## Question before I build

Do you want the optional **one-time SQL backfill** in step 5 so all historical rows (including the 174-min Pull Day) are corrected immediately, or should I only fix it going forward and let you re-save the affected ones manually?
