import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveAdUnlockPlan, validateAdUnlockRules } from '../../src/lib/adUnlockRules.js'

test('Ads and Shortener rules resolve independently from the same starting episode', () => {
  const ads = resolveAdUnlockPlan(14, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 1 },
  ])
  const shortener = resolveAdUnlockPlan(14, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
  ])

  assert.deepEqual([ads.startEpisode, ads.endEpisode, ads.unlockCount], [14, 14, 1])
  assert.deepEqual([shortener.startEpisode, shortener.endEpisode, shortener.unlockCount], [14, 23, 10])
})

test('rule boundary is selected from the starting episode and never changes mid-range', () => {
  const rules = [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
    { startEpisode: 1001, endEpisode: 1800, unlockCount: 5 },
  ]
  assert.deepEqual(resolveAdUnlockPlan(999, rules), {
    unlockCount: 10,
    startEpisode: 999,
    endEpisode: 1008,
    ruleStartEpisode: 1,
    ruleEndEpisode: 1000,
  })
  assert.deepEqual(resolveAdUnlockPlan(1001, rules), {
    unlockCount: 5,
    startEpisode: 1001,
    endEpisode: 1005,
    ruleStartEpisode: 1001,
    ruleEndEpisode: 1800,
  })
})

test('only the actual existing episode list is applied by the server range contract', () => {
  const plan = resolveAdUnlockPlan(95, [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 10 },
  ])
  const existing = [95, 96, 97, 98, 99, 100]
  const playable = existing.filter((episode) => episode >= plan.startEpisode && episode <= plan.endEpisode)
  assert.deepEqual(playable, [95, 96, 97, 98, 99, 100])
})

test('Ads and Shortener use separate settings objects', () => {
  const ads = validateAdUnlockRules([
    { startEpisode: 1, endEpisode: 1000, unlockCount: 1 },
  ])
  const shortener = validateAdUnlockRules([
    { startEpisode: 1, endEpisode: 1000, unlockCount: 8 },
  ])
  assert.equal(ads.valid, true)
  assert.equal(shortener.valid, true)
  assert.notEqual(ads.normalizedRules[0].unlockCount, shortener.normalizedRules[0].unlockCount)
})

 
test('configured Ads rules expose the actual provider counts from the shared rule engine', () => {
  const rules = [
    { startEpisode: 1, endEpisode: 1000, unlockCount: 3 },
    { startEpisode: 1001, endEpisode: 1800, unlockCount: 2 },
    { startEpisode: 1801, endEpisode: 5000, unlockCount: 1 },
  ]
  assert.equal(resolveAdUnlockPlan(14, rules).unlockCount, 3)
  assert.equal(resolveAdUnlockPlan(1001, rules).unlockCount, 2)
  assert.equal(resolveAdUnlockPlan(1801, rules).unlockCount, 1)
})
 
test('provider choice UI has no generic Continue fallback and renders explicit provider counts', () => {
  const modal = fs.readFileSync('src/components/AdUnlockModal.jsx', 'utf8')
  assert.match(modal, /<h3>Unlock Episodes<\/h3>/)
  assert.match(modal, /Unlock \$\{countLabel\} with \$\{providerName\}/)
  assert.match(modal, /option\.available === false/)
  assert.doesNotMatch(modal, /Continue to Unlock/)
})
 
test('Ads provider failures are returned to the explicit provider-choice layer instead of auto-selecting Shortener', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  const modalMount = app.indexOf('{adModalOpen &&')
  const paymentMount = app.indexOf('{paymentTarget &&', modalMount)
  const block = app.slice(modalMount, paymentMount)
  assert.match(block, /onUnlock=\{handleProviderUnlock\}/)
  assert.match(app, /option\.provider === 'ads'/)
  assert.match(app, /available: false/)
  assert.doesNotMatch(block, /provider === 'ads' \? startRewardedAdUnlock\(\) : startShortenerUnlock\(\)/)
})
