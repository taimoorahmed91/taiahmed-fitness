
-- First, remove duplicates keeping only the most recent row per user
WITH ranked AS (
  SELECT id, user_id, date,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date DESC) as rn
  FROM fittrack_daily_summary
)
DELETE FROM fittrack_daily_summary
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Verify the unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fittrack_daily_summary_user_id_unique'
  ) THEN
    ALTER TABLE fittrack_daily_summary ADD CONSTRAINT fittrack_daily_summary_user_id_unique UNIQUE (user_id);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    -- Constraint already exists or there's a conflict, ignore
    NULL;
  WHEN others THEN
    RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
END $$;
