import { useState, useMemo, useEffect } from 'react';
import { GymForm } from '@/components/GymForm';
import { GymList } from '@/components/GymList';
import { DataFilter } from '@/components/DataFilter';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useDataFilter } from '@/hooks/useDataFilter';
import { useWorkoutTemplates, WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { WorkoutTemplateForm } from '@/components/WorkoutTemplateForm';
import { WorkoutTemplateList } from '@/components/WorkoutTemplateList';
import { ActiveWorkoutModal } from '@/components/ActiveWorkoutModal';
import { EditTemplateModal } from '@/components/EditTemplateModal';
import { EditWorkoutSessionModal } from '@/components/EditWorkoutSessionModal';
import { GymSession } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dumbbell, ClipboardList, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

const ACTIVE_WORKOUT_KEY = 'fittrack-active-workout';

type PausedWorkoutInfo = { templateId: string; templateName: string };

const readPausedWorkout = (): PausedWorkoutInfo | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.templateId) return null;
    return { templateId: s.templateId, templateName: s.templateName ?? '' };
  } catch {
    return null;
  }
};

const Gym = () => {
  const { sessions, addSession, deleteSession, updateSession, getThisWeekSessions, getLastSessionByTemplateName } = useGymSessions();
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useWorkoutTemplates();
  const [editingSession, setEditingSession] = useState<GymSession | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<WorkoutTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null);
  const [pausedWorkout, setPausedWorkout] = useState<PausedWorkoutInfo | null>(() => readPausedWorkout());
  const [blockedStart, setBlockedStart] = useState<{ requested: WorkoutTemplate; existing: PausedWorkoutInfo } | null>(null);

  // Re-check paused workout when modal closes or window regains focus
  useEffect(() => {
    const refresh = () => setPausedWorkout(readPausedWorkout());
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [activeTemplate]);

  const {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    dateRange,
    setDateRange,
    filteredData: filteredSessions,
  } = useDataFilter({
    data: sessions,
    searchFields: ['exercise', 'notes'] as (keyof GymSession)[],
    dateField: 'date' as keyof GymSession,
  });

  const handleEditClick = (session: GymSession) => {
    setEditingSession(session);
  };

  const handleStartWorkout = (template: WorkoutTemplate) => {
    if (activeTemplate) {
      // Modal already open
      if (activeTemplate.id === template.id) return;
      setBlockedStart({
        requested: template,
        existing: { templateId: activeTemplate.id, templateName: activeTemplate.name },
      });
      return;
    }
    const existing = readPausedWorkout();
    if (existing) {
      // Same template paused — resume directly
      if (existing.templateId === template.id) {
        setActiveTemplate(template);
        return;
      }
      // Different template paused — show centered prompt with resume option
      setBlockedStart({ requested: template, existing });
      return;
    }
    setActiveTemplate(template);
  };

  const handleResumePaused = () => {
    const info = pausedWorkout ?? blockedStart?.existing;
    if (!info) return;
    const tpl = templates.find((t) => t.id === info.templateId);
    if (!tpl) {
      toast.error('Paused workout template not found. Clearing saved state.');
      try { localStorage.removeItem(ACTIVE_WORKOUT_KEY); } catch { /* noop */ }
      setPausedWorkout(null);
      setBlockedStart(null);
      return;
    }
    setBlockedStart(null);
    setActiveTemplate(tpl);
  };

  const handleFinishWorkout = async (data: { exercise: string; duration: number; date: string; notes?: string }): Promise<boolean> => {
    try {
      await addSession(data);
      toast.success('Workout logged!');
      return true;
    } catch {
      return false;
    }
  };

  const handleEditTemplate = (template: WorkoutTemplate) => {
    setEditingTemplate(template);
  };

  const handleSaveTemplate = async (id: string, updates: { name: string; exercises: string[] }) => {
    await updateTemplate(id, updates);
  };

  // Parse notes to extract exercise names for creating template
  const parseNotesToExercises = (notes: string | undefined): string[] => {
    if (!notes) return [];
    
    // Notes format: "Exercise1: S1:12 S2:10 | Exercise2: S1:15 S2:12"
    const exerciseParts = notes.split(' | ');
    const exercises: string[] = [];
    
    for (const part of exerciseParts) {
      const colonIndex = part.indexOf(':');
      if (colonIndex !== -1) {
        const exerciseName = part.substring(0, colonIndex).trim();
        if (exerciseName) {
          exercises.push(exerciseName);
        }
      }
    }
    
    return exercises;
  };

  const handleCreateTemplateFromSession = async (session: GymSession) => {
    // Try to extract exercises from notes first
    let exercises = parseNotesToExercises(session.notes);
    
    // If no exercises found in notes, use the exercise name as a single exercise
    if (exercises.length === 0) {
      exercises = [session.exercise];
    }
    
    // Create template with the session's exercise name as the template name
    await addTemplate({
      name: session.exercise,
      exercises,
    });
    
    toast.success(`Template "${session.exercise}" created with ${exercises.length} exercise(s)`);
  };

  // Calculate stats
  const thisWeekSessions = getThisWeekSessions();
  const thisWeekCount = thisWeekSessions.length;
  
  const todayWorkouts = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return sessions.filter(s => s.date === today).length;
  }, [sessions]);

  const totalDuration = useMemo(() => {
    return sessions.reduce((sum, s) => sum + s.duration, 0);
  }, [sessions]);

  const thisWeekDuration = useMemo(() => {
    return thisWeekSessions.reduce((sum, s) => sum + s.duration, 0);
  }, [thisWeekSessions]);

  const avgDuration = useMemo(() => {
    if (sessions.length === 0) return 0;
    return Math.round(totalDuration / sessions.length);
  }, [sessions, totalDuration]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Dumbbell className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Gym Schedule</h1>
          <p className="text-muted-foreground mt-1">Log your workouts and track your progress</p>
        </div>
      </div>

      {pausedWorkout && !activeTemplate && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <PlayCircle className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Paused workout in progress</p>
                <p className="text-sm text-muted-foreground">
                  {pausedWorkout.templateName || 'Untitled workout'}
                </p>
              </div>
            </div>
            <Button onClick={handleResumePaused}>Resume workout</Button>
          </CardContent>
        </Card>
      )}



      <Tabs defaultValue="log" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="log" className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4" />
            Log Workout
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-6 mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <GymForm onSubmit={addSession} />
            
            {/* Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle>Current Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">This Week's Workouts</p>
                  <p className="text-3xl font-bold">{thisWeekCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">This Week's Duration</p>
                  <p className="text-xl font-semibold">{thisWeekDuration} min</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Today's Workouts</p>
                    <p className="text-xl font-semibold">{todayWorkouts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Workouts</p>
                    <p className="text-xl font-semibold">{sessions.length}</p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Average Workout Duration</p>
                  <p className="text-xl font-semibold">{avgDuration} min</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter and List */}
          <DataFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            searchPlaceholder="Search workouts..."
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            showDateRange
          />
          
          <GymList 
            sessions={filteredSessions} 
            onDelete={deleteSession} 
            onEdit={handleEditClick}
            onCreateTemplate={handleCreateTemplateFromSession}
          />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6 mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <WorkoutTemplateForm onSubmit={addTemplate} />
            <WorkoutTemplateList
              templates={templates}
              onDelete={deleteTemplate}
              onStart={handleStartWorkout}
              onEdit={handleEditTemplate}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Workout Modal */}
      <EditWorkoutSessionModal
        session={editingSession}
        open={!!editingSession}
        onClose={() => setEditingSession(null)}
        onSave={updateSession}
      />

      {/* Active Workout Modal */}
      <ActiveWorkoutModal
        template={activeTemplate}
        open={!!activeTemplate}
        onClose={() => setActiveTemplate(null)}
        onFinish={handleFinishWorkout}
        getLastSession={getLastSessionByTemplateName}
      />

      {/* Edit Template Modal */}
      <EditTemplateModal
        template={editingTemplate}
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSave={handleSaveTemplate}
      />

      {/* Centered blocking prompt when another workout is already in progress */}
      <Dialog open={!!blockedStart} onOpenChange={(o) => !o && setBlockedStart(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workout already in progress</DialogTitle>
            <DialogDescription>
              You have a paused workout
              {blockedStart?.existing.templateName ? ` "${blockedStart.existing.templateName}"` : ''}.
              Resume it or close it before starting
              {blockedStart?.requested.name ? ` "${blockedStart.requested.name}"` : ' a new one'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setBlockedStart(null)}>
              Cancel
            </Button>
            <Button onClick={handleResumePaused}>Resume existing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Gym;
