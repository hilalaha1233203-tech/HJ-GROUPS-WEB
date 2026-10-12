import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../../functions/[[path]].js'

const json = (value) => JSON.stringify(value)
const request = (path, init = {}) => new Request('https://hj-preview.test' + path, init)
const run = (path, env = {}, init = {}) => onRequest({ request: request(path, init), env })

test('Pages health reports actual TTS and Web Push configuration', async () => {
  const unavailable = await run('/health')
  assert.equal(unavailable.status, 200)
  const empty = await unavailable.json()
  assert.equal(empty.ttsConfigured, false)
  assert.equal(empty.ttsProviders.sarvam.configured, false)
  assert.equal(empty.ttsProviders.edge.configured, false)
  assert.equal(empty.webPushConfigured, false)

  const configured = await run('/health', {
    SARVAM_API_KEY: 'test-only-sarvam-key',
    WEB_PUSH_VAPID_PUBLIC_KEY: 'test-only-vapid-public-key',
  })
  const ready = await configured.json()
  assert.equal(ready.ttsConfigured, true)
  assert.equal(ready.ttsProviders.sarvam.configured, true)
  assert.equal(ready.ttsProviders.edge.configured, false)
  assert.equal(ready.webPushConfigured, true)
  assert.equal(JSON.stringify(ready).includes('test-only-sarvam-key'), false)
})

test('Edge TTS returns an explicit unsupported-runtime error without attempting a WebSocket provider', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('Unexpected network request')
  }
  try {
    const response = await run('/api/edge-tts', {}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json({ text: 'வணக்கம் HJ GROUPS' }),
    })
    assert.equal(response.status, 503)
    const payload = await response.json()
    assert.equal(payload.code, 'EDGE_TTS_NOT_MIGRATED')
    assert.match(payload.hint, /Cloudflare Pages Workers/)
    assert.match(payload.hint, /SARVAM_API_KEY/)
    assert.match(payload.hint, /legacy backend/)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Sarvam TTS reports missing configuration as a structured error', async () => {
  const response = await run('/api/tts', {}, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json({ text: 'வணக்கம் HJ GROUPS' }),
  })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    error: 'Text-to-speech service unavailable',
    code: 'SARVAM_TTS_NOT_CONFIGURED',
  })
})

test('Sarvam TTS uses the external API contract and returns audio when the provider succeeds', async () => {
  const originalFetch = globalThis.fetch
  let calledUrl = ''
  let calledHeaders
  let calledBody
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url)
    calledHeaders = new Headers(init.headers)
    calledBody = JSON.parse(init.body)
    return new Response(new Uint8Array([0x49, 0x44, 0x33, 1]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    })
  }
  try {
    const response = await run('/api/tts', { SARVAM_API_KEY: 'test-only-sarvam-key' }, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json({ text: 'வணக்கம் HJ GROUPS', language_code: 'ta-IN', speaker: 'ratan' }),
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type') || '', /^audio\/mpeg/i)
    assert.equal(response.headers.get('X-TTS-Provider'), 'sarvam')
    assert.equal((await response.arrayBuffer()).byteLength, 4)
    assert.equal(calledUrl, 'https://api.sarvam.ai/text-to-speech/stream')
    assert.equal(calledHeaders.get('api-subscription-key'), 'test-only-sarvam-key')
    assert.equal(calledBody.model, 'bulbul:v3')
    assert.equal(calledBody.target_language_code, 'ta-IN')
    assert.equal(calledBody.output_audio_codec, 'mp3')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Web Push subscription storage route authenticates and writes subscription plus preferences', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url))
    calls.push({ url: target.toString(), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
    if (target.pathname === '/auth/v1/user') {
      return new Response(json({ id: '00000000-0000-4000-8000-000000000001', app_metadata: {} }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (target.pathname === '/rest/v1/web_push_subscriptions' || target.pathname === '/rest/v1/web_push_preferences') {
      return new Response(null, { status: 201 })
    }
    throw new Error('Unexpected test URL: ' + target.pathname)
  }
  try {
    const response = await run('/api/push/subscribe', {
      WEB_PUSH_VAPID_PUBLIC_KEY: 'test-only-vapid-public-key',
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
    }, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-user-token',
        'User-Agent': 'HJ test agent',
      },
      body: json({
        subscription: {
          endpoint: 'https://push.example.test/subscription/abc123456789',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        preferences: { new_episodes: true, new_stories: false },
      }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.deepEqual(calls.map((call) => call.url.split('/').slice(-1)[0]), [
      'user', 'web_push_subscriptions', 'web_push_preferences',
    ])
    assert.equal(calls[1].body.user_id, '00000000-0000-4000-8000-000000000001')
    assert.equal(calls[1].body.subscription.keys.p256dh, 'test-p256dh')
    assert.equal(calls[2].body.new_stories, false)
    assert.equal(calls[2].body.announcements, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('admin Web Push delivery remains explicitly pending', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return new Response(json({ id: '00000000-0000-4000-8000-000000000002', app_metadata: { role: 'admin' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error('Unexpected test URL')
  }
  try {
    const response = await run('/api/admin/notifications/send', {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
    }, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-admin-token', 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'WEB_PUSH_SEND_NOT_MIGRATED')
  } finally {
    globalThis.fetch = originalFetch
  }
})
