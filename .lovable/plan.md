# Remove session timeouts app-wide

Goal: once a user signs in, they stay signed in until they explicitly log out. MCP/API tokens also stop expiring — they last until refreshed or revoked.

## 1. Browser session (UI login)

- Delete the inactivity/session-expiry machinery: `src/hooks/useSessionValidator.ts` and `src/components/SessionValidator.tsx`, and remove `<SessionValidator />` from `src/App.tsx`.
- Remove the `validateSessionBeforeOperation()` gate and its "Session expired" toasts/logging from `src/hooks/useMeals.ts` and `src/hooks/useGymSessions.ts` (saves proceed directly; Supabase handles token refresh).
- Clean up the leftover `fittrack-last-activity` localStorage key usage.
- Supabase client keeps `persistSession: true` and `autoRefreshToken: true`, so the session survives refreshes and reboots indefinitely.

Kept as-is: `UserContext` auth state, approval checks, and the explicit Logout button.

## 2. MCP / API token

- Edge function `api-token`: stop setting a TTL — no `expires_at` on generate, no purge of "expired" rows, `status` returns the token's creation time only.
- Database: make `fittrack_api_tokens.expires_at` nullable (or drop it) via a migration so tokens persist until refreshed or revoked.
- `src/pages/PersonalData.tsx`: remove the 3-hour countdown / "expires in" text and replace with wording that the token stays valid until refreshed or revoked. Refresh (rotate) and Revoke buttons stay.

## Notes

- Removing the token TTL means a leaked MCP token stays usable until manually revoked; the Revoke button is the only kill switch.
- Supabase's own refresh-token lifetime is set in the Supabase auth settings; if a hard cap is configured there, the browser session ends when that cap hits regardless of app code.
