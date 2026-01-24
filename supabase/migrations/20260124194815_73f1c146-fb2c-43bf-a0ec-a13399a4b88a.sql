-- Add notification_schedule column to store cron expression
ALTER TABLE public.fittrack_user_settings
ADD COLUMN notification_schedule text DEFAULT NULL;