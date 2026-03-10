
CREATE TABLE public.fittrack_whoop_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  recovery_score NUMERIC,
  hrv_rmssd_milli NUMERIC,
  resting_heart_rate NUMERIC,
  spo2_percentage NUMERIC,
  skin_temp_celsius NUMERIC,
  sleep_performance_percentage NUMERIC,
  sleep_efficiency_percentage NUMERIC,
  total_in_bed_hours NUMERIC,
  total_rem_sleep_milli NUMERIC,
  total_deep_sleep_milli NUMERIC,
  total_light_sleep_milli NUMERIC,
  total_awake_time_milli NUMERIC,
  respiratory_rate NUMERIC,
  disturbance_count INTEGER,
  sleep_cycle_count INTEGER,
  strain NUMERIC,
  kilojoule NUMERIC,
  average_heart_rate NUMERIC,
  max_heart_rate NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fittrack_whoop_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own whoop data" ON public.fittrack_whoop_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own whoop data" ON public.fittrack_whoop_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own whoop data" ON public.fittrack_whoop_data FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own whoop data" ON public.fittrack_whoop_data FOR UPDATE USING (auth.uid() = user_id);
