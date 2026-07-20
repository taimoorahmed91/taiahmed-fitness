import { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePersonalData } from '@/hooks/usePersonalData';
import { usePersonalDataHistory, PersonalHistoryField } from '@/hooks/usePersonalDataHistory';
import { useWeight } from '@/hooks/useWeight';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Activity, KeyRound, RefreshCw, Copy, Trash2, AlertTriangle, History, ChevronDown, ChevronUp } from 'lucide-react';


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
  const { latestFor, historyFor, refetch: refetchHistory } = usePersonalDataHistory();
  const { entries: weightEntries } = useWeight();
  const currentWeight = weightEntries[0]?.weight ?? null;

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [gymTarget, setGymTarget] = useState('');
  const [restTarget, setRestTarget] = useState('');
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(data.full_name || '');
    setDob(data.dob || '');
    setAge(data.age?.toString() || (data.dob ? String(calcAge(data.dob) ?? '') : ''));
    setGender(data.gender || '');
    setHeight(data.height_cm?.toString() || '');
    setTargetWeight(data.target_weight_kg?.toString() || '');
    setGymTarget(data.gym_day_calorie_target?.toString() || '');
    setRestTarget(data.rest_day_calorie_target?.toString() || '');
    setWorkoutDays(data.workout_days || []);
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
      gym_day_calorie_target: gymTarget ? parseInt(gymTarget, 10) : null,
      rest_day_calorie_target: restTarget ? parseInt(restTarget, 10) : null,
      workout_days: workoutDays,
    });
    setSaving(false);
    if (error) toast.error('Failed to save personal data');
    else {
      toast.success('Personal data saved');
      refetchHistory();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container py-6 max-w-4xl">
        <div className="flex items-center gap-2 mb-6">
          <User className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Personal Data</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-4">
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

                  </div>

                  <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="target">Target Weight (kg)</Label>
                  <Input
                    id="target"
                    inputMode="decimal"
                    value={targetWeight}
                    onChange={(e) => handleNumeric(e.target.value, setTargetWeight)}
                    placeholder="e.g. 75.5"
                  />
                  <FieldHistory
                    field="target_weight_kg"
                    unit="kg"
                    latest={latestFor('target_weight_kg')}
                    history={historyFor('target_weight_kg')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gymTarget">Gym Day Calorie Target</Label>
                  <Input
                    id="gymTarget"
                    inputMode="numeric"
                    value={gymTarget}
                    onChange={(e) => handleNumeric(e.target.value, setGymTarget)}
                    placeholder="e.g. 2400"
                  />
                  <p className="text-xs text-muted-foreground">Used as your daily goal on days you log a workout.</p>
                  <FieldHistory
                    field="gym_day_calorie_target"
                    unit="kcal"
                    latest={latestFor('gym_day_calorie_target')}
                    history={historyFor('gym_day_calorie_target')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="restTarget">Rest Day Calorie Target</Label>
                  <Input
                    id="restTarget"
                    inputMode="numeric"
                    value={restTarget}
                    onChange={(e) => handleNumeric(e.target.value, setRestTarget)}
                    placeholder="e.g. 1900"
                  />
                  <p className="text-xs text-muted-foreground">Used as your daily goal on days with no workout.</p>
                  <FieldHistory
                    field="rest_day_calorie_target"
                    unit="kcal"
                    latest={latestFor('rest_day_calorie_target')}
                    history={historyFor('rest_day_calorie_target')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Workout Days</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { v: 1, l: 'Monday' },
                      { v: 2, l: 'Tuesday' },
                      { v: 3, l: 'Wednesday' },
                      { v: 4, l: 'Thursday' },
                      { v: 5, l: 'Friday' },
                      { v: 6, l: 'Saturday' },
                      { v: 0, l: 'Sunday' },
                    ].map((d) => (
                      <div key={d.v} className="flex items-center gap-2">
                        <Checkbox
                          id={`wd-${d.v}`}
                          checked={workoutDays.includes(d.v)}
                          onCheckedChange={(checked) => {
                            setWorkoutDays((prev) =>
                              checked
                                ? [...prev, d.v].sort((a, b) => a - b)
                                : prev.filter((x) => x !== d.v)
                            );
                          }}
                        />
                        <Label htmlFor={`wd-${d.v}`} className="cursor-pointer">{d.l}</Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Used by the dashboard to determine workout vs rest days.</p>
                </div>

                  <BmiCard heightCm={height ? parseFloat(height) : null} weightKg={currentWeight} />
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full mt-6">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <ApiTokenCard />
      </main>
    </div>
  );
};

const formatRemaining = (expiresAt: string | null) => {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m remaining`;
};

const ApiTokenCard = () => {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const call = async (action: 'status' | 'generate' | 'revoke') => {
    const { data, error } = await supabase.functions.invoke('api-token', { body: { action } });
    if (error) {
      // Try to surface server-provided error (e.g. 429 rate limit)
      const ctx = (error as { context?: { error?: string; retry_in_seconds?: number } }).context;
      if (ctx?.error) throw new Error(ctx.error);
      throw error;
    }
    return data as {
      token?: string | null;
      expires_at?: string | null;
      exists?: boolean;
    };
  };

  const refreshStatus = async () => {
    try {
      const data = await call('status');
      setExists(!!data.exists);
      setExpiresAt(data.expires_at ?? null);
      if (!data.exists) setPlainToken(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  // ticking countdown
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (new Date(expiresAt).getTime() <= Date.now()) {
        setExists(false);
        setExpiresAt(null);
        setPlainToken(null);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const data = await call('generate');
      setExists(true);
      setExpiresAt(data.expires_at ?? null);
      setPlainToken(data.token ?? null);
      toast.success('New token generated. Copy it now — it will not be shown again.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate token';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await call('revoke');
      setExists(false);
      setExpiresAt(null);
      setPlainToken(null);
      toast.success('Token revoked');
    } catch {
      toast.error('Failed to revoke token');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!plainToken) return;
    await navigator.clipboard.writeText(plainToken);
    toast.success('Token copied to clipboard');
  };

  const masked = '•'.repeat(40);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          MCP Token
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your personal MCP token for external integrations. Only a SHA-256 hash is stored —
          the plaintext is shown <strong>once at generation</strong> and cannot be revealed again.
          Valid for a maximum of <strong>3 hours</strong>, then auto-deleted.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            {plainToken && (
              <div className="space-y-2 p-3 border border-primary/40 rounded-md bg-primary/5">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <AlertTriangle className="h-4 w-4" />
                  Copy now — this token will not be shown again
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 px-3 py-2 rounded-md bg-background font-mono text-xs break-all flex items-center min-h-10">
                    {plainToken}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopy} title="Copy">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {!exists ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={handleGenerate} disabled={busy} className="gap-2">
                  <KeyRound className="h-4 w-4" /> Generate token
                </Button>
              </div>
            ) : (
              <>
                {!plainToken && (
                  <div className="flex items-stretch gap-2">
                    <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-xs break-all flex items-center min-h-10 text-muted-foreground">
                      {masked}
                    </code>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Valid for 3 hours — {formatRemaining(expiresAt)}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={busy} className="gap-2">
                      <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={busy} className="gap-2 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" /> Revoke
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Refreshing generates a new token (shown once) and invalidates the previous one.
                  Generation is rate-limited to once every 30 seconds.
                </p>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};


interface FieldHistoryProps {
  field: PersonalHistoryField;
  unit: string;
  latest: { value: number; changed_at: string } | null;
  history: { id: string; value: number; changed_at: string }[];
}

const FieldHistory = ({ unit, latest, history }: FieldHistoryProps) => {
  const [open, setOpen] = useState(false);
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  if (!latest) {
    return (
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <History className="h-3 w-3" /> No history yet — save to record a value.
      </p>
    );
  }

  const rest = history.slice(1);

  return (
    <div className="text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <History className="h-3 w-3" />
          Current: <strong className="text-foreground">{latest.value}{unit ? ` ${unit}` : ''}</strong> · set {formatDate(latest.changed_at)}
        </span>
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {open ? 'Hide' : `Show ${rest.length} previous`}
          </button>
        )}
      </div>
      {open && rest.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-muted pl-3">
          {rest.map((h) => (
            <li key={h.id} className="flex justify-between gap-2">
              <span>{h.value}{unit ? ` ${unit}` : ''}</span>
              <span>{formatDate(h.changed_at)}</span>
            </li>
          ))}
        </ul>
      )}
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
