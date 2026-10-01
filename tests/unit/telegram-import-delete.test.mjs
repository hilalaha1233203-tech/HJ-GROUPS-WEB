import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../..' + '/' + path, import.meta.url), 'utf8')

test('Telegram import is protected by database identity and a unique import key', () => {
  const app = read('src/App.jsx')
  assert.match(app, /eq\('story_id', supabaseId\)\n\s*\.eq\('telegram_message_id', messageId\)/)
  assert.match(app, /eq\('telegram_import_key', telegramImportKey\)/)
  assert.match(app, /status: 'duplicate'/)

  const hybridSectionStart = app.indexOf('const hybridRow')
  const hybridSectionEnd = app.indexOf('let result = await supabase.from(\'episodes\').insert(hybridRow)')
  assert.ok(hybridSectionStart >= 0 && hybridSectionEnd > hybridSectionStart)
  assert.doesNotMatch(app.slice(hybridSectionStart, hybridSectionEnd), /file_id:/)

  const modernSectionStart = app.indexOf('const modernRow')
  const modernSectionEnd = app.indexOf('result = await supabase.from(\'episodes\').insert(modernRow)')
  assert.ok(modernSectionStart >= 0 && modernSectionEnd > modernSectionStart)
  assert.doesNotMatch(app.slice(modernSectionStart, modernSectionEnd), /file_id:/)

  const migration = read('supabase/migrations/20261001113000_telegram_episode_idempotency.sql')
  assert.match(migration, /ADD COLUMN IF NOT EXISTS telegram_import_key/)
  assert.match(migration, /episodes_telegram_import_key_unique/)
  assert.match(migration, /PARTITION BY story_id, telegram_message_id/)
})

test('Telegram Select All reverses scan order so auto-numbered episodes import 1 to N from the bottom up', () => {
  const panel = read('src/AdminPanel.jsx')
  assert.match(
    panel,
    /setBulkSelectedIds\(\[\.\.\.bulkMessages\]\.reverse\(\)\.map\(m => m\.messageId\)\)/
  )
})

test('Admin access type labels do not reference an undefined variable', () => {
  const panel = read('src/AdminPanel.jsx')
  assert.match(panel, /function AccessTypeSelect\(\{ groupName, label = 'Access Types', value, onChange \}\)/)
  assert.match(panel, /<span className="access-type-label">\{label\}<\/span>/)
  assert.match(panel, /function AccessTypeField\(\{ groupName, label = 'Access Types', value, onChange \}\)/)
})

test('Long story episode lists render in 50-episode chunks with range navigation', () => {
  const app = read('src/App.jsx')
  const css = read('src/App.css')
  assert.match(app, /const \[storyEpisodeRangeStart, setStoryEpisodeRangeStart\] = useState\(0\)/)
  assert.match(app, /const \[storyEpisodeVisibleEnd, setStoryEpisodeVisibleEnd\] = useState\(50\)/)
  assert.match(app, /for \(let index = 0; index < allEpisodes\.length; index \+= 50\)/)
  assert.match(app, /setStoryEpisodeVisibleEnd\(Math\.min\(visibleEnd \+ 50, allEpisodes\.length\)\)/)
  assert.match(app, /\{start \+ 1\}-\{end\}/)
  assert.match(app, /aria-label="Episode ranges"/)
  assert.match(app, /Load More Episodes/)
  assert.match(css, /\.episode-range-nav \{/)
  assert.match(css, /\.episode-load-more \{/)
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
