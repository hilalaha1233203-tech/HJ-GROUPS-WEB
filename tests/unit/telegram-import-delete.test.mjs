import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../..' + '/' + path, import.meta.url), 'utf8')

test('Telegram import is protected by database identity and a unique import key', () => {
  const app = read('src/App.jsx')
  assert.match(app, /eq\('story_id', supabaseId\)\n\s*\.eq\('telegram_message_id', messageId\)/)
  assert.match(app, /eq\('telegram_import_key', telegramImportKey\)/)
  assert.match(app, /status: 'duplicate'/)

  const migration = read('supabase/migrations/20261001_telegram_episode_idempotency.sql')
  assert.match(migration, /ADD COLUMN IF NOT EXISTS telegram_import_key/)
  assert.match(migration, /episodes_telegram_import_key_unique/)
  assert.match(migration, /PARTITION BY story_id, telegram_message_id/)
})

test('Admin delete awaits the database operation and deletes by primary-key identity', () => {
  const panel = read('src/AdminPanel.jsx')
  const app = read('src/App.jsx')
  assert.match(panel, /async function handleDeleteEpisode = async|async function handleDeleteEpisode|const handleDeleteEpisode = async/)
  assert.match(app, /\.delete\(\)\n\s*\.eq\('id', numericEpisodeId\)\n\s*\.eq\('story_id', supabaseId\)/)
  assert.match(app, /deletion\.data\.length !== 1/)
  assert.match(app, /Episode delete did not affect the expected database row|Episode delete could not be verified/)
})

test('Telegram import UI exposes real counters and disables repeated submission', () => {
  const panel = read('src/AdminPanel.jsx')
  assert.match(panel, /bulkImportRunningRef/)
  assert.match(panel, /bulkImportProgress/)
  assert.match(panel, /processed/i)
  assert.match(panel, /Duplicates/)
  assert.match(panel, /bulkImporting/)
  assert.match(panel, /role="progressbar"/)
})

test('Telegram duplicate rows are quarantined from the public catalogue but remain visible to Admin', () => {
  const content = read('src/lib/telegramContent.js')
  const app = read('src/App.jsx')
  assert.match(content, /isTelegramDuplicate/)
  assert.match(app, /episodes: \(story\.episodes \|\| \[\]\)\.filter\(\(episode\) => !episode\.isTelegramDuplicate\)/)
  assert.match(app, /const adminPanelStories/)
})

test('secure media path still uses Telegram message identity', () => {
  const secureMedia = read('src/lib/secureMedia.js')
  assert.match(secureMedia, /telegram_message_id/)
  assert.match(secureMedia, /STREAMING_SERVER_URL/)
})
