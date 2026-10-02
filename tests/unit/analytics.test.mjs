import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStoryAnalyticsId } from '../../src/lib/analyticsIdentity.js'

test('story_view normalizes Telegram story IDs to the real numeric story ID', () => {
  assert.equal(normalizeStoryAnalyticsId('tg-story-3'), 3)
  assert.equal(normalizeStoryAnalyticsId(3), 3)
  assert.equal(normalizeStoryAnalyticsId('3'), 3)
  assert.equal(normalizeStoryAnalyticsId('tg-story-invalid'), null)
  assert.equal(normalizeStoryAnalyticsId(null), null)
})

 
test('episode analytics uses the synchronously selected media context before playback starts', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  for (const startMarker of ['const openPlayer = (story, episode) =>', 'const selectEpisode = (episode) =>']) {
    const start = app.indexOf(startMarker)
    const prepare = app.indexOf('void prepareEpisodePlayback', start)
    const analyticsRef = app.indexOf('analyticsCurrentMediaRef.current =', start)
    assert.ok(start >= 0 && analyticsRef > start && prepare > analyticsRef)
  }
  const playHandler = app.slice(
    app.indexOf('const handleMediaPlay = () =>'),
    app.indexOf('const handleLoadedMetadata =', app.indexOf('const handleMediaPlay = () =>'))
  )
  assert.match(playHandler, /analyticsCurrentMediaRef\.current/)
  assert.match(playHandler, /episode_id:/)
  assert.match(playHandler, /story_id:/)
})
