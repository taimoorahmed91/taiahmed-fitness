import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Target, Pencil, Check, X } from 'lucide-react';

interface CalorieGoalProgressProps {
  current: number;
  goal: number;
  onGoalChange: (goal: number) => void;
}

export const CalorieGoalProgress = ({ current, goal, onGoalChange }: CalorieGoalProgressProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(goal.toString());

  const percentage = Math.min(Math.round((current / goal) * 100), 100);
  const remaining = Math.max(goal - current, 0);

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
          </span>
          {!isEditing && (
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
      <CardContent className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-semibold">{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-3" />
        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{current}</p>
            <p className="text-xs text-muted-foreground">Consumed</p>
          </div>
          <div className="text-center">
            {isEditing ? (
              <div className="space-y-1">
                <Input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-8 text-center text-lg font-bold"
                  min="1"
                />
                <div className="flex justify-center gap-1">
                  <Button variant="ghost" size="icon" onClick={handleSave} className="h-6 w-6">
                    <Check className="h-3 w-3 text-chart-2" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleCancel} className="h-6 w-6">
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{goal}</p>
                <p className="text-xs text-muted-foreground">Goal</p>
              </>
            )}
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-chart-2">{remaining}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
