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

test('Long story episode lists use a compact dynamic 50-episode range selector', () => {
  const app = read('src/App.jsx')
  const css = read('src/App.css')
  assert.match(app, /const \[storyEpisodeRangeStart, setStoryEpisodeRangeStart\] = useState\(0\)/)
  assert.match(app, /const \[storyEpisodeVisibleEnd, setStoryEpisodeVisibleEnd\] = useState\(50\)/)
  assert.match(app, /for \(let index = 0; index < allEpisodes\.length; index \+= 50\)/)
  assert.match(app, /const endExclusive = Math\.min\(index \+ 50, allEpisodes\.length\)/)
  assert.match(app, /const firstEpisode = allEpisodes\[index\]/)
  assert.match(app, /const lastEpisode = allEpisodes\[endExclusive - 1\]/)
  assert.match(app, /label:.*firstNumber.*lastNumber/)
  assert.match(app, /className="episode-range-nav"/)
  assert.match(app, /className="episode-range-select"/)
  assert.match(app, /aria-label="Episode ranges"/)
  assert.match(app, /value=\{String\(selectedRangeStart\)\}/)
  assert.match(app, /setStoryEpisodeRangeStart\(range\.start\)/)
  assert.match(app, /setStoryEpisodeVisibleEnd\(range\.endExclusive\)/)
  assert.match(app, /Load More Episodes/)
  assert.match(app, /const selectedRangeIndex = rangeStarts\.findIndex\(/)
  assert.match(app, /const nextRange =/)
  assert.match(app, /setStoryEpisodeRangeStart\(nextRange\.start\)/)
  assert.match(app, /setStoryEpisodeVisibleEnd\(nextRange\.endExclusive\)/)
  assert.match(css, /\.episode-range-select \{/)
  assert.match(css, /\.episode-range-select option \{/)
  assert.match(css, /color-scheme: dark/)
  assert.match(css, /\.episode-load-more \{/)
})

test('Story Details Back to Stories returns to the existing Stories section inside the SPA', () => {
  const app = read('src/App.jsx')
  assert.match(app, /const closeStoryDetails =/)
  assert.match(app, /setPage\('home'\)/)
  assert.match(app, /document\.getElementById\('stories'\)\?\.scrollIntoView/)
})

test('Admin cloud settings preserve the persisted Ads enabled boolean', () => {
  const panel = read('src/AdminPanel.jsx')
  const cloudStart = panel.indexOf('const loadCloudSettings')
  const cloudEnd = panel.indexOf('setSettingsLoading(false)', cloudStart)
  assert.ok(cloudStart >= 0 && cloudEnd > cloudStart)
  const cloudBlock = panel.slice(cloudStart, cloudEnd)
  assert.match(cloudBlock, /ads: \{/)
  assert.match(cloudBlock, /\.\.\..*DEFAULT_ADMIN_SETTINGS\.ads/)
  assert.doesNotMatch(cloudBlock, /ads: normalizeShortenerSettings\(/)
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

 
test('Episode Analytics is compact by default and searchable by episode or title', () => {
  const panel = read('src/AdminPanel.jsx')
  assert.match(panel, /analyticsEpisodeSearch/)
  assert.match(panel, /analyticsEpisodePickerOpen/)
  assert.match(panel, /Search and select an episode for analytics/)
  assert.match(panel, /Search episode number or title/)
  assert.match(panel, /Select an episode to view its analytics/)
  assert.doesNotMatch(panel, /\{\(analyticsData\.episodes \|\| \[\]\)\.map\(/)
})


test('Latest Episodes is based on upload timestamp and limited to the newest ten uploads', () => {
  const app = read('src/App.jsx')
  const telegram = read('src/lib/telegramContent.js')
  assert.match(telegram, /created_at: ep\.created_at \|\| null/)
  assert.match(app, /const latestEpisodes = stories/)
  assert.match(app, /\.sort\(\(a, b\) =>/)
  assert.match(app, /return bTime - aTime/)
  assert.match(app, /\.slice\(0, 10\)/)
  assert.match(app, /latestEpisodes\.map\(\(\{ story, episode \}\) =>/)
})

test('Episode Analytics requires story selection first and supports blank or multi-term episode search', () => {
  const panel = read('src/AdminPanel.jsx')
  assert.match(panel, /analyticsStorySearch/)
  assert.match(panel, /analyticsSelectedStoryId/)
  assert.match(panel, /analyticsStoryPickerOpen/)
  assert.match(panel, /First select a story, then select an episode/)
  assert.match(panel, /storySearchTerms\.every/)
  assert.match(panel, /episodeSearchTerms\.every/)
  assert.match(panel, /const storyMatches = stories\.filter/)
  assert.match(panel, /const episodeMatches = storyEpisodes\.filter/)
  assert.doesNotMatch(panel, /Type an episode number or title to search\\./)
})
