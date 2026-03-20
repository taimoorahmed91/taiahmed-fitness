import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WhoopEntry } from '@/hooks/useWhoopData';

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
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && entry) {
      const initial: Record<string, any> = {};
      fields.forEach(f => {
        initial[f.key] = entry[f.key] ?? '';
      });
      setForm(initial);
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!entry) return;
    setSaving(true);
    const updates: Record<string, any> = {};
    fields.forEach(f => {
      const val = form[f.key];
      if (f.type === 'number') {
        updates[f.key] = val === '' || val === null ? null : Number(val);
      } else {
        updates[f.key] = val || null;
      }
    });
    await onSave(entry.id, updates);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit WHOOP Entry</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
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
