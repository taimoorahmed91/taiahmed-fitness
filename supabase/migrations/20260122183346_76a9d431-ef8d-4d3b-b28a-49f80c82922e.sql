-- Add email_subscribed column to fittrack_user_settings
ALTER TABLE public.fittrack_user_settings 
ADD COLUMN IF NOT EXISTS email_subscribed BOOLEAN NOT NULL DEFAULT FALSE;