-- HJ GROUPS: extend the existing temporary Ads entitlement row so one
-- entitlement can safely cover a contiguous episode range for one story.
-- Legacy single-episode rows remain valid with NULL range fields.

ALTER TABLE public.ad_unlocks
  ADD COLUMN IF NOT EXISTS story_id bigint,
  ADD COLUMN IF NOT EXISTS start_episode_number integer,
  ADD COLUMN IF NOT EXISTS end_episode_number integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_unlocks_episode_range_check'
      AND conrelid = 'public.ad_unlocks'::regclass
  ) THEN
    ALTER TABLE public.ad_unlocks
      ADD CONSTRAINT ad_unlocks_episode_range_check
      CHECK (
        (start_episode_number IS NULL AND end_episode_number IS NULL)
        OR (
          story_id IS NOT NULL
          AND start_episode_number IS NOT NULL
          AND end_episode_number IS NOT NULL
          AND start_episode_number >= 1
          AND end_episode_number >= start_episode_number
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ad_unlocks_user_story_range_idx
  ON public.ad_unlocks (
    user_id,
    content_type,
    story_id,
    start_episode_number,
    end_episode_number,
    expires_at
  );

ALTER TABLE public.ad_unlocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_unlocks FROM anon, authenticated;
GRANT ALL ON public.ad_unlocks TO service_role;