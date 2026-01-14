import { useState, useMemo } from 'react';
import { ArrowLeftRight, Utensils, Dumbbell, Scale, Moon, Check, X } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useSleep } from '@/hooks/useSleep';
import { format } from 'date-fns';

type Category = 'meals' | 'gym' | 'weight' | 'sleep' | null;

interface CompareField {
  label: string;
  key: string;
  format?: (value: any) => string;
}

const Compare = () => {
  const [selectedCategory, setSelectedCategory] = useState<Category>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { meals, loading: mealsLoading } = useMeals();
  const { sessions: gymSessions, loading: gymLoading } = useGymSessions();
  const { entries: weightEntries, loading: weightLoading } = useWeight();
  const { entries: sleepEntries, loading: sleepLoading } = useSleep();

  const categories = [
    { id: 'meals' as const, label: 'Meals', icon: Utensils, color: 'bg-orange-500' },
    { id: 'gym' as const, label: 'Gym', icon: Dumbbell, color: 'bg-blue-500' },
    { id: 'weight' as const, label: 'Weight', icon: Scale, color: 'bg-green-500' },
    { id: 'sleep' as const, label: 'Sleep', icon: Moon, color: 'bg-purple-500' },
  ];

  const getEntries = () => {
    switch (selectedCategory) {
      case 'meals':
        return meals.map(m => ({ id: m.id, date: m.date, label: `${m.food} (${m.calories} cal)`, data: m }));
      case 'gym':
        return gymSessions.map(s => ({ id: s.id, date: s.date, label: `${s.exercise} (${s.duration} min)`, data: s }));
      case 'weight':
        return weightEntries.map(w => ({ id: w.id, date: w.date, label: `${w.weight} kg`, data: w }));
      case 'sleep':
        return sleepEntries.map(s => ({ id: s.id, date: s.date, label: `${s.hours} hours`, data: s }));
      default:
        return [];
    }
  };

  const getCompareFields = (): CompareField[] => {
    switch (selectedCategory) {
      case 'meals':
        return [
          { label: 'Date', key: 'date', format: (v) => format(new Date(v), 'MMM dd, yyyy') },
          { label: 'Time', key: 'time' },
          { label: 'Food', key: 'food' },
          { label: 'Calories', key: 'calories', format: (v) => `${v} cal` },
        ];
      case 'gym':
        return [
          { label: 'Date', key: 'date', format: (v) => format(new Date(v), 'MMM dd, yyyy') },
          { label: 'Exercise', key: 'exercise' },
          { label: 'Duration', key: 'duration', format: (v) => `${v} minutes` },
          { label: 'Notes', key: 'notes', format: (v) => v || 'No notes' },
        ];
      case 'weight':
        return [
          { label: 'Date', key: 'date', format: (v) => format(new Date(v), 'MMM dd, yyyy') },
          { label: 'Weight', key: 'weight', format: (v) => `${v} kg` },
          { label: 'Notes', key: 'notes', format: (v) => v || 'No notes' },
        ];
      case 'sleep':
        return [
          { label: 'Date', key: 'date', format: (v) => format(new Date(v), 'MMM dd, yyyy') },
          { label: 'Hours', key: 'hours', format: (v) => `${v} hours` },
          { label: 'Notes', key: 'notes', format: (v) => v || 'No notes' },
        ];
      default:
        return [];
    }
  };

  const entries = getEntries();
  const compareFields = getCompareFields();
  const isLoading = mealsLoading || gymLoading || weightLoading || sleepLoading;

  const handleToggleEntry = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setSelectedIds([]);
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setSelectedIds([]);
  };

  const selectedEntries = useMemo(() => {
    return selectedIds.map(id => entries.find(e => e.id === id)).filter(Boolean);
  }, [selectedIds, entries]);

  const getValueDifference = (field: CompareField, val1: any, val2: any) => {
    if (field.key === 'calories' || field.key === 'duration' || field.key === 'weight' || field.key === 'hours') {
      const diff = val1 - val2;
      if (diff > 0) return { text: `+${diff}`, color: 'text-green-600' };
      if (diff < 0) return { text: `${diff}`, color: 'text-red-600' };
      return { text: '0', color: 'text-muted-foreground' };
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Compare Entries</h1>
          </div>
          {selectedCategory && (
            <Button variant="outline" onClick={handleReset}>
              Change Category
            </Button>
          )}
        </div>

        {!selectedCategory ? (
          <div className="space-y-4">
            <p className="text-muted-foreground">Select a category to compare entries:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <Card
                  key={cat.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleCategorySelect(cat.id)}
                >
                  <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
                    <div className={`p-3 rounded-full ${cat.color}`}>
                      <cat.icon className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-medium text-foreground">{cat.label}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Entry Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Select 2 Entries to Compare
                  <Badge variant="secondary">{selectedIds.length}/2 selected</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading entries...</p>
                ) : entries.length === 0 ? (
                  <p className="text-muted-foreground">No entries found for this category.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedIds.includes(entry.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => handleToggleEntry(entry.id)}
                      >
                        <Checkbox
                          checked={selectedIds.includes(entry.id)}
                          onCheckedChange={() => handleToggleEntry(entry.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{entry.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(entry.date), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        {selectedIds.includes(entry.id) && (
                          <Badge variant="default">
                            #{selectedIds.indexOf(entry.id) + 1}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comparison View */}
            <Card>
              <CardHeader>
                <CardTitle>Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedIds.length < 2 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Select 2 entries from the list to compare them side by side.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="grid grid-cols-3 gap-4 pb-4 border-b">
                      <div className="font-medium text-muted-foreground">Field</div>
                      <div className="font-medium text-center">Entry 1</div>
                      <div className="font-medium text-center">Entry 2</div>
                    </div>

                    {/* Comparison Rows */}
                    {compareFields.map((field) => {
                      const val1 = selectedEntries[0]?.data?.[field.key];
                      const val2 = selectedEntries[1]?.data?.[field.key];
                      const formatted1 = field.format ? field.format(val1) : val1;
                      const formatted2 = field.format ? field.format(val2) : val2;
                      const diff = getValueDifference(field, val1, val2);
                      const isSame = val1 === val2;

                      return (
                        <div key={field.key} className="grid grid-cols-3 gap-4 py-3 border-b border-border/50">
                          <div className="font-medium text-foreground flex items-center gap-2">
                            {field.label}
                            {isSame ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <X className="h-4 w-4 text-orange-500" />
                            )}
                          </div>
                          <div className="text-center">
                            <span className="text-foreground">{formatted1}</span>
                          </div>
                          <div className="text-center">
                            <span className="text-foreground">{formatted2}</span>
                            {diff && (
                              <span className={`ml-2 text-sm ${diff.color}`}>
                                ({diff.text})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Compare;
