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
