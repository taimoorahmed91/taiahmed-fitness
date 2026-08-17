ALTER TABLE public.fittrack_api_tokens ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.fittrack_api_tokens ALTER COLUMN expires_at DROP DEFAULT;
UPDATE public.fittrack_api_tokens SET expires_at = NULL;