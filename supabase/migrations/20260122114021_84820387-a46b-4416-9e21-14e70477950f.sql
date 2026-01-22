-- Add telegram_subscribed column to fittrack_user_settings
-- Default is false (unsubscribed)
ALTER TABLE public.fittrack_user_settings 
ADD COLUMN telegram_subscribed BOOLEAN NOT NULL DEFAULT FALSE;