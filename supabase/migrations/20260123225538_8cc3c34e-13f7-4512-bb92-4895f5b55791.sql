-- Add weight_measurement_interval column to fittrack_user_settings
-- Default is 3 days between weight measurements
ALTER TABLE public.fittrack_user_settings 
ADD COLUMN IF NOT EXISTS weight_measurement_interval INTEGER NOT NULL DEFAULT 3;