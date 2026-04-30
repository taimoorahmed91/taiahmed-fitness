import { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useWeight } from '@/hooks/useWeight';
import { toast } from 'sonner';
import { User, Activity } from 'lucide-react';

const calcAge = (dob: string | null): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
};

const PersonalDataPage = () => {
  const { data, loading, save } = usePersonalData();
  const { entries: weightEntries } = useWeight();
  const currentWeight = weightEntries[0]?.weight ?? null;

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(data.full_name || '');
    setDob(data.dob || '');
    setAge(data.age?.toString() || (data.dob ? String(calcAge(data.dob) ?? '') : ''));
    setGender(data.gender || '');
    setHeight(data.height_cm?.toString() || '');
    setTargetWeight(data.target_weight_kg?.toString() || '');
  }, [data]);

  const handleDobChange = (val: string) => {
    setDob(val);
    const a = calcAge(val);
    if (a !== null) setAge(String(a));
  };

  const handleNumeric = (val: string, setter: (v: string) => void) => {
    const v = val.replace(',', '.');
    if (v === '' || /^\d*\.?\d*$/.test(v)) setter(v);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save({
      full_name: fullName || null,
      dob: dob || null,
      age: age ? parseInt(age, 10) : null,
      gender: gender || null,
      height_cm: height ? parseFloat(height) : null,
      target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
    });
    setSaving(false);
    if (error) toast.error('Failed to save personal data');
    else toast.success('Personal data saved');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container py-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <User className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Personal Data</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => handleDobChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    inputMode="numeric"
                    value={age}
                    onChange={(e) => handleNumeric(e.target.value, setAge)}
                    placeholder="Auto-calculated from DOB"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Gender</Label>
                  <RadioGroup
                    value={gender}
                    onValueChange={setGender}
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="M" id="g-m" />
                      <Label htmlFor="g-m" className="cursor-pointer">Male</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="F" id="g-f" />
                      <Label htmlFor="g-f" className="cursor-pointer">Female</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    inputMode="decimal"
                    value={height}
                    onChange={(e) => handleNumeric(e.target.value, setHeight)}
                    placeholder="e.g. 175"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target">Target Weight (kg)</Label>
                  <Input
                    id="target"
                    inputMode="decimal"
                    value={targetWeight}
                    onChange={(e) => handleNumeric(e.target.value, setTargetWeight)}
                    placeholder="e.g. 75.5"
                  />
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-6">
          <BmiCard heightCm={height ? parseFloat(height) : null} weightKg={currentWeight} />
        </div>
      </main>
    </div>
  );
};

interface BmiCardProps {
  heightCm: number | null;
  weightKg: number | null;
}

const BmiCard = ({ heightCm, weightKg }: BmiCardProps) => {
  const bmi =
    heightCm && heightCm > 0 && weightKg && weightKg > 0
      ? weightKg / Math.pow(heightCm / 100, 2)
      : null;

  const categories = [
    { label: 'Underweight', range: '< 18.5', min: 0, max: 18.5, color: 'bg-yellow-500' },
    { label: 'Normal', range: '18.5 – 24.9', min: 18.5, max: 25, color: 'bg-green-500' },
    { label: 'Overweight', range: '25 – 29.9', min: 25, max: 30, color: 'bg-orange-500' },
    { label: 'Obese', range: '30+', min: 30, max: Infinity, color: 'bg-red-500' },
  ];

  const activeIdx = bmi !== null ? categories.findIndex((c) => bmi >= c.min && bmi < c.max) : -1;
  const activeCat = activeIdx >= 0 ? categories[activeIdx] : null;

  // Marker position on a 0-100 scale where 15 -> 0% and 35 -> 100%
  const markerPct =
    bmi !== null ? Math.max(0, Math.min(100, ((bmi - 15) / (35 - 15)) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          BMI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {bmi === null ? (
          <p className="text-sm text-muted-foreground">
            Enter your height and log a weight entry to see your BMI.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">{bmi.toFixed(1)}</span>
              {activeCat && (
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full text-white ${activeCat.color}`}
                >
                  {activeCat.label}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on {weightKg} kg / {heightCm} cm
            </p>

            {/* Color scale */}
            <div className="space-y-2">
              <div className="relative h-3 rounded-full overflow-hidden flex">
                {categories.map((c) => (
                  <div key={c.label} className={`flex-1 ${c.color}`} />
                ))}
                <div
                  className="absolute top-[-4px] w-1 h-5 bg-foreground rounded"
                  style={{ left: `calc(${markerPct}% - 2px)` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground text-center">
                {categories.map((c) => (
                  <div key={c.label}>
                    <div className="font-medium text-foreground">{c.label}</div>
                    <div>{c.range}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PersonalDataPage;
