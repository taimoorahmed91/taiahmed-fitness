import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the currently signed-in user from the locally cached session.
 *
 * Prefer this over `supabase.auth.getUser()` for data fetching: `getUser()`
 * hits the auth server on every call, which produced dozens of `/user`
 * requests per page load and increased the chance of concurrent refresh
 * races (which end with "refresh token not found" and a surprise logout).
 * All data access is protected by RLS server-side, so trusting the cached
 * session for the user id is safe here.
 */
export const getSessionUser = async (): Promise<User | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
};

/**
 * Subscribe to *identity* changes only (sign in / sign out / user updated).
 *
 * `onAuthStateChange` also fires on `TOKEN_REFRESHED` and `INITIAL_SESSION`,
 * which caused every hook in the app to refetch on each hourly token refresh.
 */
export const onAuthIdentityChange = (callback: () => void) => {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      callback();
    }
  });
  return data.subscription;
};
