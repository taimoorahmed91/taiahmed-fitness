-- Add telegram_chat_id column to fittrack_user_settings
ALTER TABLE public.fittrack_user_settings 
ADD COLUMN telegram_chat_id TEXT DEFAULT NULL;

-- Add a column to track if telegram_chat_id has been set (for UI logic)
ALTER TABLE public.fittrack_user_settings 
ADD COLUMN telegram_chat_id_set BOOLEAN NOT NULL DEFAULT FALSE;