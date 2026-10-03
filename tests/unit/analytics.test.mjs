import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStoryAnalyticsId } from '../../src/lib/analyticsIdentity.js'
import { ANALYTICS_BATCH_SIZES, getEpisodeAnalyticsBatch, summarizeEpisodeAnalyticsBatch } from '../../src/lib/analyticsBatch.js'

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


test('episode analytics batches start at the selected episode and cap at the available rows', () => {
  const episodes = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, episode_number: index + 1 }))
  assert.deepEqual(
    getEpisodeAnalyticsBatch(episodes, 6, 10).map((episode) => episode.episode_number),
    [6, 7, 8, 9, 10, 11, 12]
  )
  assert.equal(getEpisodeAnalyticsBatch(episodes, 10, 100).length, 3)
})

test('episode analytics batch summary keeps additive metrics without summing unique viewers', () => {
  assert.deepEqual(
    summarizeEpisodeAnalyticsBatch([
      { total_plays: 4, completed_plays: 1, ad_unlock_starts: 2, ad_unlock_completions: 1, shortener_unlock_completions: 1, actual_unlocks: 1 },
      { total_plays: 6, completed_plays: 2, ad_unlock_starts: 3, ad_unlock_completions: 2, shortener_unlock_completions: 2, actual_unlocks: 4 },
    ]),
    {
      episode_count: 2,
      total_plays: 10,
      completed_plays: 3,
      ad_unlock_starts: 5,
      ad_unlock_completions: 3,
      shortener_unlock_completions: 3,
      average_plays_per_episode: 5,
    }
  )
})

test('analytics batch size options are fixed to supported review sizes', () => {
  assert.deepEqual([...ANALYTICS_BATCH_SIZES], [10, 25, 50, 100])
})


test('admin analytics explicitly separates rewarded Ads from Shortener unlocks', () => {
  const panel = fs.readFileSync('src/AdminPanel.jsx', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20261003100500_separate_rewarded_and_shortener_user_counts.sql', 'utf8')
  assert.match(panel, /Rewarded Ad Unlocks/)
  assert.match(panel, /Shortener Unlocks/)
  assert.match(panel, /Actual Shortener Unlocks/)
  assert.match(panel, /Rewarded Ads and Shortener are separate unlock paths/)
  assert.match(migration, /shortener_unlock_completions/)
  assert.match(migration, /total_unlocks/)
  assert.match(migration, /actual_shortener_unlocks/)
  assert.match(migration, /from public\.ad_unlocks u where u\.user_id=a\.user_id and u\.provider='rewarded_ad'/)
  assert.match(migration, /from public\.shortener_unlocks u where u\.user_id=a\.user_id/)
})


test('user activity unlock columns are sourced from actual entitlement tables, not completion events', () => {
  const migration = fs.readFileSync('supabase/migrations/20261003102000_user_activity_actual_unlock_counts.sql', 'utf8')
  const userRows = migration.slice(migration.indexOf('  user_rows as ('), migration.indexOf('  anonymous_rows as ('))
  assert.match(userRows, /ad_unlocks.*from public\.ad_unlocks/)
  assert.match(userRows, /shortener_unlocks.*from public\.shortener_unlocks/)
  assert.doesNotMatch(userRows, /ad_unlocks.*filter\(where a\.event_type='ad_unlock_completed'/)
})
