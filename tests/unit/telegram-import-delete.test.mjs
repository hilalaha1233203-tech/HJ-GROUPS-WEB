import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../..' + '/' + path, import.meta.url), 'utf8')

test('Telegram import no longer depends on stale client episode arrays for numbering', () => {
  const helper = read('src/lib/telegramImport.js')
  const v2 = read('src/AdminContentV2.jsx')
  const panelStart = read('src/AdminPanel.jsx')
  const panel = panelStart.slice(panelStart.indexOf('const handleBulkImport'), panelStart.indexOf('const resetStoryForm'))
  assert.match(helper, /getFreshEpisodeImportState/)
  assert.match(helper, /getFreshVideoEpisodeImportState/)
  assert.match(helper, /sortTelegramMessagesOldestFirst/)
  assert.match(helper, /\.in\('telegram_message_id', batch\)/)
  assert.doesNotMatch(v2, /Math\.max\(0,\.\.\.\(parent\.episodes\|\|\[\]\)/)
  assert.doesNotMatch(panel, /parent\.episodes\s*\|\|\s*\[\]/)
  assert.match(v2, /X-HJ-Telegram-Next-Offset/)
})

test('Telegram titles prefer caption, filename and Telegram audio metadata before deterministic fallback', () => {
  const helper = read('src/lib/telegramImport.js')
  assert.match(helper, /caption/)
  assert.match(helper, /fileName/)
  assert.match(helper, /audioTitle/)
  assert.match(helper, /performer/)
  assert.match(helper, /parseTelegramEpisodeNumber/)
  assert.match(helper, /Episode/)
})

test('Telegram scan remains paginated at 100 messages and exposes an older-message cursor', () => {
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(v2, /limit: '100'/)
  assert.match(v2, /offset_id/)
  assert.match(v2, /Load Older/)
  assert.match(v2, /X-HJ-Telegram-Has-More/)
})

test('Admin Create/Manage category changes reset to valid category-specific actions', () => {
  const v2 = read('src/AdminContentV2.jsx')
  const categoryBlockStart = v2.indexOf('  const onCat=')
  const categoryBlockEnd = v2.indexOf('\n  const onSearch=', categoryBlockStart)
  assert.ok(categoryBlockStart >= 0 && categoryBlockEnd > categoryBlockStart)
  const categoryBlock = v2.slice(categoryBlockStart, categoryBlockEnd)
  assert.match(categoryBlock, /setCategory\(c\)/)
  assert.match(categoryBlock, /setCreateAction\(/)
  assert.match(categoryBlock, /new-story/)
  assert.match(categoryBlock, /new-book/)
  assert.match(categoryBlock, /new-video/)
  assert.match(categoryBlock, /setManageAction\(/)
  assert.match(categoryBlock, /story-edit/)
  assert.match(categoryBlock, /book-edit/)
  assert.match(categoryBlock, /video-story-edit/)
})

test('Manage V2 exposes Edit, Delete, Bulk Edit and Bulk Delete for every category', () => {
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(v2, /const manageItems = \[\['edit'/)
  assert.match(v2, /\['delete','🗑️ Delete'\]/)
  assert.match(v2, /\['bulk-edit','🧩 Bulk Edit'\]/)
  assert.match(v2, /\['bulk-delete','🗑️ Bulk Delete'\]/)
  assert.match(v2, /const manageTargetItems = category==='audio'/)
  assert.match(v2, /\['story','📚 Stories'\].*\['episode','🎧 Episodes'\]/s)
  assert.match(v2, /\['book','📕 Books'\].*\['volume','📖 Volumes'\]/s)
  assert.match(v2, /\['video-story','🎬 Video Stories'\].*\['video-episode','🎞️ Video Episodes'\]/s)
})

test('Manage V2 wires direct safe-delete callbacks and bulk operations', () => {
  const v2 = read('src/AdminContentV2.jsx')
  const panel = read('src/AdminPanel.jsx')
  assert.match(v2, /onDeleteStory, onDeleteEpisode/)
  assert.match(v2, /onDeleteBook/)
  assert.match(v2, /onDeleteVideo, onDeleteVideoEpisode/)
  assert.match(v2, /const deleteSingle = async/)
  assert.match(v2, /const runBulkEdit = async/)
  assert.match(v2, /const runBulkDelete = async/)
  assert.match(v2, /await onDeleteEpisode\(parentId, selectedTarget\.id\)/)
  assert.match(v2, /await onDeleteVideoEpisode\(parentId, selectedTarget\.number\)/)
  assert.match(v2, /Only the checked fields will be changed\./)
  assert.match(v2, /Title prefix/)
  assert.match(v2, /Access Types/)
  assert.match(v2, /Availability/)
  assert.match(panel, /onDeleteStory=\{onDeleteStory\}/)
  assert.match(panel, /onDeleteEpisode=\{onDeleteEpisode\}/)
  assert.match(panel, /onDeleteBook=\{onDeleteBook\}/)
  assert.match(panel, /onDeleteVideo=\{onDeleteVideo\}/)
  assert.match(panel, /onDeleteVideoEpisode=\{onDeleteVideoEpisode\}/)
})

test('Manage V2 resets category target so an old action cannot execute against the new category', () => {
  const v2 = read('src/AdminContentV2.jsx')
  const onCat = v2.slice(v2.indexOf('  const onCat='), v2.indexOf('\n  const onSearch=', v2.indexOf('  const onCat=')))
  assert.match(onCat, /setManageAction\('edit'\)/)
  assert.match(onCat, /setManageTarget\(c==='audio'\?'story':c==='books'\?'book':'video-story'\)/)
  assert.match(onCat, /resetBulkEditor\(\)/)
})

test('Bulk edit preserves existing episode media while changing only selected common fields', () => {
  const v2 = read('src/AdminContentV2.jsx')
  const start = v2.indexOf('  const runBulkEdit = async')
  const end = v2.indexOf('\n  const runBulkDelete = async', start)
  const block = v2.slice(start, end)
  assert.match(block, /manageTarget==='episode'/)
  assert.match(block, /manageTarget==='video-episode'/)
  assert.match(block, /src:String\(row\.src\|\|'\x27'\)/)
  assert.match(block, /filePath:String\(row\.filePath\|\|'\x27'\)/)
  assert.match(block, /row\.telegram_message_id/)
  assert.match(block, /patch\.title=/)
  assert.match(block, /patch\.accessType=/)
  assert.match(block, /patch\.available=/)
  assert.match(block, /Episode database ID is missing; bulk edit is unsafe/)
  assert.match(block, /Video episode database ID is missing; bulk edit is unsafe/)
})

test('Manage V2 passes video episode IDs to update/delete callbacks', () => {
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(v2, /onUpdateVideoEpisode\(parentId,Number\(edit\.number\),\{[\s\S]*?\},edit\.id\)/)
  assert.match(v2, /onUpdateVideoEpisode\(parentId,Number\(row\.number\),patch,row\.id\)/)
  assert.match(v2, /onDeleteVideoEpisode\(parentId, selectedTarget\.number, selectedTarget\.id\)/)
  assert.match(v2, /onDeleteVideoEpisode\(parentId,row\.number,row\.id\)/)
})

test('Video episode App CRUD uses verifiable primary-key mutations', () => {
  const app = read('src/App.jsx')
  assert.match(app, /const updateVideoEpisode = async \(videoId, episodeNumber, updates, episodeId = null\)/)
  assert.match(app, /numericEpisodeId = Number\(lookup\.data\.id\)/)
  assert.match(app, /\.eq\('video_story_id', supabaseId\)\.eq\('id', numericEpisodeId\)/)
  assert.match(app, /const deleteVideoEpisode = async \(videoId, episodeNumber, episodeId = null\)/)
  assert.match(app, /deletion = await supabase\.from\('video_episodes'\)\.delete\(\)\.eq\('id', numericEpisodeId\)/)
  assert.match(app, /deletion\.data\.length !== 1/)
  assert.match(app, /Video episode delete did not affect the expected database row/)
  assert.match(app, /Video episode delete could not be verified/)
})

test('Manage V2 keeps UI selection keys separate from database IDs', () => {
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(v2, /manageKey:'story:'/)
  assert.match(v2, /manageKey: row\.id != null \? 'episode-id:'/)
  assert.match(v2, /manageKey: row\.id != null \? 'video-episode-id:'/)
  assert.match(v2, /manageKey:'volume:'/)
  assert.match(v2, /selectedTarget = targetRows\.find\(row => String\(row\.manageKey\)===String\(selectedId\)\)/)
  assert.match(v2, /onUpdateStory\(selectedTarget\.id,/)
  assert.match(v2, /onUpdateBook\(selectedTarget\.id,/)
  assert.doesNotMatch(v2, /id: row\.id \|\| row\.number/)
})

test('Manage V2 bulk delete resolves selections using stable Manage keys', () => {
  const v2 = read('src/AdminContentV2.jsx')
  const start = v2.indexOf('  const runBulkDelete = async')
  const end = v2.indexOf('\n  const toggleBulkRow', start)
  const block = v2.slice(start, end)
  assert.match(block, /bulkSelectedIds\.some\(id=>String\(id\)===String\(row\.manageKey\)\)/)
  assert.match(block, /Video episode database ID is missing; deletion is unsafe/)
  assert.match(v2, /key=\{row\.manageKey\}/)
})

test('Manage V2 mobile layout has dedicated responsive styles for bulk controls', () => {
  const css = read('src/App.css')
  assert.match(css, /\.admin-v2-manage-actions \{ grid-template-columns:repeat\(4/)
  assert.match(css, /\.admin-v2-target-actions \{ grid-template-columns:repeat\(2/)
  assert.match(css, /@media \(max-width:700px\)/)
  assert.match(css, /\.admin-v2-manage-actions,.admin-v2-target-actions \{ grid-template-columns:1fr; \}/)
  assert.match(css, /\.admin-v2-select-all \{ width:100%; \}/)
  assert.match(css, /\.admin-v2-danger-btn \{ width:100%; \}/)
})

test('Manage V2 preserves Telegram media playback URLs when saving an episode', () => {
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(v2, /const rawMediaUrl = String\(telegramUrl \|\| ''\)\.trim\(\)/)
  assert.match(v2, /Number\(edit\.telegram_message_id\) \|\| null : null/)
  assert.match(v2, /const nextSrc = messageId \? STREAMING_SERVER_URL \+ '\/audio\/message\/'/)
  assert.match(v2, /const nextSrc = messageId \? STREAMING_SERVER_URL \+ '\/video\/message\/'/)
  assert.match(v2, /setSrc\(value\)/)
})

test('Manage V2 can replace an existing Telegram media URL with a non-Telegram URL', () => {
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(v2, /const rawMediaUrl = String\(telegramUrl \|\| ''\)\.trim\(\)/)
  assert.match(v2, /!rawMediaUrl \? Number\(edit\.telegram_message_id\) \|\| null : null/)
  assert.match(v2, /const nextSrc = messageId \? STREAMING_SERVER_URL/)
})

test('Story Manage edits and bulk edits persist access types without dropping metadata', () => {
  const app = read('src/App.jsx')
  const v2 = read('src/AdminContentV2.jsx')
  assert.match(app, /access_type: serializeAccessType\(updates\.accessType\)/)
  assert.match(v2, /accessType:bulkEditApplyAccess \? bulkEditAccessType : resolveAccessType\(row\)/)
  assert.match(v2, /cover:String\(row\.cover\|\|'\x27'\)/)
  assert.match(v2, /description:String\(row\.description\|\|'\x27'\)/)
})

test('Audio episode edits keep number and legacy episode_number synchronized', () => {
  const app = read('src/App.jsx')
  assert.match(app, /const baseUpdate = \{\n\s*number,\n\s*episode_number: number,/)
})

test('Telegram number-conflict retries cannot be misclassified as a message duplicate forever', () => {
  const app = read('src/App.jsx')
  assert.match(app, /telegramNumberRetryCount < 3/)
  assert.match(app, /__telegramNumberRetryCount/)
  assert.match(app, /return addEpisodeToStory\(storyId, \{/)
})
 
test('Successful Telegram number-conflict retry is not reported as a duplicate', () => {
  const app = read('src/App.jsx')
  assert.match(app, /let recoveredFromNumberConflict = false/)
  assert.match(app, /recoveredFromNumberConflict = !result\.error/)
  assert.match(app, /isDuplicate && telegramImportKey && !recoveredFromNumberConflict/)
})

test('Telegram import is protected by database identity and a unique import key', () => {
  const app = read('src/App.jsx')
  assert.match(app, /eq\('story_id', supabaseId\)\n\s*\.eq\('telegram_message_id', messageId\)/)
  assert.match(app, /eq\('telegram_import_key', telegramImportKey\)/)
  assert.match(app, /status: 'duplicate'/)

  const hybridSectionStart = app.search(/(?:const|let) hybridRow/)
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
