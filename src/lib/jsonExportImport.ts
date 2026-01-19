import { Meal, GymSession } from '@/types';
import { WeightEntry } from '@/hooks/useWeight';
import { WaistEntry } from '@/hooks/useWaist';
import { SleepEntry } from '@/hooks/useSleep';

export interface ExportedData {
  version: string;
  exportDate: string;
  data: {
    meals: Omit<Meal, 'id'>[];
    workouts: Omit<GymSession, 'id'>[];
    weight: Omit<WeightEntry, 'id'>[];
    waist: Omit<WaistEntry, 'id'>[];
    sleep: Omit<SleepEntry, 'id'>[];
  };
}

interface FullExportData {
  meals: Meal[];
  workouts: GymSession[];
  weight: WeightEntry[];
  waist: WaistEntry[];
  sleep: SleepEntry[];
}

export const exportToJSON = (data: FullExportData): void => {
  const exportData: ExportedData = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    data: {
      meals: data.meals.map(({ id, ...rest }) => rest),
      workouts: data.workouts.map(({ id, ...rest }) => rest),
      weight: data.weight.map(({ id, ...rest }) => rest),
      waist: data.waist.map(({ id, ...rest }) => rest),
      sleep: data.sleep.map(({ id, ...rest }) => rest),
    },
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  link.href = URL.createObjectURL(blob);
  link.download = `fittrack_backup_${date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const validateImportData = (data: unknown): ExportedData | null => {
  if (!data || typeof data !== 'object') return null;
  
  const d = data as Record<string, unknown>;
  
  if (!d.version || !d.exportDate || !d.data) return null;
  
  const innerData = d.data as Record<string, unknown>;
  if (!Array.isArray(innerData.meals) || 
      !Array.isArray(innerData.workouts) || 
      !Array.isArray(innerData.weight) || 
      !Array.isArray(innerData.sleep)) {
    return null;
  }

  // Waist is optional for backward compatibility with v1.0 exports
  if (innerData.waist !== undefined && !Array.isArray(innerData.waist)) {
    return null;
  }

  // Add empty waist array if not present (backward compatibility)
  if (!innerData.waist) {
    innerData.waist = [];
  }

  return data as ExportedData;
};

export const readJSONFile = (file: File): Promise<ExportedData | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        const validated = validateImportData(parsed);
        resolve(validated);
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
};
