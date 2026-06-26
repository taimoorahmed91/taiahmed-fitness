
CREATE TABLE public.fittrack_api_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fittrack_api_tokens TO authenticated;
GRANT ALL ON public.fittrack_api_tokens TO service_role;
ALTER TABLE public.fittrack_api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own token meta" ON public.fittrack_api_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
