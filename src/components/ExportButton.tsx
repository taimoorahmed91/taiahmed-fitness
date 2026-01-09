import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useSleep } from '@/hooks/useSleep';
import { exportToCSV, exportAllToCSV } from '@/lib/exportData';
import { toast } from 'sonner';

export const ExportButton = () => {
  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { entries: weightEntries } = useWeight();
  const { entries: sleepEntries } = useSleep();

  const data = {
    meals,
    workouts: sessions,
    weight: weightEntries,
    sleep: sleepEntries,
  };

  const handleExport = (type: 'meals' | 'workouts' | 'weight' | 'sleep' | 'all') => {
    if (type === 'all') {
      exportAllToCSV(data);
      toast.success('All data exported!');
    } else {
      exportToCSV(type, data);
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} data exported!`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Export Data">
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('all')}>
          Export All Data
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport('meals')}>
          Export Meals
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('workouts')}>
          Export Workouts
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('weight')}>
          Export Weight
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('sleep')}>
          Export Sleep
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
