import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const LAST_ACTIVITY_KEY = 'fittrack-last-activity';

export const useSessionValidator = () => {
  const { logout, isLoggedIn } = useUser();
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
  }, []);

  // Check if session is still valid by making a lightweight API call
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.warn('Session validation failed:', error?.message || 'No session');
        return false;
      }

      // Check if token is about to expire (within 5 minutes)
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const expiresAtMs = expiresAt * 1000;
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (expiresAtMs - now < fiveMinutes) {
          console.log('Session about to expire, refreshing...');
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error('Failed to refresh session:', refreshError);
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }, []);

  // Handle session expiry
  const handleSessionExpiry = useCallback(async () => {
    toast.error('Your session has expired. Please log in again.');
    await logout();
  }, [logout]);

  // Check for inactivity
  const checkInactivity = useCallback(async () => {
    const lastActivity = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    const now = Date.now();
    
    if (lastActivity && now - lastActivity > INACTIVITY_TIMEOUT) {
      console.log('User inactive for too long, logging out...');
      toast.warning('You have been logged out due to inactivity.');
      await logout();
      return;
    }

    // Also validate the session is still good
    const isValid = await validateSession();
    if (!isValid && isLoggedIn) {
      await handleSessionExpiry();
    }
  }, [logout, validateSession, isLoggedIn, handleSessionExpiry]);

  // Reset inactivity timer on user activity
  const resetInactivityTimer = useCallback(() => {
    updateActivity();
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    inactivityTimerRef.current = setTimeout(() => {
      if (isLoggedIn) {
        toast.warning('You have been logged out due to inactivity.');
        logout();
      }
    }, INACTIVITY_TIMEOUT);
  }, [updateActivity, isLoggedIn, logout]);

  // Validate session before performing an operation
  const validateBeforeOperation = useCallback(async (): Promise<boolean> => {
    const isValid = await validateSession();
    
    if (!isValid) {
      toast.error('Your session has expired. Please log in again.');
      await logout();
      return false;
    }
    
    updateActivity();
    return true;
  }, [validateSession, logout, updateActivity]);

  // Setup event listeners and intervals
  useEffect(() => {
    if (!isLoggedIn) {
      // Clear timers when not logged in
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
      return;
    }

    // Initialize last activity
    updateActivity();

    // Activity event listeners
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Handle visibility change (tab focus)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // User returned to the tab, validate session
        await checkInactivity();
        resetInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle online/offline
    const handleOnline = async () => {
      console.log('Connection restored, validating session...');
      const isValid = await validateSession();
      if (!isValid && isLoggedIn) {
        await handleSessionExpiry();
      }
    };

    window.addEventListener('online', handleOnline);

    // Start inactivity timer
    resetInactivityTimer();

    // Periodic session check
    sessionCheckIntervalRef.current = setInterval(checkInactivity, SESSION_CHECK_INTERVAL);

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', handleOnline);
      
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, [isLoggedIn, resetInactivityTimer, checkInactivity, validateSession, handleSessionExpiry, updateActivity]);

  return {
    validateBeforeOperation,
    validateSession,
    updateActivity,
  };
};

// Export a function that can be used outside of React components
export const validateSessionBeforeOperation = async (): Promise<boolean> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      return false;
    }

    // Check if token is expired or about to expire
    const expiresAt = session.expires_at;
    if (expiresAt) {
      const expiresAtMs = expiresAt * 1000;
      const now = Date.now();
      
      if (expiresAtMs <= now) {
        // Token expired, try to refresh
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
};
