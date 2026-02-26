import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/hooks/useActivityLog';

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: string[];
  created_at: string;
  updated_at: string;
}

export const useWorkoutTemplates = () => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setTemplates([]); setLoading(false); return; }

      const { data, error } = await supabase.from('fittrack_workout_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;

      setTemplates((data || []).map((t) => ({
        id: t.id, name: t.name, exercises: (t.exercises as string[]) || [], created_at: t.created_at, updated_at: t.updated_at,
      })));
    } catch (error) {
      console.error('Error fetching workout templates:', error);
      toast({ title: 'Error', description: 'Failed to fetch workout templates', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTemplates();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { fetchTemplates(); });
    return () => subscription.unsubscribe();
  }, []);

  const addTemplate = async (template: { name: string; exercises: string[] }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast({ title: 'Error', description: 'You must be logged in to create templates', variant: 'destructive' }); return; }

      const { data, error } = await supabase.from('fittrack_workout_templates').insert({ user_id: user.id, name: template.name, exercises: template.exercises }).select().single();
      if (error) throw error;

      setTemplates((prev) => [{ id: data.id, name: data.name, exercises: (data.exercises as string[]) || [], created_at: data.created_at, updated_at: data.updated_at }, ...prev]);
      toast({ title: 'Success', description: 'Workout template created!' });
      logActivity({ action: 'create', category: 'workout_templates', details: { name: template.name, exercises: template.exercises } });
    } catch (error: any) {
      console.error('Error adding workout template:', error);
      toast({ title: 'Error', description: 'Failed to create workout template', variant: 'destructive' });
      logActivity({ action: 'create', category: 'workout_templates', status: 'error', error_message: error?.message || 'Failed', details: { name: template.name } });
    }
  };

  const updateTemplate = async (id: string, updates: { name?: string; exercises?: string[] }) => {
    try {
      const { error } = await supabase.from('fittrack_workout_templates').update(updates).eq('id', id);
      if (error) throw error;
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
      toast({ title: 'Success', description: 'Template updated successfully' });
      logActivity({ action: 'update', category: 'workout_templates', details: { id, ...updates } });
    } catch (error: any) {
      console.error('Error updating workout template:', error);
      toast({ title: 'Error', description: 'Failed to update template', variant: 'destructive' });
      logActivity({ action: 'update', category: 'workout_templates', status: 'error', error_message: error?.message || 'Failed', details: { id } });
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_workout_templates').delete().eq('id', id);
      if (error) throw error;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ title: 'Success', description: 'Template deleted' });
      logActivity({ action: 'delete', category: 'workout_templates', details: { id } });
    } catch (error: any) {
      console.error('Error deleting workout template:', error);
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
      logActivity({ action: 'delete', category: 'workout_templates', status: 'error', error_message: error?.message || 'Failed', details: { id } });
    }
  };

  return { templates, loading, addTemplate, updateTemplate, deleteTemplate, refetch: fetchTemplates };
};
