-- HJ GROUPS: Telegram episode idempotency hardening.
-- Existing duplicate rows are retained for safe admin review; the unique
-- import key is the concurrency guard for future imports.
-- Source identity is partitioned conceptually by story_id + telegram_message_id.

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS telegram_import_key text;

CREATE UNIQUE INDEX IF NOT EXISTS episodes_telegram_import_key_unique
  ON public.episodes (telegram_import_key)
  WHERE telegram_import_key IS NOT NULL;

-- PARTITION BY story_id, telegram_message_id
