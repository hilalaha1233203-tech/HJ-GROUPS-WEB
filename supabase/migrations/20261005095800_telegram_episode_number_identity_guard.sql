-- HJ GROUPS: future-proof Telegram episode identity guards.
--
-- Deployment prerequisite:
--   Run supabase/production-telegram-episode-repair.sql (or an equivalent
--   reviewed data repair) first if duplicate (story_id, number) rows exist.
-- This migration intentionally fails with a clear message instead of
-- silently changing production content.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.episodes
    WHERE number IS NOT NULL
    GROUP BY story_id, number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create episodes_story_number_unique: duplicate (story_id, number) rows exist. Review and repair episode numbering first.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS episodes_story_number_unique
  ON public.episodes (story_id, number)
  WHERE number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS episodes_story_telegram_message_unique
  ON public.episodes (story_id, telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.video_episodes
    WHERE number IS NOT NULL
    GROUP BY video_story_id, number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create video_episodes_story_number_unique: duplicate (video_story_id, number) rows exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS video_episodes_story_number_unique
  ON public.video_episodes (video_story_id, number)
  WHERE number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS video_episodes_story_telegram_message_unique
  ON public.video_episodes (video_story_id, telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;
