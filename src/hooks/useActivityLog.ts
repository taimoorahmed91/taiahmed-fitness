import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LogCategory = 
  | 'weight' 
  | 'meal' 
  | 'sleep' 
  | 'gym' 
  | 'waist' 
  | 'daily_notes' 
  | 'goals' 
  | 'workout_templates'
  | 'settings'
  | 'auth'
  | 'whoop';

export type LogAction = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'view' 
  | 'login' 
  | 'logout' 
  | 'start_workout'
  | 'finish_workout'
  | 'cancel_workout'
  | 'export'
  | 'import';

export type LogStatus = 'success' | 'error';

interface LogEntry {
  action: LogAction;
  category: LogCategory;
  status?: LogStatus;
  details?: Record<string, unknown>;
  error_message?: string;
}

/**
 * Fire-and-forget activity logger. Inserts directly into fittrack_activity_logs.
 * Never throws — errors are silently swallowed to avoid breaking main flows.
 */
export const logActivity = async (entry: LogEntry) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('fittrack_activity_logs' as any).insert({
      user_id: user.id,
      action: entry.action,
      category: entry.category,
      status: entry.status || 'success',
      details: entry.details || {},
      error_message: entry.error_message || null,
    });
  } catch {
    // Never let logging break the app
    console.warn('Activity log failed silently');
  }
};

/**
 * React hook that returns a memoized log function.
 */
export const useActivityLog = () => {
  const log = useCallback((entry: LogEntry) => {
    // Fire and forget — don't await
    logActivity(entry);
  }, []);

  return { log };
};
