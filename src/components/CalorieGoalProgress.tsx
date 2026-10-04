import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Target, Pencil, Check, X } from 'lucide-react';
import { formatRange } from '@/lib/targets';
import { TargetRangeBar } from '@/components/TargetRangeBar';

interface CalorieGoalProgressProps {
  current: number;
  goal: number;
  goalMax?: number;
  onGoalChange: (goal: number) => void;
  autoMode?: boolean;
  dayType?: 'gym' | 'rest';
}

export const CalorieGoalProgress = ({ current, goal, goalMax, onGoalChange, autoMode = false, dayType }: CalorieGoalProgressProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(goal.toString());

  const range = { min: goal, max: Math.max(goal, goalMax ?? goal) };
  const percentage = Math.round((current / goal) * 100);
  const remainingLabel = formatRange({ min: Math.max(range.min - current, 0), max: Math.max(range.max - current, 0) });

  const handleSave = () => {
    const newGoal = parseInt(editValue);
    if (newGoal > 0) {
      onGoalChange(newGoal);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(goal.toString());
    setIsEditing(false);
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Daily Calorie Goal
            {autoMode && dayType && (
              <span
                className={`text-xs font-semibold ${
                  dayType === 'gym' ? 'text-chart-2' : 'text-orange-500'
                }`}
              >
                {dayType === 'gym' ? 'Gym day' : 'Rest day'}
              </span>
            )}
          </span>
          {!isEditing && !autoMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditValue(goal.toString());
                setIsEditing(true);
              }}
              className="h-8 w-8"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <TargetRangeBar current={current} range={range} />
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm text-muted-foreground">Consumed</span>
          <span className="text-2xl font-bold text-primary">{current}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              Min <span className="font-semibold text-foreground">{Math.round(range.min)}</span>
            </span>
            <span className="text-sm text-chart-2 font-medium">Remaining {Math.max(range.min - current, 0)}</span>
            <span className="text-sm font-semibold">{Math.round((current / range.min) * 100)}%</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              Max <span className="font-semibold text-foreground">{Math.round(range.max)}</span>
            </span>
            <span className="text-sm text-chart-2 font-medium">Remaining {Math.max(range.max - current, 0)}</span>
            <span className="text-sm font-semibold">{Math.round((current / range.max) * 100)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
