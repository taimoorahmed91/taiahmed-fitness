# Fix: web app still logs users out

## What I checked

- The old inactivity machinery is gone: no `SessionValidator`, no `useSessionValidator`, no `fittrack-last-activity`, and the only `signOut()` call left is the Logout button in `UserContext`.
- Supabase sessions have no server-side time box (`auth.sessions.not_after` is empty for every row), so the logouts are not a configured session cap.
- The auth logs do show repeated `400 Invalid Refresh Token: Refresh Token Not Found` right before new logins, plus a burst of dozens of `/user` calls within the same second.

So the remaining cause is not an app timer — it is refresh-token handling: with multiple tabs/devices, several clients rotate the same refresh token at once, one wins, the losers get "refresh token not found", and supabase-js then drops the session locally. A reload with a stale stored token produces the same result. This diagnosis fits the evidence but is not yet proven end to end, so step 1 is a verification step.

## Plan

1. **Confirm the failure mode**: reproduce with the app open in two tabs, log the `onAuthStateChange` events and any refresh errors, and check whether the logout is always preceded by a `refresh_token_not_found` response.
2. **Stop treating a failed refresh as a logout**: in `UserContext`, only clear the user on an explicit `SIGNED_OUT` event triggered by the user, and on transient refresh failures retry (`refreshSession`) instead of redirecting to the welcome screen.
3. **Avoid the multi-tab rotation race**: give the Supabase client an explicit `storageKey`, keep `persistSession`/`autoRefreshToken`, and rely on a single refresh owner so background tabs don't each rotate the token.
4. **Make the redirect less trigger-happy**: `ProtectedRoute` currently bounces to `/` as soon as `isLoggedIn` is false; add a short "recovering session" state after reload so a slow `getSession()` or an in-flight refresh doesn't look like a logged-out user.
5. **Scope the Logout button to this device** (`signOut({ scope: 'local' })`) so logging out in one place doesn't revoke sessions on your phone and other tabs.
6. **Reduce the `/user` storm**: the auth-state subscription is duplicated across many hooks, each refetching on every event; consolidate so one event doesn't fan out into dozens of auth calls.
7. **Verify**: reload repeatedly, leave a tab idle past the access-token lifetime, and confirm the session survives in both tabs.

## Note

If Supabase's own refresh-token reuse detection is set very strictly on the project, step 3 reduces but may not eliminate the race; in that case the reuse interval in the Supabase auth settings needs raising, which I'd flag rather than change silently.
