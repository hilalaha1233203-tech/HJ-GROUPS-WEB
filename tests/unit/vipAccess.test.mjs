import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { accessLabel, canAccess } from '../../src/lib/accessControl.js'

const vipItem = { accessType: 'vip', available: true }
const premiumItem = { accessType: 'premium', available: true }
const freeItem = { accessType: 'free', available: true }

test('user VIP grants are authoritative for VIP/Premium content', () => {
  assert.equal(canAccess(vipItem, { loggedIn: true, hasVipAccess: true }), true)
  assert.equal(canAccess(premiumItem, { loggedIn: true, hasVipAccess: true }), true)
  assert.equal(canAccess(vipItem, { loggedIn: false, hasVipAccess: true }), true)
  assert.equal(canAccess(vipItem, { loggedIn: true, hasVipAccess: false, purchasedStoryIds: new Set() }), false)
  assert.equal(canAccess(freeItem, { loggedIn: false, hasVipAccess: false }), true)
  assert.equal(accessLabel(vipItem, { hasVipAccess: true }), '⭐ VIP Access')
})

test('VIP access invariant survives 10,000 repeated access-control checks', () => {
  for (let i = 0; i < 10_000; i += 1) {
    assert.equal(canAccess(vipItem, { loggedIn: false, hasVipAccess: true }), true)
    assert.equal(canAccess(premiumItem, { loggedIn: true, hasVipAccess: true }), true)
    assert.equal(canAccess(vipItem, { loggedIn: true, hasVipAccess: false, purchasedStoryIds: new Set() }), false)
  }
})

test('VIP implementation keeps the server boundary and admin UI hooks', () => {
  const access = readFileSync('src/lib/accessControl.js', 'utf8')
  const app = readFileSync('src/App.jsx', 'utf8')
  const admin = readFileSync('src/AdminPanel.jsx', 'utf8')
  const server = readFileSync('server/shortenerUnlock.mjs', 'utf8')
  const vipServer = readFileSync('server/vipAccess.mjs', 'utf8')
  const migration = readFileSync('supabase/migrations/20261004030000_user_vip_grants.sql', 'utf8')

  assert.match(access, /hasVipAccess/)
  assert.match(app, /\/api\/vip-access/)
  assert.match(admin, /\/api\/admin\/vip-access/)
  assert.match(server, /hasActiveVipGrant\(user\.id\)/)
  assert.match(vipServer, /isHjAdminUser/)
  assert.match(vipServer, /user_vip_grants/)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /user_vip_grants_admin_select/)
  assert.match(migration, /public\.is_hj_admin\(\)/)
})
