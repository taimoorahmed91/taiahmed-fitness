import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface UserContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isApproved: boolean | null;
  isOwner: boolean | null;
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

  const checkProfileStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved, owner')
      .eq('id', userId)
      .single();
    
    setIsApproved(profile?.approved === 'yes');
    setIsOwner(profile?.owner === 'yes');
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
          setIsApproved(null);
          setIsOwner(null);
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
          await checkProfileStatus(data.session.user.id);
        } else {
          if (error) console.warn('Session recovery failed:', error.message);
          setSession(null);
          setUser(null);
          setIsApproved(null);
          setIsOwner(null);
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

    // When the tab comes back or the network returns, make sure the session is
    // still alive (and refresh it) rather than silently failing the next query.
    const revalidate = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(({ data }) => {
        if (!isMounted || !data.session) return;
        const expiresAt = (data.session.expires_at ?? 0) * 1000;
        if (expiresAt - Date.now() < 5 * 60 * 1000) {
          void supabase.auth.refreshSession();
        }
      });
    };

    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('online', revalidate);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('online', revalidate);
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
    // 'local' so signing out here does not revoke sessions on other devices.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      explicitLogoutRef.current = false;
      console.error('Error signing out:', error);
      throw error;
    }
    setSession(null);
    setUser(null);
    setIsApproved(null);
    setIsOwner(null);
    // Clean up old localStorage key if exists
    localStorage.removeItem('fittrack-user');
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      session,
      loading,
      isApproved,
      isOwner,
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
