import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WhoopEntry } from '@/hooks/useWhoopData';
import { whoopDateLabel } from '@/components/history/WhoopHistoryList';

interface EditWhoopEntryDialogProps {
  entry: WhoopEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<Omit<WhoopEntry, 'id'>>) => Promise<void>;
}

const fields: { key: keyof WhoopEntry; label: string; type: 'number' | 'text' }[] = [
  { key: 'date', label: 'Date', type: 'text' },
  { key: 'recovery_score', label: 'Recovery (%)', type: 'number' },
  { key: 'hrv_rmssd_milli', label: 'HRV (ms)', type: 'number' },
  { key: 'resting_heart_rate', label: 'Resting HR', type: 'number' },
  { key: 'spo2_percentage', label: 'SpO2 (%)', type: 'number' },
  { key: 'skin_temp_celsius', label: 'Skin Temp (°C)', type: 'number' },
  { key: 'sleep_performance_percentage', label: 'Sleep Perf (%)', type: 'number' },
  { key: 'sleep_efficiency_percentage', label: 'Sleep Eff (%)', type: 'number' },
  { key: 'total_in_bed_hours', label: 'In Bed (hours)', type: 'number' },
  { key: 'total_rem_sleep_milli', label: 'REM (ms)', type: 'number' },
  { key: 'total_deep_sleep_milli', label: 'Deep (ms)', type: 'number' },
  { key: 'total_light_sleep_milli', label: 'Light (ms)', type: 'number' },
  { key: 'total_awake_time_milli', label: 'Awake (ms)', type: 'number' },
  { key: 'respiratory_rate', label: 'Resp Rate', type: 'number' },
  { key: 'disturbance_count', label: 'Disturbances', type: 'number' },
  { key: 'sleep_cycle_count', label: 'Cycles', type: 'number' },
  { key: 'strain', label: 'Strain', type: 'number' },
  { key: 'kilojoule', label: 'Kilojoule', type: 'number' },
  { key: 'average_heart_rate', label: 'Avg HR', type: 'number' },
  { key: 'max_heart_rate', label: 'Max HR', type: 'number' },
];

export const EditWhoopEntryDialog = ({ entry, open, onOpenChange, onSave }: EditWhoopEntryDialogProps) => {
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);

  // The page opens this dialog by setting `open` itself, and Radix only calls onOpenChange for the dialog's own
  // open/close gestures. So the form is filled from the entry here, whenever it opens, not in an open handler.
  useEffect(() => {
    if (!open || !entry) return;
    const initial: Record<string, string | number> = {};
    fields.forEach(f => {
      initial[f.key] = entry[f.key] ?? '';
    });
    setForm(initial);
  }, [open, entry]);

  const handleSave = async () => {
    if (!entry) return;
    setSaving(true);
    const updates: Record<string, string | number | null> = {};
    fields.forEach(f => {
      const val = form[f.key];
      if (f.type === 'number') {
        updates[f.key] = val === '' || val === null ? null : Number(val);
      } else {
        updates[f.key] = val || null;
      }
    });
    await onSave(entry.id, updates as Partial<Omit<WhoopEntry, 'id'>>);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit WHOOP Entry</DialogTitle>
          <DialogDescription className="sr-only">
            Change any reading for {entry ? whoopDateLabel(entry.date) : 'this day'}. Empty fields are saved as not recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`whoop-edit-${f.key}`} className="text-xs">{f.label}</Label>
              <Input
                id={`whoop-edit-${f.key}`}
                type={f.type === 'number' ? 'number' : 'text'}
                step="any"
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
