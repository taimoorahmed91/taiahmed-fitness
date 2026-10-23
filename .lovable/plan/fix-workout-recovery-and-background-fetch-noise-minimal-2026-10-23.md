# Fix workout recovery and background fetch noise (minimal)

## Priority 1 — Never lose an in-progress workout

**Gym.tsx — `handleResumePaused`**
- Today: if the template isn't found in the loaded list (still loading, or offline so the list is empty), the saved workout gets deleted. Remove that deletion.
- New fallback order: (1) the matching loaded template; (2) if none, rebuild a temporary template from the saved workout itself (`templateId`, `templateName`, `exercises` are already stored), then resume. The saved data is never cleared here.
- Manual workouts (`manual-...` ids) are covered by the same fallback, so they resume after a refresh too.

**Gym.tsx — automatic resume after refresh**
- On page load, if a saved workout exists and no workout is open, reopen it right away using the same fallback, so a refresh returns you to the workout and doesn't just show a banner.

**ActiveWorkoutModal.tsx — keep the original start time**
- The restore already reads `startTime` from storage when the ids match. Check that the "fresh start" path (setting `startTime = now`) never runs when a saved workout exists for that id, and that nothing writes a new start time before the restore finishes. Add a guard if the check finds a gap. Saving stays as it is: a failed save keeps the workout in storage so you can try again.

## Priority 2 — Fewer network errors

**useAutoRefresh.ts**
- Skip each 30-second tick while `document.visibilityState !== 'visible'`. Refresh once when the tab becomes visible again.

**Background-fetch toasts (useMeals, useGymSessions, plus any other hooks the dashboard polls that show a "Failed to fetch" toast)**
- Show the fetch-failure toast only once until a fetch succeeds again, and never while the browser reports it's offline (`navigator.onLine === false`). Errors still go to the console. Toasts for add, update and delete stay the same.

## Validation
Run one Playwright check with a signed-in session: start a template workout, log sets, go offline, reload, confirm the workout reopens with the same start time and sets, go back online, finish, and confirm the session saves with the original start time.

## Remaining limitations
- Saving needs a connection. If you're offline, the save fails, the workout stays on the device, and you can tap Finish again once you're back online. Nothing queues automatically.
- The workout is stored in this browser only. Another device won't see it.
- Clearing the browser's site data deletes an unsaved workout.
