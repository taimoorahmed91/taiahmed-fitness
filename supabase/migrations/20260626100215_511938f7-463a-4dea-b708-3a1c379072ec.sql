
-- Swap MCP token storage from encrypted ciphertext to hashed token
ALTER TABLE public.fittrack_api_tokens DROP COLUMN IF EXISTS ciphertext;
ALTER TABLE public.fittrack_api_tokens DROP COLUMN IF EXISTS iv;
ALTER TABLE public.fittrack_api_tokens ADD COLUMN IF NOT EXISTS token_hash text NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fittrack_api_tokens_token_hash_idx ON public.fittrack_api_tokens(token_hash);

-- Rate-limit metadata (persists across revoke/regenerate)
CREATE TABLE IF NOT EXISTS public.fittrack_api_token_rate (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_generated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fittrack_api_token_rate TO authenticated;
GRANT ALL ON public.fittrack_api_token_rate TO service_role;
ALTER TABLE public.fittrack_api_token_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own rate row"
  ON public.fittrack_api_token_rate FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
