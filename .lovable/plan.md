## Problem

Sync Now still works even when nothing is saved in `fittrack_user_settings.whoop_api_url`, because two places silently fall back to a hardcoded URL:

1. `src/hooks/useWhoopData.ts` — constant `WHOOP_API_URL` used as a fallback when the user has no saved URL.
2. `supabase/functions/sync-whoop-data/index.ts` — daily auto-sync ignores the user setting entirely and always calls the hardcoded URL.

Result: the WHOOP page input has nothing to pre-fill (DB column is empty), but data still arrives, so the user can't see/edit the URL that's actually being used.

## Plan

### 1. One-time backfill

Backfill `fittrack_user_settings.whoop_api_url` with the previously hardcoded URL for every existing row where it is currently `NULL`. This way every user already syncing WHOOP keeps working, and their saved URL becomes visible in the WHOOP page input.

URL to backfill: `https://apjmwqdiqskgvzkvpjpx.supabase.co/functions/v1/get-latest-collective`

### 2. Remove the client fallback

In `src/hooks/useWhoopData.ts`:
- Delete the `WHOOP_API_URL` constant.
- In `fetchFromAPI`, if the user has no `whoop_api_url` saved, show a toast error ("Please set your WHOOP API URL on the WHOOP page") and stop — no silent fallback.

### 3. Make the edge function per-user

In `supabase/functions/sync-whoop-data/index.ts`:
- Delete the `WHOOP_API_URL` constant.
- Read each user's `whoop_api_url` from `fittrack_user_settings` inside the per-user loop.
- For each user: if their URL is missing, skip them (count as skipped); otherwise fetch from their URL and insert their row. This means each user can have a different URL, and users without one are simply skipped instead of getting data from someone else's endpoint.
- Keep `WHOOP_API_KEY` hardcoded as today (out of scope for this change).

### 4. Verify

After the change:
- Open the WHOOP page → the input is pre-filled with the saved URL.
- Edit + Save → reload → input shows the new URL.
- Sync Now still works for users with a saved URL; users without one get a clear error.
