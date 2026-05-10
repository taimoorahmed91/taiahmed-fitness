UPDATE public.fittrack_user_settings
SET whoop_api_url = NULL
WHERE whoop_api_url = 'https://apjmwqdiqskgvzkvpjpx.supabase.co/functions/v1/get-latest-collective'
  AND user_id NOT IN (SELECT id FROM auth.users WHERE email = 'taimoorahmed91@gmail.com');