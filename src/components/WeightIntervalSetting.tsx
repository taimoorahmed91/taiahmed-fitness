import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scale } from 'lucide-react';

interface WeightIntervalSettingProps {
  interval: number;
  onIntervalChange: (interval: number) => void;
}

const intervalOptions = [
  { value: 1, label: 'Every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 5, label: 'Every 5 days' },
  { value: 7, label: 'Every 7 days (weekly)' },
];

export const WeightIntervalSetting = ({ interval, onIntervalChange }: WeightIntervalSettingProps) => {
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Scale className="h-5 w-5 text-primary" />
          Weight Measurement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          How often would you like to be reminded to weigh yourself?
        </p>
        <Select
          value={interval.toString()}
          onValueChange={(value) => onIntervalChange(parseInt(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select interval" />
          </SelectTrigger>
          <SelectContent>
            {intervalOptions.map((option) => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Current setting: Measure weight every <span className="font-medium">{interval}</span> day{interval !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  );
};
