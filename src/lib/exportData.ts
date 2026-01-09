import { Meal, GymSession } from '@/types';
import { WeightEntry } from '@/hooks/useWeight';
import { SleepEntry } from '@/hooks/useSleep';

type DataType = 'meals' | 'workouts' | 'weight' | 'sleep';

interface ExportData {
  meals: Meal[];
  workouts: GymSession[];
  weight: WeightEntry[];
  sleep: SleepEntry[];
}

const formatMealsCSV = (meals: Meal[]): string => {
  const headers = ['Date', 'Time', 'Food', 'Calories'];
  const rows = meals.map(m => [m.date, m.time, `"${m.food.replace(/"/g, '""')}"`, m.calories]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

const formatWorkoutsCSV = (sessions: GymSession[]): string => {
  const headers = ['Date', 'Exercise', 'Duration (mins)', 'Notes'];
  const rows = sessions.map(s => [
    s.date, 
    `"${s.exercise.replace(/"/g, '""')}"`, 
    s.duration, 
    `"${(s.notes || '').replace(/"/g, '""')}"`
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

const formatWeightCSV = (entries: WeightEntry[]): string => {
  const headers = ['Date', 'Weight', 'Notes'];
  const rows = entries.map(e => [
    e.date, 
    e.weight, 
    `"${(e.notes || '').replace(/"/g, '""')}"`
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

const formatSleepCSV = (entries: SleepEntry[]): string => {
  const headers = ['Date', 'Hours', 'Notes'];
  const rows = entries.map(e => [
    e.date, 
    e.hours, 
    `"${(e.notes || '').replace(/"/g, '""')}"`
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportToCSV = (type: DataType, data: ExportData) => {
  const date = new Date().toISOString().split('T')[0];
  
  switch (type) {
    case 'meals':
      downloadCSV(formatMealsCSV(data.meals), `fittrack_meals_${date}.csv`);
      break;
    case 'workouts':
      downloadCSV(formatWorkoutsCSV(data.workouts), `fittrack_workouts_${date}.csv`);
      break;
    case 'weight':
      downloadCSV(formatWeightCSV(data.weight), `fittrack_weight_${date}.csv`);
      break;
    case 'sleep':
      downloadCSV(formatSleepCSV(data.sleep), `fittrack_sleep_${date}.csv`);
      break;
  }
};

export const exportAllToCSV = (data: ExportData) => {
  const date = new Date().toISOString().split('T')[0];
  
  const mealsSection = `=== MEALS ===\n${formatMealsCSV(data.meals)}`;
  const workoutsSection = `\n\n=== WORKOUTS ===\n${formatWorkoutsCSV(data.workouts)}`;
  const weightSection = `\n\n=== WEIGHT ===\n${formatWeightCSV(data.weight)}`;
  const sleepSection = `\n\n=== SLEEP ===\n${formatSleepCSV(data.sleep)}`;
  
  const fullContent = mealsSection + workoutsSection + weightSection + sleepSection;
  downloadCSV(fullContent, `fittrack_all_data_${date}.csv`);
};
