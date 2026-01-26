import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface DailyNote {
  id: string;
  user_id: string;
  date: string;
  tags: string[];
  severity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SYMPTOM_TAGS = [
  'Nausea',
  'Upset Stomach',
  'Headache',
  'Fatigue',
  'Stressed',
  'Fever',
  'Cold/Flu',
  'Allergies',
  'Poor Sleep',
  'Overate',
  'Skipped Meal',
  'Alcohol',
  'Travel',
  'Period',
  'Medication',
] as const;

export const useDailyNotes = () => {
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { toast } = useToast();

  const fetchNotes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('fittrack_daily_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      console.error('Error fetching daily notes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load daily notes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [user]);

  const addNote = async (note: { date: string; tags: string[]; severity?: number | null; notes?: string }) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('fittrack_daily_notes').upsert(
        {
          user_id: user.id,
          date: note.date,
          tags: note.tags,
          severity: note.severity || null,
          notes: note.notes || null,
        },
        { onConflict: 'user_id,date' }
      );

      if (error) throw error;

      toast({
        title: 'Note saved',
        description: 'Your daily note has been saved.',
      });

      fetchNotes();
    } catch (error: any) {
      console.error('Error adding daily note:', error);
      toast({
        title: 'Error',
        description: 'Failed to save daily note',
        variant: 'destructive',
      });
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_daily_notes').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Note deleted',
        description: 'Your daily note has been removed.',
      });

      fetchNotes();
    } catch (error: any) {
      console.error('Error deleting daily note:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete daily note',
        variant: 'destructive',
      });
    }
  };

  const getNoteForDate = (date: string): DailyNote | undefined => {
    return notes.find((note) => note.date === date);
  };

  const getNotesMap = (): Map<string, DailyNote> => {
    const map = new Map<string, DailyNote>();
    notes.forEach((note) => {
      map.set(note.date, note);
    });
    return map;
  };

  return {
    notes,
    loading,
    addNote,
    deleteNote,
    getNoteForDate,
    getNotesMap,
    refetch: fetchNotes,
  };
};
