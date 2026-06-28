
-- Add source column to fittrack_sleep so manual and WHOOP rows can coexist per date
ALTER TABLE public.fittrack_sleep
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Unique per user/date/source so we can upsert WHOOP rows safely
CREATE UNIQUE INDEX IF NOT EXISTS fittrack_sleep_user_date_source_uniq
  ON public.fittrack_sleep (user_id, date, source);

-- Backport: insert WHOOP sleep rows that don't already exist as a whoop-sourced row
INSERT INTO public.fittrack_sleep (user_id, date, hours, notes, source, created_at, updated_at)
SELECT w.user_id,
       w.date,
       w.total_in_bed_hours,
       'Imported from WHOOP',
       'whoop',
       COALESCE(w.created_at, now()),
       now()
FROM public.fittrack_whoop_data w
WHERE w.total_in_bed_hours IS NOT NULL
ON CONFLICT (user_id, date, source) DO NOTHING;
