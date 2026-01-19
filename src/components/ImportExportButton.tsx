import { useRef, useState } from 'react';
import { Download, Upload, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useWaist } from '@/hooks/useWaist';
import { useSleep } from '@/hooks/useSleep';
import { exportToCSV, exportAllToCSV } from '@/lib/exportData';
import { exportToJSON, readJSONFile, ExportedData } from '@/lib/jsonExportImport';
import { toast } from 'sonner';

export const ImportExportButton = () => {
  const { meals, addMeal, refetch: refetchMeals } = useMeals();
  const { sessions, addSession, refetch: refetchGym } = useGymSessions();
  const { entries: weightEntries, addEntry: addWeight, refetch: refetchWeight } = useWeight();
  const { entries: waistEntries, addEntry: addWaist, refetch: refetchWaist } = useWaist();
  const { entries: sleepEntries, addEntry: addSleep, refetch: refetchSleep } = useSleep();
  
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState<ExportedData | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const data = {
    meals,
    workouts: sessions,
    weight: weightEntries,
    waist: waistEntries,
    sleep: sleepEntries,
  };

  const handleExportCSV = (type: 'meals' | 'workouts' | 'weight' | 'sleep' | 'all') => {
    if (type === 'all') {
      exportAllToCSV(data);
      toast.success('All data exported to CSV!');
    } else {
      exportToCSV(type, data);
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} data exported to CSV!`);
    }
  };

  const handleExportJSON = () => {
    exportToJSON(data);
    toast.success('Backup exported as JSON!');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const parsed = await readJSONFile(file);
    if (!parsed) {
      toast.error('Invalid backup file. Please select a valid FitTrack JSON backup.');
      return;
    }

    setImportData(parsed);
    setImportDialogOpen(true);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!importData) return;
    
    setImporting(true);
    
    try {
      // Import meals
      for (const meal of importData.data.meals) {
        await addMeal(meal);
      }
      
      // Import workouts
      for (const workout of importData.data.workouts) {
        await addSession(workout);
      }
      
      // Import weight entries
      for (const weight of importData.data.weight) {
        await addWeight(weight);
      }
      
      // Import sleep entries
      for (const sleep of importData.data.sleep) {
        await addSleep(sleep);
      }
      
      // Import waist entries
      for (const waist of importData.data.waist || []) {
        await addWaist(waist);
      }
      
      // Refresh all data
      await Promise.all([refetchMeals(), refetchGym(), refetchWeight(), refetchWaist(), refetchSleep()]);
      
      const waistCount = importData.data.waist?.length || 0;
      toast.success(`Imported ${importData.data.meals.length} meals, ${importData.data.workouts.length} workouts, ${importData.data.weight.length} weight, ${waistCount} waist, ${importData.data.sleep.length} sleep entries`);
      setImportDialogOpen(false);
      setImportData(null);
    } catch (error) {
      toast.error('Failed to import some data. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" title="Import/Export Data">
            <Download className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Export as CSV</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handleExportCSV('all')}>
            <Download className="h-4 w-4 mr-2" />
            Export All (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportCSV('meals')}>
            Export Meals
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportCSV('workouts')}>
            Export Workouts
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportCSV('weight')}>
            Export Weight
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportCSV('sleep')}>
            Export Sleep
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Backup & Restore</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleExportJSON}>
            <FileJson className="h-4 w-4 mr-2" />
            Export Backup (JSON)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import Backup
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Backup Data</DialogTitle>
            <DialogDescription>
              This will add the following data to your account. Existing data will not be removed.
            </DialogDescription>
          </DialogHeader>
          
          {importData && (
            <div className="space-y-2 text-sm">
              <p>Backup from: {new Date(importData.exportDate).toLocaleDateString()}</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>{importData.data.meals.length} meals</li>
                <li>{importData.data.workouts.length} workouts</li>
                <li>{importData.data.weight.length} weight entries</li>
                <li>{importData.data.waist?.length || 0} waist entries</li>
                <li>{importData.data.sleep.length} sleep entries</li>
              </ul>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
