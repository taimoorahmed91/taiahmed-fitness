import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scale, Ruler } from 'lucide-react';

interface WeightIntervalSettingProps {
  interval: number;
  onIntervalChange: (interval: number) => void;
  waistInterval: number;
  onWaistIntervalChange: (interval: number) => void;
}

const intervalOptions = [
  { value: 1, label: 'Every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 5, label: 'Every 5 days' },
  { value: 7, label: 'Every 7 days (weekly)' },
];

export const WeightIntervalSetting = ({
  interval,
  onIntervalChange,
  waistInterval,
  onWaistIntervalChange,
}: WeightIntervalSettingProps) => {
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Scale className="h-5 w-5 text-primary" />
          Measurement Reminders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Scale className="h-4 w-4 text-muted-foreground" />
            Weight
          </div>
          <Select value={interval.toString()} onValueChange={(v) => onIntervalChange(parseInt(v))}>
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select interval" />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((o) => (
                <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Ruler className="h-4 w-4 text-muted-foreground" />
            Waist
          </div>
          <Select value={waistInterval.toString()} onValueChange={(v) => onWaistIntervalChange(parseInt(v))}>
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select interval" />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((o) => (
                <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          Weight every <span className="font-medium">{interval}</span> day{interval !== 1 ? 's' : ''} · Waist every <span className="font-medium">{waistInterval}</span> day{waistInterval !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  );
};
