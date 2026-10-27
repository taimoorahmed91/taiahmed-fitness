// Public one-click sign-in to a shared demo account filled with sample data.
// The account is a normal approved user (never owner/admin) and is read-only
// through RLS. Sample data is created on first login and only replaced when the
// demo user presses "Generate random data" (action: "regenerate").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo@fittrack.local";
const DAYS = 30;
const TABLES = [
  "fittrack_meals", "fittrack_gym_sessions", "fittrack_workout_templates", "fittrack_weight",
  "fittrack_waist", "fittrack_sleep", "fittrack_whoop_data", "fittrack_daily_notes",
  "fittrack_extra_activities", "fittrack_personal_data", "fittrack_daily_summary",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a: number, b: number) => a + rand() * (b - a);
const round = (n: number, step = 1) => Math.round(n / step) * step;
const isoDay = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

const TEMPLATES: Record<string, { day: number; exercises: [string, number][] }> = {
  "Push Day": { day: 1, exercises: [["Bench Press", 60], ["Overhead Press", 35], ["Incline Dumbbell Press", 22], ["Tricep Pushdown", 25]] },
  "Pull Day": { day: 3, exercises: [["Lat Pulldown", 55], ["Cable Row", 50], ["Face Pull", 20], ["Bicep Curl", 12]] },
  "Leg Day": { day: 5, exercises: [["Squat", 80], ["Romanian Deadlift", 70], ["Leg Press", 140], ["Calf Raise", 60]] },
};

const MEALS = [
  { food: "Greek yogurt with oats and berries", cal: 420, p: 32, c: 55, time: "08:30" },
  { food: "Scrambled eggs on sourdough toast", cal: 480, p: 28, c: 38, time: "09:00" },
  { food: "Chicken breast, rice and broccoli", cal: 650, p: 52, c: 75, time: "13:00" },
  { food: "Salmon poke bowl", cal: 610, p: 40, c: 68, time: "12:30" },
  { food: "Protein shake with banana", cal: 290, p: 30, c: 35, time: "16:30" },
  { food: "Apple and peanut butter", cal: 250, p: 7, c: 28, time: "15:45" },
  { food: "Beef stir fry with noodles", cal: 720, p: 45, c: 80, time: "19:30" },
  { food: "Turkey wrap with salad", cal: 540, p: 38, c: 50, time: "20:00" },
  { food: "Cottage cheese with honey", cal: 210, p: 22, c: 18, time: "22:15" },
];

async function seedData(admin: ReturnType<typeof createClient>, uid: string) {
  seed = Math.floor(Math.random() * 2147483646) + 1;
  for (const t of TABLES) await admin.from(t).delete().eq("user_id", uid);

  const { data: templates } = await admin.from("fittrack_workout_templates")
    .insert(Object.entries(TEMPLATES).map(([name, t]) => ({ user_id: uid, name, exercises: t.exercises.map(([e]) => e) })))
    .select("id, name");
  const dayTemplates: Record<string, string> = {};
  (templates ?? []).forEach((t: { id: string; name: string }) => { dayTemplates[String(TEMPLATES[t.name].day)] = t.id; });

  await admin.from("fittrack_personal_data").insert({
    user_id: uid, full_name: "Demo User", dob: "1992-05-14", age: 34, gender: "male", height_cm: 180,
    target_weight_kg: 78, gym_day_calorie_target: 2300, gym_day_calorie_target_max: 2500,
    rest_day_calorie_target: 2000, rest_day_calorie_target_max: 2200, protein_multiplier: 1.6,
    protein_multiplier_max: 2.0, carb_multiplier: 2.5, carb_multiplier_max: 3.5,
    workout_days: [1, 3, 5], workout_day_templates: dayTemplates,
  });

  const meals: unknown[] = [], gym: unknown[] = [], weight: unknown[] = [], waist: unknown[] = [];
  const sleep: unknown[] = [], whoop: unknown[] = [], extras: unknown[] = [], notes: unknown[] = [];

  for (let offset = DAYS - 1; offset >= 0; offset--) {
    const date = isoDay(offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const progress = (DAYS - offset) / DAYS;

    // 3–4 meals; today only up to the current hour.
    const picks = [0, 2, 4, 6].map((i) => MEALS[i + (rand() > 0.5 ? 1 : 0)]).filter(Boolean);
    if (rand() > 0.6) picks.push(MEALS[8]);
    const hourNow = new Date().getUTCHours();
    picks.forEach((m) => {
      if (offset === 0 && parseInt(m.time) > hourNow) return;
      const f = between(1.0, 1.45);
      meals.push({ user_id: uid, date, time: m.time, food: m.food, calories: round(m.cal * f), protein: round(m.p * f), carbs: round(m.c * f) });
    });

    const tplName = Object.keys(TEMPLATES).find((n) => TEMPLATES[n].day === weekday);
    if (tplName && !(offset === 0 && hourNow < 18)) {
      const parts = TEMPLATES[tplName].exercises.map(([name, base], i) => {
        const w = round(base * (0.92 + progress * 0.1), 2.5);
        const sets = [10, 9, 8].map((r, s) => `S${s + 1}:${r}@${s === 2 ? w + 2.5 : w}kg`).join(" ");
        return `${i + 1}.${name}: ${sets}`;
      });
      const duration = round(between(50, 75));
      const start = new Date(`${date}T17:30:00Z`);
      gym.push({
        user_id: uid, date, exercise: tplName, duration, notes: parts.join(" | "),
        start_time: "17:30", end_time: new Date(start.getTime() + duration * 60000).toISOString(),
      });
    }

    if (offset % 2 === 0) weight.push({ user_id: uid, date, weight: Math.round((84 - progress * 2.4 + between(-0.4, 0.4)) * 10) / 10 });
    if (offset % 7 === 0) waist.push({ user_id: uid, date, waist: Math.round((92 - progress * 2 + between(-0.3, 0.3)) * 10) / 10 });

    const hours = Math.round(between(5.8, 8.4) * 10) / 10;
    sleep.push({ user_id: uid, date, hours, source: "manual" });
    const recovery = round(Math.min(98, Math.max(20, 30 + (hours - 5.5) * 18 + between(-10, 10))));
    whoop.push({
      user_id: uid, date, recovery_score: recovery, hrv_rmssd_milli: round(between(45, 85)), resting_heart_rate: round(between(52, 60)),
      sleep_performance_percentage: round(between(70, 95)), total_in_bed_hours: Math.round((hours + 0.4) * 10) / 10,
      strain: Math.round(between(8, 16) * 10) / 10, kilojoule: round(between(9000, 12500)), respiratory_rate: 15.2,
      cycle_end_timestamp: `${date}T07:00:00.000Z`,
    });

    if (weekday === 0) extras.push({ user_id: uid, date, activity: "Hiking", intensity: 3, duration_minutes: 90, calories: 450, time: "10:00" });
    if (weekday === 2 && offset % 2 === 0) extras.push({ user_id: uid, date, activity: "Cycling", intensity: 2, duration_minutes: 40, calories: 280, time: "07:30" });
    if (offset === 12) notes.push({ user_id: uid, date, tags: ["Poor Sleep", "Fatigue"], severity: 2, notes: "Late night, low energy at the gym." });
    if (offset === 5) notes.push({ user_id: uid, date, tags: ["Overate"], severity: 1, notes: "Birthday dinner." });
  }

  for (const [t, rows] of [["fittrack_meals", meals], ["fittrack_gym_sessions", gym], ["fittrack_weight", weight],
    ["fittrack_waist", waist], ["fittrack_sleep", sleep], ["fittrack_whoop_data", whoop],
    ["fittrack_extra_activities", extras], ["fittrack_daily_notes", notes]] as const) {
    if (rows.length) {
      const { error } = await admin.from(t).insert(rows);
      if (error) console.error(`seed ${t}`, error.message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const body = await req.json().catch(() => ({}));
    const password = Deno.env.get("DEMO_USER_PASSWORD");
    if (!password) return json({ error: "Demo account is not configured" }, 500);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

    if (body?.action === "regenerate") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: caller } = await admin.auth.getUser(jwt);
      if (caller?.user?.email !== DEMO_EMAIL) return json({ error: "Only the demo account can do this" }, 403);
      await seedData(admin, caller.user.id);
      return json({ ok: true });
    }

    // Email/password sign-in is off for this project, so mint a one-time
    // magic-link token server-side and exchange it for a session.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (!list?.users.some((u) => u.email === DEMO_EMAIL)) {
      const { error } = await admin.auth.admin.createUser({
        email: DEMO_EMAIL, password, email_confirm: true, user_metadata: { full_name: "Demo User" },
      });
      if (error) throw error;
    }
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: DEMO_EMAIL });
    if (linkError) throw linkError;
    const signIn = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("No session");
    const uid = signIn.data.user!.id;

    // Approved, never owner. Profiles only allow admins to change approval,
    // so recreate the row instead of updating it.
    const { data: profile } = await admin.from("profiles").select("approved, owner").eq("id", uid).maybeSingle();
    if (profile?.approved !== "yes" || profile?.owner) {
      await admin.from("profiles").delete().eq("id", uid);
      await admin.from("profiles").insert({ id: uid, email: DEMO_EMAIL, full_name: "Demo User", approved: "yes", owner: null });
    }

    const { count } = await admin.from("fittrack_whoop_data").select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    if (!count) await seedData(admin, uid);

    const s = signIn.data.session!;
    return json({ access_token: s.access_token, refresh_token: s.refresh_token });
  } catch (e) {
    console.error("demo-login", e);
    return json({ error: "Could not start the demo" }, 500);
  }
});
