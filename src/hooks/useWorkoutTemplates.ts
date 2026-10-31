import { shouldShowFetchError } from '@/lib/fetchErrorToast';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser, onAuthIdentityChange } from '@/lib/authSession';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { GymSession } from '@/types';
import {
  chooseTemplates, clearWorkoutOfflineCache, pickLastSessions, readCachedLastSession, readStoredSessionUserId,
  readTemplatesCache, resolveOfflineUserId, writeLastSessionsCache, writeTemplatesCache,
  type CachedTemplate, type TemplatesFetchResult,
} from '@/lib/workoutOfflineCache';
import {
  INITIAL_SOURCE_STATUS, LOADED_SOURCE_STATUS, deriveSourceState, type SourceStatus,
} from '@/app/globalRefresh';
import { useRefreshSource } from '@/app/globalRefreshContext';

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: string[];
  created_at: string;
  updated_at: string;
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;

/** If the server has not answered after this long and an offline copy exists, show the copy meanwhile. */
const SLOW_NETWORK_MS = 6000;

/**
 * Most recent session per template, saved on this device so "last: reps x kg" hints still show offline.
 * Read-only, best effort, and never surfaces an error.
 */
const refreshLastSessionsCache = async (userId: string, templateNames: string[]) => {
  try {
    if (templateNames.length === 0) {
      writeLastSessionsCache(userId, {});
      return;
    }
    const { data, error } = await supabase
      .from('fittrack_gym_sessions')
      .select('*')
      .eq('user_id', userId)
      .in('exercise', templateNames)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);
    if (error || !data) return;
    const sessions: GymSession[] = data.map((row) => ({
      id: row.id,
      exercise: row.exercise,
      duration: row.duration,
      date: row.date,
      notes: row.notes || undefined,
      start_time: row.start_time || undefined,
      end_time: (row as { end_time?: string | null }).end_time || undefined,
    }));
    writeLastSessionsCache(userId, pickLastSessions(sessions, templateNames));
  } catch {
    /* offline copy is best effort */
  }
};

export const useWorkoutTemplates = () => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  // Set when the list on screen came from this device's offline copy instead of the server.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  // `loaded` = a list is on screen that may be shown as real (server list, or the offline copy when the server was unreachable).
  const [status, setStatus] = useState<SourceStatus>(INITIAL_SOURCE_STATUS);
  const userIdRef = useRef<string | null>(null);
  // Only a list that came from the server (or was changed successfully on top of one) is written to the offline copy.
  const syncedRef = useRef(false);

  /**
   * Loads the list. THROWS when the refresh failed, after recording it in `status` (the registered global
   * refresh task and `refetch` build on that; `refetch` swallows it, the task does not). Serving the offline
   * copy because the server could not be reached still counts as a failed refresh: the list is stale.
   */
  const loadTemplates = async ({ isStale }: { isStale: () => boolean }): Promise<void> => {
    const showCache = (userId: string, cache: NonNullable<ReturnType<typeof readTemplatesCache>>) => {
      userIdRef.current = userId;
      syncedRef.current = false;
      setTemplates(cache.data);
      setCachedAt(cache.savedAt);
    };
    /** Nothing trustworthy is on screen (never loaded, other person's list, or only an offline copy): clear it. */
    const clearList = () => {
      syncedRef.current = false;
      setTemplates((prev) => (prev.length === 0 ? prev : []));
      setCachedAt(null);
    };
    // `quiet`: the saved copy is on screen and Gym already says so, so no extra error toast.
    let failure: { error: unknown; quiet?: boolean } | null = null;
    try {
      const user = await getSessionUser();
      if (isStale()) return;
      if (!user) {
        // No live session. If Supabase still holds a stored session (token expired while offline) this is
        // the same person, so their offline copy may be used offline. No stored session = signed out: wipe it.
        const storedId = readStoredSessionUserId();
        const offlineId = resolveOfflineUserId(null, isOnline());
        const cache = offlineId ? readTemplatesCache(offlineId) : null;
        if (offlineId && cache) {
          showCache(offlineId, cache);
          setLoading(false);
          // The saved copy is shown, but it could not be refreshed without a session.
          failure = { error: new Error('No signed-in session to refresh workout templates'), quiet: true };
          setStatus({ loaded: true, failed: true, error: failure.error });
        } else {
          if (!storedId) { clearWorkoutOfflineCache(); }
          userIdRef.current = null;
          clearList();
          setLoading(false);
          setStatus(LOADED_SOURCE_STATUS);
        }
      } else {
        const previousOwner = userIdRef.current;
        const showingServerList = syncedRef.current && previousOwner === user.id;
        userIdRef.current = user.id;
        const cache = readTemplatesCache(user.id);

        const fetched: Promise<TemplatesFetchResult> = Promise.resolve(
          supabase.from('fittrack_workout_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        ).then(({ data, error }): TemplatesFetchResult => {
          if (error) return { ok: false, error };
          return {
            ok: true,
            templates: (data || []).map((t): CachedTemplate => ({
              id: t.id, name: t.name, exercises: (t.exercises as string[]) || [], created_at: t.created_at, updated_at: t.updated_at,
            })),
          };
        }, (error): TemplatesFetchResult => ({ ok: false, error }));

        let result: TemplatesFetchResult | 'slow' = await Promise.race([
          fetched,
          new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), SLOW_NETWORK_MS)),
        ]);
        if (isStale()) return;
        if (result === 'slow') {
          // Slow or half-dead connection: let a workout start from the offline copy while we keep waiting.
          if (cache) { showCache(user.id, cache); setLoading(false); setStatus(LOADED_SOURCE_STATUS); }
          result = await fetched;
          if (isStale()) return;
        }

        const outcome = chooseTemplates({ fetch: result, online: isOnline(), cache });
        if (outcome.source === 'server') {
          syncedRef.current = true;
          setCachedAt(null);
          setTemplates(outcome.templates);
          writeTemplatesCache(user.id, outcome.templates);
          void refreshLastSessionsCache(user.id, outcome.templates.map((t) => t.name));
          setStatus(LOADED_SOURCE_STATUS);
        } else if (outcome.source === 'cache') {
          // The server could not be reached: the saved copy is shown, marked stale. Never "first load empty".
          showCache(user.id, { data: outcome.templates, savedAt: outcome.savedAt });
          failure = { error: (result as { ok: false; error: unknown }).error, quiet: true };
          setStatus({ loaded: true, failed: true, error: failure.error });
        } else {
          // A real refusal (or no server and no saved copy). The saved copy never hides it.
          failure = { error: (result as { ok: false; error: unknown }).error };
          if (showingServerList) {
            // The rows on screen are still the last list the server gave us: keep them, flagged stale.
            setStatus({ loaded: true, failed: true, error: failure.error });
          } else {
            clearList();
            setStatus({ loaded: false, failed: true, error: failure.error });
          }
        }
      }
    } catch (error) {
      failure = { error };
      if (!isStale()) {
        if (syncedRef.current) setStatus((prev) => ({ loaded: prev.loaded, failed: true, error }));
        else { clearList(); setStatus({ loaded: false, failed: true, error }); }
      }
    } finally { if (!isStale()) setLoading(false); }

    if (failure && !isStale()) {
      console.error('Error fetching workout templates:', failure.error);
      if (!failure.quiet && shouldShowFetchError('templates')) toast.error('Failed to fetch workout templates');
      throw failure.error;
    }
  };

  const { refetch, restart } = useRefreshSource(loadTemplates);

  useEffect(() => {
    void restart();
    const subscription = onAuthIdentityChange(() => { void restart(); });
    return () => subscription.unsubscribe();
  }, [restart]);

  // Keep the offline copy in step with successful add / edit / delete (only on top of a server-synced list).
  useEffect(() => {
    if (syncedRef.current && userIdRef.current) writeTemplatesCache(userIdRef.current, templates);
  }, [templates]);

  const state = useMemo(() => deriveSourceState(status), [status]);

  /** Last saved session for a template from this device's offline copy (for use when the server cannot be reached). */
  const getCachedLastSession = (templateName: string): GymSession | null =>
    readCachedLastSession(userIdRef.current ?? resolveOfflineUserId(null, false), templateName);

  const failureDetails = (error: unknown) => (error as { message?: string } | null)?.message || 'Failed';

  /** Every template change resolves `true` only when the server confirmed it, `false` otherwise (never a silent success). */
  const addTemplate = async (template: { name: string; exercises: string[] }): Promise<boolean> => {
    try {
      const user = await getSessionUser();
      if (!user) { toast.error('You must be logged in to create templates'); return false; }

      const { data, error } = await supabase.from('fittrack_workout_templates').insert({ user_id: user.id, name: template.name, exercises: template.exercises }).select().single();
      if (error) throw error;

      setTemplates((prev) => [{ id: data.id, name: data.name, exercises: (data.exercises as string[]) || [], created_at: data.created_at, updated_at: data.updated_at }, ...prev]);
      toast.success('Workout template created!');
      logActivity({ action: 'create', category: 'workout_templates', details: { name: template.name, exercises: template.exercises } });
      return true;
    } catch (error) {
      console.error('Error adding workout template:', error);
      toast.error('Failed to create workout template');
      logActivity({ action: 'create', category: 'workout_templates', status: 'error', error_message: failureDetails(error), details: { name: template.name } });
      return false;
    }
  };

  const updateTemplate = async (id: string, updates: { name?: string; exercises?: string[] }): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_workout_templates').update(updates).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) {
        // Nothing was updated (gone, or not allowed for this account). Show the server's list again.
        void restart();
        toast.error('Could not update this template. It may have been removed, or this account cannot change it.');
        logActivity({ action: 'update', category: 'workout_templates', status: 'error', error_message: 'No row updated', details: { id } });
        return false;
      }
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates, updated_at: data.updated_at ?? t.updated_at } : t)));
      toast.success('Template updated successfully');
      logActivity({ action: 'update', category: 'workout_templates', details: { id, ...updates } });
      return true;
    } catch (error) {
      console.error('Error updating workout template:', error);
      toast.error('Failed to update template');
      logActivity({ action: 'update', category: 'workout_templates', status: 'error', error_message: failureDetails(error), details: { id } });
      return false;
    }
  };

  const deleteTemplate = async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_workout_templates').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        void restart();
        toast.error('Could not delete this template. It may already be gone, or this account cannot delete it.');
        logActivity({ action: 'delete', category: 'workout_templates', status: 'error', error_message: 'No row deleted', details: { id } });
        return false;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success('Template deleted');
      logActivity({ action: 'delete', category: 'workout_templates', details: { id } });
      return true;
    } catch (error) {
      console.error('Error deleting workout template:', error);
      toast.error('Failed to delete template');
      logActivity({ action: 'delete', category: 'workout_templates', status: 'error', error_message: failureDetails(error), details: { id } });
      return false;
    }
  };

  return {
    templates, loading, isCached: cachedAt !== null, cachedAt, getCachedLastSession, addTemplate, updateTemplate, deleteTemplate, refetch,
    state, phase: state.phase, loadFailed: state.loadFailed, refreshFailed: state.refreshFailed, error: state.error,
  };
};
