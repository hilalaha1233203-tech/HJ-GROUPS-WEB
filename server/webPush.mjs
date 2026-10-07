import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { isHjAdminUser } from './adminAuth.mjs'

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yajkfglagnyvenddyvok.supabase.co').trim()
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const VAPID_PUBLIC_KEY = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()
const VAPID_PRIVATE_KEY = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim()
const VAPID_SUBJECT = String(process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@hj-groups.com').trim()
const MAX_TARGETS = 5000
const rateBuckets = new Map()

const db = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const configured = Boolean(db && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT)
if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

function rateLimit(key, limit = 30, windowMs = 60_000) {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

function getAccessToken(req) {
  const authorization = String(req.headers.authorization || '')
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function getUser(req) {
  const token = getAccessToken(req)
  if (!token || !db) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function cleanText(value, max, fallback = '') {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return text.length > 0 && text.length <= max ? text : fallback
}

function safeTargetUrl(value) {
  const raw = String(value || '/').trim()
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 500)
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return '/'
    const allowed = new Set(['hj-groups-web.pages.dev'])
    return allowed.has(url.hostname.toLowerCase()) ? url.toString().slice(0, 500) : '/'
  } catch { return '/' }
}

function subscriptionFromBody(body) {
  const subscription = body?.subscription
  if (!subscription || typeof subscription !== 'object') return null
  const endpoint = cleanText(subscription.endpoint, 4096)
  const p256dh = cleanText(subscription?.keys?.p256dh, 512)
  const auth = cleanText(subscription?.keys?.auth, 512)
  if (!endpoint || !/^https:\/\//i.test(endpoint) || !p256dh || !auth) return null
  return { endpoint, keys: { p256dh, auth } }
}

async function requireUser(req, res, send, jsonHeaders) {
  const user = await getUser(req)
  if (!user) {
    send(res, 401, JSON.stringify({ error: 'Unauthorized' }), jsonHeaders(req))
    return null
  }
  return user
}

async function sendOne(subscription, payload) {
  if (!configured) throw Object.assign(new Error('Web Push server is not configured'), { code: 'NOT_CONFIGURED' })
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: Math.min(86400, Math.max(60, Number(payload.ttl || 3600))),
      urgency: payload.urgency || 'normal',
    })
    return { ok: true }
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status || 0)
    if (statusCode === 404 || statusCode === 410) return { ok: false, invalid: true }
    throw error
  }
}

async function subscriptionsForUserIds(userIds, category) {
  if (!db || !userIds.length) return []
  const unique = [...new Set(userIds.filter(Boolean).map(String))].slice(0, MAX_TARGETS)
  const { data: subs, error } = await db.from('web_push_subscriptions').select('id,user_id,subscription').in('user_id', unique).eq('active', true)
  if (error) throw error
  const { data: prefs, error: prefError } = await db.from('web_push_preferences').select('user_id,new_episodes,new_stories,promotions,announcements').in('user_id', unique)
  if (prefError) throw prefError
  const prefMap = new Map((prefs || []).map((row) => [String(row.user_id), row]))
  return (subs || []).filter((row) => prefMap.get(String(row.user_id))?.[category] !== false)
}

async function sendToSubscriptions(rows, payload) {
  let sent = 0
  let failed = 0
  for (const row of rows) {
    try {
      const result = await sendOne(row.subscription, payload)
      if (result.invalid) {
        await db.from('web_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', row.id)
        failed += 1
      } else {
        sent += 1
      }
    } catch (error) {
      failed += 1
      console.warn('[web-push] send failed:', String(error?.message || error).slice(0, 240))
    }
  }
  return { sent, failed }
}

export async function handleWebPushRequest(req, res, { send, jsonHeaders }) {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
  if (url.pathname === '/api/push/config' && req.method === 'GET') {
    return send(res, 200, JSON.stringify({ supported: true, configured, publicKey: configured ? VAPID_PUBLIC_KEY : '' }), jsonHeaders(req))
  }
  if (!['/api/push/subscribe', '/api/push/preferences', '/api/push/status'].includes(url.pathname)) return false

  const user = await requireUser(req, res, send, jsonHeaders)
  if (!user) return true
  if (!rateLimit('push-user:' + user.id, 40)) return send(res, 429, JSON.stringify({ error: 'Too many notification requests' }), jsonHeaders(req))

  if (url.pathname === '/api/push/status' && req.method === 'GET') {
    const { data, error } = await db.from('web_push_subscriptions').select('id,active,last_seen_at').eq('user_id', user.id).eq('active', true)
    if (error) return send(res, 500, JSON.stringify({ error: 'Notification status unavailable' }), jsonHeaders(req))
    const { data: preferences } = await db.from('web_push_preferences').select('new_episodes,new_stories,promotions,announcements').eq('user_id', user.id).maybeSingle()
    return send(res, 200, JSON.stringify({ configured, subscribed: Boolean(data?.length), preferences: preferences || { new_episodes: true, new_stories: true, promotions: true, announcements: true } }), jsonHeaders(req))
  }

  if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), { ...jsonHeaders(req), Allow: 'POST, GET' })

  let body
  try {
    let raw = ''
    for await (const chunk of req) { raw += chunk; if (raw.length > 50_000) throw new Error('too large') }
    body = JSON.parse(raw || '{}')
  } catch {
    return send(res, 400, JSON.stringify({ error: 'Invalid JSON request' }), jsonHeaders(req))
  }

  if (url.pathname === '/api/push/subscribe') {
    if (!configured) return send(res, 503, JSON.stringify({ error: 'Web Push is not configured yet' }), jsonHeaders(req))
    const subscription = subscriptionFromBody(body)
    if (!subscription) return send(res, 400, JSON.stringify({ error: 'Invalid push subscription' }), jsonHeaders(req))
    const { error } = await db.from('web_push_subscriptions').upsert({
      user_id: user.id, endpoint: subscription.endpoint, subscription,
      user_agent: cleanText(req.headers['user-agent'], 800), active: true,
      last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })
    if (error) return send(res, 500, JSON.stringify({ error: 'Could not save notification subscription' }), jsonHeaders(req))
    const preferences = body.preferences && typeof body.preferences === 'object' ? body.preferences : {}
    await db.from('web_push_preferences').upsert({
      user_id: user.id,
      new_episodes: preferences.new_episodes !== false,
      new_stories: preferences.new_stories !== false,
      promotions: preferences.promotions !== false,
      announcements: preferences.announcements !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    return send(res, 200, JSON.stringify({ ok: true }), jsonHeaders(req))
  }

  if (url.pathname === '/api/push/preferences') {
    const allowed = ['new_episodes','new_stories','promotions','announcements']
    const values = {}
    for (const key of allowed) if (typeof body[key] === 'boolean') values[key] = body[key]
    if (!Object.keys(values).length) return send(res, 400, JSON.stringify({ error: 'No valid preferences supplied' }), jsonHeaders(req))
    values.updated_at = new Date().toISOString()
    const { error } = await db.from('web_push_preferences').upsert({ user_id: user.id, ...values }, { onConflict: 'user_id' })
    if (error) return send(res, 500, JSON.stringify({ error: 'Could not save notification preferences' }), jsonHeaders(req))
    return send(res, 200, JSON.stringify({ ok: true, preferences: values }), jsonHeaders(req))
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }), jsonHeaders(req))
}

export async function handleWebPushUnsubscribe(req, res, { send, jsonHeaders }) {
  if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), jsonHeaders(req))
  const user = await requireUser(req, res, send, jsonHeaders)
  if (!user) return true
  let body = {}
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    body = JSON.parse(raw || '{}')
  } catch {}
  const endpoint = cleanText(body.endpoint, 4096)
  if (!endpoint) return send(res, 400, JSON.stringify({ error: 'endpoint is required' }), jsonHeaders(req))
  await db.from('web_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('endpoint', endpoint)
  return send(res, 200, JSON.stringify({ ok: true }), jsonHeaders(req))
}

async function adminUser(req) {
  const user = await getUser(req)
  return user && isHjAdminUser(user) ? user : null
}

export async function handleAdminWebPushSend(req, res, { send, jsonHeaders }) {
  if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), jsonHeaders(req))
  const user = await adminUser(req)
  if (!user) return send(res, 403, JSON.stringify({ error: 'Forbidden' }), jsonHeaders(req))
  if (!configured) return send(res, 503, JSON.stringify({ error: 'Web Push server is not configured yet' }), jsonHeaders(req))
  if (!rateLimit('push-admin:' + user.id, 20)) return send(res, 429, JSON.stringify({ error: 'Too many notification sends' }), jsonHeaders(req))

  let body
  try {
    let raw = ''
    for await (const chunk of req) { raw += chunk; if (raw.length > 50_000) throw new Error('too large') }
    body = JSON.parse(raw || '{}')
  } catch {
    return send(res, 400, JSON.stringify({ error: 'Invalid JSON request' }), jsonHeaders(req))
  }

  const kind = ['promotion','announcement','new_story','new_episode'].includes(body.kind) ? body.kind : ''
  const category = kind === 'new_episode' ? 'new_episodes' : kind === 'new_story' ? 'new_stories' : kind === 'announcement' ? 'announcements' : 'promotions'
  const title = cleanText(body.title, 120)
  const message = cleanText(body.message, 500)
  const targetUrl = safeTargetUrl(body.targetUrl)
  const targetType = ['all','story_library','story_followers','inactive_30d'].includes(body.targetType) ? body.targetType : 'all'
  const storyId = Number.isInteger(Number(body.storyId)) ? Number(body.storyId) : null
  if (!kind || !title || !message) return send(res, 400, JSON.stringify({ error: 'kind, title and message are required' }), jsonHeaders(req))
  if (targetType !== 'all' && !storyId && targetType !== 'inactive_30d') return send(res, 400, JSON.stringify({ error: 'storyId is required for this target' }), jsonHeaders(req))

  let userIds = []
  if (targetType === 'story_library') {
    const { data, error } = await db.from('user_story_library').select('user_id').eq('story_id', storyId).limit(MAX_TARGETS)
    if (error) throw error
    userIds = (data || []).map((row) => row.user_id)
  } else if (targetType === 'story_followers') {
    const { data, error } = await db.from('user_activity').select('user_id').eq('story_id', storyId).in('event_type', ['story_view','episode_play']).not('user_id','is',null).limit(MAX_TARGETS)
    if (error) throw error
    userIds = [...new Set((data || []).map((row) => row.user_id))]
  } else if (targetType === 'inactive_30d') {
    const { data: subscriptions, error } = await db.from('web_push_subscriptions').select('user_id').eq('active', true).limit(MAX_TARGETS)
    if (error) throw error
    const subscribed = [...new Set((subscriptions || []).map((row) => String(row.user_id)))]
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: recent, error: recentError } = await db.from('user_activity').select('user_id').gte('created_at', cutoff).not('user_id','is',null).limit(10000)
    if (recentError) throw recentError
    const active = new Set((recent || []).map((row) => String(row.user_id)))
    userIds = subscribed.filter((id) => !active.has(id))
  } else {
    const { data, error } = await db.from('web_push_subscriptions').select('user_id').eq('active', true).limit(MAX_TARGETS)
    if (error) throw error
    userIds = [...new Set((data || []).map((row) => row.user_id))]
  }

  const rows = await subscriptionsForUserIds(userIds, category)
  const payload = {
    kind, title, message, url: targetUrl,
    icon: body.icon && String(body.icon).startsWith('/') ? String(body.icon).slice(0, 300) : '/icon-192.png',
    urgency: kind === 'new_episode' ? 'high' : 'normal', ttl: 3600,
  }
  const result = await sendToSubscriptions(rows, payload)

  await db.from('web_push_notifications').insert({
    kind, title, message, target_url: targetUrl, target_type: targetType,
    target_story_id: storyId, requested_by: user.id, sent_count: result.sent, failed_count: result.failed,
  })
  return send(res, 200, JSON.stringify({ ok: true, ...result, targetedUsers: userIds.length }), jsonHeaders(req))
}

export async function dispatchNewEpisodes() {
  if (!configured || !db) return { configured: false, processed: 0, sent: 0, failed: 0 }
  const { data: state } = await db.from('web_push_dispatch_state').select('last_episode_created_at').eq('id', 1).maybeSingle()
  const since = state?.last_episode_created_at || new Date().toISOString()
  const { data: episodes, error } = await db.from('episodes')
    .select('id,story_id,episode_number,title,created_at')
    .gt('created_at', since).order('created_at', { ascending: true }).limit(100)
  if (error) throw error
  let sent = 0
  let failed = 0
  let last = since
  for (const episode of episodes || []) {
    last = episode.created_at || last
    const { data: libraryRows, error: libraryError } = await db.from('user_story_library').select('user_id').eq('story_id', episode.story_id).limit(MAX_TARGETS)
    if (libraryError) throw libraryError
    const userIds = [...new Set((libraryRows || []).map((row) => row.user_id))]
    const rows = await subscriptionsForUserIds(userIds, 'new_episodes')
    const payload = {
      kind: 'new_episode',
      title: '🔔 New Episode Available',
      message: cleanText((episode.title || 'Episode ' + episode.episode_number) + ' is now available.', 500),
      url: '/?hj_story=' + encodeURIComponent(episode.story_id) + '&hj_episode=' + encodeURIComponent(episode.episode_number || '') + '&hj_open=player',
      icon: '/icon-192.png', urgency: 'high', ttl: 86400,
    }
    for (const row of rows) {
      const already = await db.from('web_push_episode_dispatches').select('user_id').eq('user_id', row.user_id).eq('episode_id', episode.id).maybeSingle()
      if (already.data) continue
      try {
        const result = await sendOne(row.subscription, payload)
        if (result.invalid) {
          await db.from('web_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', row.id)
          failed += 1
          continue
        }
        await db.from('web_push_episode_dispatches').insert({ user_id: row.user_id, episode_id: episode.id })
        sent += 1
      } catch (error) {
        failed += 1
        console.warn('[web-push] episode dispatch failed:', String(error?.message || error).slice(0, 240))
      }
    }
  }
  if (!episodes?.length || failed === 0) {
    await db.from('web_push_dispatch_state').upsert({ id: 1, last_episode_created_at: last, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  }
  return { configured: true, processed: episodes?.length || 0, sent, failed }
}

export function startWebPushDispatcher() {
  if (!configured || !db) return () => {}
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await dispatchNewEpisodes() } catch (error) { console.warn('[web-push] dispatcher tick failed:', String(error?.message || error).slice(0, 300)) }
    finally { running = false }
  }
  void tick()
  const timer = setInterval(tick, 15_000)
  timer.unref?.()
  return () => clearInterval(timer)
}
