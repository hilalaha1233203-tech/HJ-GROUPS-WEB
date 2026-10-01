import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_AD_UNLOCK_RULES,
  findAdUnlockRule,
  resolveAdUnlockPlan,
  validateAdUnlockRules,
} from '../../src/lib/adUnlockRules.js'

test('default episode Ads rules match the requested production bands', () => {
  assert.deepEqual(DEFAULT_AD_UNLOCK_RULES, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: 1500, unlockCount: 5 },
    { startEpisode: 1501, endEpisode: null, unlockCount: 3 },
  ])
})

test('Episode 14 with a five-count rule unlocks 14 through 18', () => {
  assert.deepEqual(
    resolveAdUnlockPlan(14, [
      { startEpisode: 1, endEpisode: 1000, unlockCount: 5 },
    ]),
    {
      unlockCount: 5,
      startEpisode: 14,
      endEpisode: 18,
      ruleStartEpisode: 1,
      ruleEndEpisode: 1000,
    }
  )
})

test('Episode 19 with a five-count rule unlocks 19 through 23', () => {
  assert.equal(resolveAdUnlockPlan(19, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 5 },
  ]).endEpisode, 23)
  assert.deepEqual(
    Array.from(
      { length: resolveAdUnlockPlan(19, [
        { startEpisode: 1, endEpisode: 1000, unlockCount: 5 },
      ]).unlockCount },
      (_, index) => 19 + index
    ),
    [19, 20, 21, 22, 23]
  )
})

test('range matching uses the clicked episode number and includes the boundary correctly', () => {
  const rules = [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: 1500, unlockCount: 5 },
    { startEpisode: 1501, endEpisode: null, unlockCount: 3 },
  ]

  assert.equal(findAdUnlockRule(1, rules).unlockCount, 10)
  assert.equal(findAdUnlockRule(999, rules).unlockCount, 10)
  assert.equal(findAdUnlockRule(1000, rules).unlockCount, 10)
  assert.equal(findAdUnlockRule(1001, rules).unlockCount, 5)
  assert.equal(findAdUnlockRule(1499, rules).unlockCount, 5)
  assert.equal(findAdUnlockRule(1500, rules).unlockCount, 5)
  assert.equal(findAdUnlockRule(1501, rules).unlockCount, 3)
  assert.equal(findAdUnlockRule(2000, rules).unlockCount, 3)

  assert.equal(resolveAdUnlockPlan(999, rules).endEpisode, 1008)
  assert.equal(resolveAdUnlockPlan(1000, rules).endEpisode, 1009)
  assert.equal(resolveAdUnlockPlan(1001, rules).endEpisode, 1005)
  assert.equal(resolveAdUnlockPlan(1499, rules).endEpisode, 1503)
  assert.equal(resolveAdUnlockPlan(1500, rules).endEpisode, 1504)
  assert.equal(resolveAdUnlockPlan(1501, rules).endEpisode, 1503)
  assert.equal(resolveAdUnlockPlan(2000, rules).endEpisode, 2002)
})

test('open-ended Ads rules can be edited without an artificial maximum', () => {
  const result = validateAdUnlockRules([
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: null, unlockCount: 3 },
  ])

  assert.equal(result.valid, true)
  assert.deepEqual(result.normalizedRules, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: null, unlockCount: 3 },
  ])
})

test('overlapping Ads rules are rejected', () => {
  const result = validateAdUnlockRules([
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 500, endEpisode: 1500, unlockCount: 5 },
  ])
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /overlap/i)
})

test('multiple unlimited rules are rejected', () => {
  const result = validateAdUnlockRules([
    { startEpisode: 1, endEpisode: null, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: null, unlockCount: 5 },
  ])
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /unlimited/i)
})

test('invalid rule fields are rejected instead of silently normalized into a valid rule', () => {
  const result = validateAdUnlockRules([
    { startEpisode: 0, endEpisode: 1000, unlockCount: 0 },
    { startEpisode: 1200, endEpisode: 1100, unlockCount: 5 },
  ])
  assert.equal(result.valid, false)
  assert.ok(result.errors.length >= 3)
})

test('rules are normalized into deterministic ascending order before save', () => {
  const result = validateAdUnlockRules([
    { startEpisode: 1001, endEpisode: 1500, unlockCount: 5 },
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1501, endEpisode: null, unlockCount: 3 },
  ])

  assert.equal(result.valid, true)
  assert.deepEqual(result.normalizedRules, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: 1500, unlockCount: 5 },
    { startEpisode: 1501, endEpisode: null, unlockCount: 3 },
  ])
})

test('an explicitly empty rule list is rejected instead of silently restoring defaults', () => {
  const result = validateAdUnlockRules([])
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /at least one/i)
})

test('Telegram story IDs use the same Ads key identity as the server numeric story ID', async () => {
  const { adsKeyFor } = await import('../../src/lib/accessControl.js')
  assert.equal(adsKeyFor('episode', 'tg-story-3', 14), 'episode:3:14')
  assert.equal(adsKeyFor('episode', 3, 14), 'episode:3:14')
  assert.equal(adsKeyFor('video-episode', 'tg-video-7', 9), 'video-episode:7:9')
  assert.equal(adsKeyFor('book', 'tg-book-4'), 'book:tg-book-4')
})
