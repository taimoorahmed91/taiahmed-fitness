import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { useGoals, GoalProgress } from '@/hooks/useGoals';
import { Target, Plus, Trash2, Flame, Dumbbell, Moon, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const categoryIcons = {
  calories: Flame,
  workouts: Dumbbell,
  sleep: Moon,
};

const categoryLabels = {
  calories: 'Calories',
  workouts: 'Workouts',
  sleep: 'Sleep Hours',
};

const categoryUnits = {
  calories: 'cal',
  workouts: 'sessions',
  sleep: 'hours',
};

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const GoalsCard = () => {
  const { goalsProgress, loading, addGoal, deleteGoal } = useGoals();
  const [showForm, setShowForm] = useState(false);
  const [goalType, setGoalType] = useState<'weekly' | 'monthly'>('weekly');
  const [category, setCategory] = useState<'calories' | 'workouts' | 'sleep'>('workouts');
  const [targetValue, setTargetValue] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetValue || !startDate || !endDate) return;
    
    await addGoal(goalType, category, parseInt(targetValue), startDate, endDate);
    setTargetValue('');
    setShowForm(false);
    // Reset dates for next goal
    setStartDate(new Date());
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 7);
    setEndDate(newEndDate);
  };

  // Same status colours as the target bars: achieved = chart-min (green),
  // on the way = primary, behind = chart-warn (amber). The word and glyph repeat it.
  const getProgressStatus = (percentage: number, achieved: boolean) => {
    if (achieved) return { label: 'Achieved', glyph: '\u2713', indicator: '[&>div]:bg-chart-min', text: 'text-chart-min' };
    if (percentage >= 50) return { label: 'On track', glyph: '\u2192', indicator: '[&>div]:bg-primary', text: 'text-primary' };
    return { label: 'Behind', glyph: '\u2193', indicator: '[&>div]:bg-chart-warn', text: 'text-chart-warn' };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading goals...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          Goals
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          aria-label={showForm ? 'Close new goal form' : 'Add goal'}
          aria-expanded={showForm}
          className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-lg bg-muted/50">
            <div className="grid grid-cols-2 gap-2">
              <Select value={goalType} onValueChange={(v) => setGoalType(v as 'weekly' | 'monthly')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={(v) => setCategory(v as 'calories' | 'workouts' | 'sleep')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calories">Calories</SelectItem>
                  <SelectItem value="workouts">Workouts</SelectItem>
                  <SelectItem value="sleep">Sleep Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-9 text-xs",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear()}
                      toYear={new Date().getFullYear() + 5}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-9 text-xs",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => startDate ? date < startDate : false}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear()}
                      toYear={new Date().getFullYear() + 5}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={`Target ${categoryUnits[category]}`}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                min="1"
              />
              <Button type="submit" size="sm">Add</Button>
            </div>
          </form>
        )}

        {goalsProgress.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No active goals. Set one to start tracking!
          </p>
        ) : (
          <div className="space-y-3">
            {goalsProgress.map((gp: GoalProgress) => {
              const Icon = categoryIcons[gp.goal.category as keyof typeof categoryIcons];
              const isWeekly = gp.goal.goal_type === 'weekly';
              const status = getProgressStatus(gp.percentage, gp.achieved);
              return (
                <div key={gp.goal.id} className="space-y-2 p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium text-sm">
                        {isWeekly ? 'Weekly' : 'Monthly'} {categoryLabels[gp.goal.category as keyof typeof categoryLabels]}
                      </span>
                    </div>
                    <ConfirmDeleteButton
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                      onConfirm={() => deleteGoal(gp.goal.id)} confirmationTitle="Delete goal?" confirmationDescription={`Are you sure you want to delete this ${gp.goal.goal_type} ${categoryLabels[gp.goal.category as keyof typeof categoryLabels]} goal? Your logged activities will stay.`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </ConfirmDeleteButton>
                  </div>
                  
                  {/* Weekly day tracker */}
                  {isWeekly && (
                    <div className="flex items-center justify-between">
                      <ul className="flex gap-1.5" aria-label={`Days passed this week: ${gp.days_passed} of 7`}>
                        {weekDays.map((day, index) => {
                          const isPastOrToday = index < gp.days_passed;
                          return (
                            <li key={day} className="flex flex-col items-center gap-0.5" aria-label={`${day}: ${isPastOrToday ? 'passed' : 'upcoming'}`}>
                              <span className="text-xs text-muted-foreground" aria-hidden="true">{day}</span>
                              <span aria-hidden="true" className={cn('flex h-4 w-4 items-center justify-center rounded-sm border text-xs leading-none', isPastOrToday ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{isPastOrToday ? '\u2713' : ''}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <span className="text-xs text-muted-foreground">Days {gp.days_passed}/7</span>
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{gp.current_value} / {gp.goal.target_value} {categoryUnits[gp.goal.category as keyof typeof categoryUnits]}</span>
                      <span className="flex items-center gap-1">
                        <span className={cn('font-medium', status.text)}><span aria-hidden="true">{status.glyph} </span>{status.label}</span>
                        <span aria-hidden="true">·</span>
                        <span>{gp.percentage}%</span>
                      </span>
                    </div>
                    <Progress value={gp.percentage} aria-label={`${categoryLabels[gp.goal.category as keyof typeof categoryLabels]} goal progress`} className={cn('h-2 bg-progress-track', status.indicator)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
