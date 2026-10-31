import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  decideAccess, forgetApproved, isNoProfileRow, readLastApproved, rememberApproved,
  type AccessSource, type PreviousAccess, type ProfileProbe,
} from '@/lib/offlineIdentity';
import { defaultStorage, parkActiveDraft } from '@/lib/workoutDraft';

interface UserContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recovering: boolean;
  isApproved: boolean | null;
  isOwner: boolean | null;
  /** Where `isApproved` came from. 'last-known-offline' = the server could not be reached (see lib/offlineIdentity.ts). */
  approvalSource: AccessSource | null;
  /**
   * True when approval comes only from this device's memory of a past server approval: the person may use
   * local workout recovery, nothing more. Owner rights are never granted this way and no server write is allowed.
   */
  offlineRecoveryOnly: boolean;
  /** The last profile check failed (it is retried when the connection returns). */
  profileError: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [approvalSource, setApprovalSource] = useState<AccessSource | null>(null);
  const [offlineRecoveryOnly, setOfflineRecoveryOnly] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const explicitLogoutRef = useRef(false);
  const recoveringRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const profileRequestRef = useRef(0);
  const accessRef = useRef<PreviousAccess | null>(null);
  const profileRetryRef = useRef<number | undefined>();
  const profileAttemptsRef = useRef(0);

  const clearAccess = () => {
    profileRequestRef.current++;
    accessRef.current = null;
    window.clearTimeout(profileRetryRef.current);
    setIsApproved(null);
    setIsOwner(null);
    setApprovalSource(null);
    setOfflineRecoveryOnly(false);
    setProfileError(false);
  };

  // Approval comes from the server. If the server cannot be asked, see decideAccess() for the only cases
  // in which anything else is used (never a silent "approved").
  const checkProfileStatus = async (userId: string) => {
    const request = ++profileRequestRef.current;
    let probe: ProfileProbe;
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('approved, owner')
        .eq('id', userId)
        .single();
      if (error) {
        // "No profile row" is the server's definite answer: not approved. Any other error is a failed check.
        probe = isNoProfileRow(error) ? { ok: true, approved: false, owner: false } : { ok: false, error };
      } else {
        probe = { ok: true, approved: profile?.approved === 'yes', owner: profile?.owner === 'yes' };
      }
    } catch (error) {
      probe = { ok: false, error };
    }
    // A newer check, or a different person, took over while this one was in flight.
    if (request !== profileRequestRef.current || currentUserIdRef.current !== userId) return;

    const online = typeof navigator === 'undefined' || navigator.onLine;
    const decision = decideAccess({ userId, probe, online, remembered: readLastApproved(), previous: accessRef.current });
    if (decision.memory === 'remember') rememberApproved(userId);
    else if (decision.memory === 'forget') forgetApproved();
    accessRef.current = { userId, approved: decision.approved, owner: decision.owner, source: decision.source };
    setIsApproved(decision.approved);
    setIsOwner(decision.owner);
    setApprovalSource(decision.source);
    setOfflineRecoveryOnly(decision.offlineRecoveryOnly);
    setProfileError(decision.profileError);

    window.clearTimeout(profileRetryRef.current);
    if (decision.profileError && profileAttemptsRef.current < 3) {
      // Try again soon; the 'online' event also retries as soon as the connection returns.
      profileAttemptsRef.current++;
      profileRetryRef.current = window.setTimeout(() => {
        if (currentUserIdRef.current === userId) void checkProfileStatus(userId);
      }, 15_000);
    } else if (!decision.profileError) {
      profileAttemptsRef.current = 0;
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // A SIGNED_OUT that the user did not ask for is almost always a failed
        // token refresh (e.g. two tabs rotating the same refresh token).
        // Try to recover instead of throwing the user back to the login page.
        if (event === 'SIGNED_OUT' && !explicitLogoutRef.current) {
          void attemptSessionRecovery();
          return;
        }

        if (event === 'SIGNED_OUT') {
          explicitLogoutRef.current = false;
        }

        setSession(session);
        setUser(session?.user ?? null);
        const previousUserId = currentUserIdRef.current;
        currentUserIdRef.current = session?.user?.id ?? null;
        if (previousUserId !== currentUserIdRef.current) {
          // A different person must never inherit the last person's approval.
          accessRef.current = null;
          profileAttemptsRef.current = 0;
        }

        // Check profile status after auth state change
        if (session?.user) {
          setTimeout(() => {
            if (isMounted) {
              checkProfileStatus(session.user.id).finally(() => {
                if (isMounted) setLoading(false);
              });
            }
          }, 0);
        } else {
          clearAccess();
          setLoading(false);
        }
      }
    );

    // Try to bring a dropped session back before treating the user as logged out.
    const attemptSessionRecovery = async () => {
      if (recoveringRef.current) return;
      recoveringRef.current = true;
      setRecovering(true);
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!isMounted) return;

        if (data?.session) {
          setSession(data.session);
          setUser(data.session.user);
          currentUserIdRef.current = data.session.user.id;
          await checkProfileStatus(data.session.user.id);
        } else {
          // Expired or invalid session: signed out. No offline stand-in session is ever made up.
          if (error) console.warn('Session recovery failed:', error.message);
          setSession(null);
          setUser(null);
          currentUserIdRef.current = null;
          clearAccess();
        }
      } catch (err) {
        console.warn('Session recovery error:', err);
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        recoveringRef.current = false;
        if (isMounted) {
          setRecovering(false);
          setLoading(false);
        }
      }
    };

    // THEN check for existing session
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error) {
          console.error('Session fetch error:', error);
          await attemptSessionRecovery();
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        currentUserIdRef.current = session?.user?.id ?? null;

        if (session?.user) {
          await checkProfileStatus(session.user.id);
        }

        if (isMounted) setLoading(false);
      } catch (err) {
        console.error('Session init error:', err);
        if (isMounted) {
          await attemptSessionRecovery();
        }
      }
    };

    initSession();

    // Supabase owns token refresh and coordinates it across tabs. Reading the
    // session here lets it perform its normal recovery without starting a
    // second, manual refresh that can race the auto-refresh cycle.
    const revalidate = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(({ error }) => {
        if (isMounted && error) {
          console.warn('Session revalidation failed:', error.message);
        }
      });
    };

    // Back online: replace any "could not check" answer with the server's real one.
    const recheckProfile = () => {
      const userId = currentUserIdRef.current;
      const access = accessRef.current;
      if (!isMounted || !userId || !access) return;
      if (access.source === 'last-known-offline' || access.source === 'retained' || access.source === 'denied') {
        profileAttemptsRef.current = 0;
        void checkProfileStatus(userId);
      }
    };

    const onOnline = () => { revalidate(); recheckProfile(); };

    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('online', onOnline);

    return () => {
      isMounted = false;
      window.clearTimeout(profileRetryRef.current);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const signInWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logout = async () => {
    explicitLogoutRef.current = true;
    const leavingUserId = currentUserIdRef.current;
    // 'local' so signing out here does not revoke sessions on other devices.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      explicitLogoutRef.current = false;
      console.error('Error signing out:', error);
      throw error;
    }
    setSession(null);
    setUser(null);
    currentUserIdRef.current = null;
    clearAccess();
    // An explicit sign-out ends offline approval too.
    forgetApproved();
    // Put this person's unfinished workout away safely: out of the shared slot (so the next account cannot see
    // it), but not deleted, so it is waiting for them when they sign back in. Failure never blocks sign-out.
    try {
      parkActiveDraft(defaultStorage(), leavingUserId);
    } catch (draftError) {
      console.warn('Could not put the unfinished workout away at sign-out:', draftError);
    }
    // Clean up old localStorage key if exists
    localStorage.removeItem('fittrack-user');
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      session,
      loading,
      recovering,
      isApproved,
      isOwner,
      approvalSource,
      offlineRecoveryOnly,
      profileError,
      signInWithGoogle, 
      logout, 
      isLoggedIn: !!session 
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
