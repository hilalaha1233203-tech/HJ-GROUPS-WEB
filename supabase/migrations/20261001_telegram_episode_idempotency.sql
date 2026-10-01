-- HJ GROUPS: Telegram episode idempotency hardening.
-- Existing duplicate rows are retained for safe admin review; duplicate
-- records are marked with a non-canonical import key so they do not collide
-- with the canonical row. Future imports use story_id + telegram_message_id
-- as the source identity and the unique import key as the concurrency guard.

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS telegram_import_key text;

UPDATE public.episodes AS e
SET
  number = COALESCE(e.number, e.episode_number),
  telegram_import_key = ranked.story_id::text || ':' || ranked.telegram_message_id::text ||
    CASE
      WHEN ranked.rn = 1 THEN ''
      ELSE ':duplicate:' || ranked.id::text
    END
FROM (
  SELECT
    id,
    story_id,
    telegram_message_id,
    ROW_NUMBER() OVER (
      PARTITION BY story_id, telegram_message_id
      ORDER BY (available IS TRUE) DESC, id ASC
    ) AS rn
  FROM public.episodes
  WHERE telegram_message_id IS NOT NULL
) AS ranked
WHERE e.id = ranked.id;

UPDATE public.episodes
SET number = episode_number
WHERE number IS NULL
  AND episode_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS episodes_telegram_import_key_unique
  ON public.episodes (telegram_import_key)
  WHERE telegram_import_key IS NOT NULL;
