import { forwardRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Flame, Dumbbell, Moon, Scale, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { ReportStats } from '@/hooks/useReportData';
import { format } from 'date-fns';

interface ShareableSummaryProps {
  stats: ReportStats;
  dateRange: { from: Date; to: Date };
  userName?: string;
}

export const ShareableSummary = forwardRef<HTMLDivElement, ShareableSummaryProps>(
  ({ stats, dateRange, userName }, ref) => {
    const dateRangeText = `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`;

    return (
      <div
        ref={ref}
        className="w-[400px] p-6 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-2xl border-2 border-primary/20"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">FitTrack</span>
          </div>
          {userName && (
            <p className="text-sm text-muted-foreground">{userName}'s Progress</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{dateRangeText}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-3 text-center">
              <Flame className="h-5 w-5 mx-auto mb-1 text-orange-500" />
              <p className="text-lg font-bold">{stats.avgCalories.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Avg Daily Calories</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-3 text-center">
              <Dumbbell className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{stats.totalWorkouts}</p>
              <p className="text-xs text-muted-foreground">Workouts ({stats.avgWorkoutDuration}min avg)</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-3 text-center">
              <Moon className="h-5 w-5 mx-auto mb-1 text-indigo-500" />
              <p className="text-lg font-bold">{stats.avgSleepHours}h</p>
              <p className="text-xs text-muted-foreground">Avg Sleep</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-3 text-center">
              <Scale className="h-5 w-5 mx-auto mb-1 text-teal-500" />
              <div className="flex items-center justify-center gap-1">
                <p className="text-lg font-bold">{stats.avgWeight > 0 ? `${stats.avgWeight}kg` : '--'}</p>
                {stats.weightChange !== 0 && (
                  <span className={`text-xs flex items-center ${stats.weightChange < 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {stats.weightChange < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {Math.abs(stats.weightChange)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Weight</p>
            </CardContent>
          </Card>
        </div>

        {/* Goal Achievement */}
        <Card className="bg-card/50 border-primary/10">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Goal Days</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-primary">{stats.goalsMetDays}</span>
                <span className="text-sm text-muted-foreground">/{stats.totalDays}</span>
              </div>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${stats.totalDays > 0 ? (stats.goalsMetDays / stats.totalDays) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Generated with FitTrack 💪
        </p>
      </div>
    );
  }
);

ShareableSummary.displayName = 'ShareableSummary';
