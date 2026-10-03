import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

test('web push server keeps VAPID private key server-side', () => {
  const server = read('server/webPush.mjs')
  const client = read('src/lib/webPush.js')
  assert.match(server, /WEB_PUSH_VAPID_PRIVATE_KEY/)
  assert.doesNotMatch(client, /WEB_PUSH_VAPID_PRIVATE_KEY/)
  assert.match(server, /isHjAdminUser/)
  assert.match(server, /web_push_subscriptions/)
})

test('web push client waits for explicit permission flow and registers a service worker', () => {
  const client = read('src/lib/webPush.js')
  const prompt = read('src/components/WebPushPrompt.jsx')
  assert.match(client, /Notification\.requestPermission/)
  assert.match(client, /pushManager\.subscribe/)
  assert.match(client, /\/hj-push-sw\.js/)
  assert.match(prompt, /Enable Notifications/)
  assert.match(prompt, /Later/)
})

test('notification routing is same-origin and library targeting is persisted server-side', () => {
  const server = read('server/webPush.mjs')
  const app = read('src/App.jsx')
  const migration = read('supabase/migrations/20261003190000_web_push_notifications.sql')
  assert.match(server, /safeTargetUrl/)
  assert.match(server, /user_story_library/)
  assert.match(server, /web_push_episode_dispatches/)
  assert.match(app, /syncStoryLibrary/)
  assert.match(app, /hj_story/)
  assert.match(migration, /alter table public\.web_push_subscriptions enable row level security/)
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/)
})

test('service worker only navigates to same-origin relative notification URLs', () => {
  const sw = read('public/hj-push-sw.js')
  assert.match(sw, /data\.url.*startsWith\('\/'\)/)
  assert.match(sw, /new URL\(target, self\.location\.origin\)/)
})
