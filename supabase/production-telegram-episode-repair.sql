-- HJ GROUPS one-time production repair for the currently observed duplicate
-- Telegram episode numbering in story_id = 3.
--
-- Current state observed on 2026-10-05:
--   1..1150 exist, but 1051..1150 each have a second row.
--   The later-created duplicate rows contain Telegram message IDs for the
--   next source episodes and must become 1151..1250.
--
-- REVIEW before execution. This script does not delete rows.
-- It temporarily moves the affected second rows away from active numbering,
-- then assigns the final contiguous numbers.

BEGIN;

CREATE TEMP TABLE hj_telegram_episode_repair AS
SELECT
  id,
  number,
  episode_number,
  number + 100 AS final_number
FROM (
  SELECT
    id,
    number,
    episode_number,
    row_number() OVER (PARTITION BY number ORDER BY created_at ASC, id ASC) AS rn
  FROM public.episodes
  WHERE story_id = 3
    AND number BETWEEN 1051 AND 1150
) ranked
WHERE rn = 2;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM hj_telegram_episode_repair;
  IF affected <> 100 THEN
    RAISE EXCEPTION 'Expected exactly 100 duplicate Telegram rows for story 3, found %; aborting repair.', affected;
  END IF;
END $$;

UPDATE public.episodes e
SET
  number = 1000000 + r.final_number,
  episode_number = 1000000 + r.final_number
FROM hj_telegram_episode_repair r
WHERE e.id = r.id;

UPDATE public.episodes e
SET
  number = r.final_number,
  episode_number = r.final_number
FROM hj_telegram_episode_repair r
WHERE e.id = r.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.episodes
    WHERE story_id = 3
    GROUP BY number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Repair left duplicate episode numbers in story 3; transaction will roll back.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.episodes
    WHERE story_id = 3
      AND number BETWEEN 1 AND 1250
  ) <> 1250 THEN
    RAISE EXCEPTION 'Repair verification failed: story 3 is not exactly 1250 rows numbered 1..1250.';
  END IF;

  IF (
    SELECT min(number) FROM public.episodes WHERE story_id = 3
  ) <> 1
  OR (
    SELECT max(number) FROM public.episodes WHERE story_id = 3
  ) <> 1250
  THEN
    RAISE EXCEPTION 'Repair verification failed: story 3 min/max numbering is not 1..1250.';
  END IF;
END $$;

COMMIT;
