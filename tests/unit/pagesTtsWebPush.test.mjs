import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { onRequest } from '../../functions/[[path]].js'

const json = (value) => JSON.stringify(value)
const request = (path, init = {}) => new Request('https://hj-preview.test' + path, init)
const run = (path, env = {}, init = {}) => onRequest({ request: request(path, init), env })
const AUDIO = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x05, 0x06])

function createBucket() {
  const store = new Map()
  const putKeys = []
  return {
    store,
    putKeys,
    async get(key, options = {}) {
      const entry = store.get(key)
      if (!entry) return null
      const original = entry.bytes
      const bytes = options.range
        ? original.slice(options.range.offset, options.range.offset + options.range.length)
        : original
      return {
        size: original.byteLength,
        etag: entry.etag,
        body: new Response(bytes).body,
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata,
        text: async () => new TextDecoder().decode(original),
        arrayBuffer: async () => original.slice().buffer,
      }
    },
    async put(key, value, options = {}) {
      const previous = store.get(key)
      const onlyIf = options.onlyIf || {}
      if (onlyIf.etagDoesNotMatch === '*' && previous) return null
      if (onlyIf.etagMatches && onlyIf.etagMatches !== previous?.etag) return null
      let bytes
      if (typeof value === 'string') bytes = new TextEncoder().encode(value)
      else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
      else bytes = new Uint8Array(value)
      const etag = 'mock-etag-' + String(store.size + 1) + '-' + String(putKeys.length + 1)
      store.set(key, {
        bytes: bytes.slice(),
        etag,
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {},
      })
      putKeys.push(key)
      return { etag, size: bytes.byteLength }
    },
  }
}

const testEnv = (bucket, overrides = {}) => ({
  MEDIA_CACHE: bucket,
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
  EDGE_TTS_ENABLED: 'false',
  ...overrides,
})
const authFetch = (url) => String(url).endsWith('/auth/v1/user')
const authResponse = () => new Response(json({
  id: '00000000-0000-4000-8000-000000000001',
  app_metadata: {},
}), { status: 200, headers: { 'Content-Type': 'application/json' } })

test('Pages health reports exact TTS binding/provider flags without exposing secrets', async () => {
  const empty = await (await run('/health')).json()
  assert.equal(empty.ttsConfigured, false)
  assert.equal(empty.ttsCacheBucketBound, false)
  assert.equal(empty.ttsProviders.cacheBucketBound, false)
  assert.equal(empty.ttsProviders.edge.enabled, false)
  assert.equal(empty.ttsProviders.edge.viability, 'not_viable_current_workers_handshake')
  assert.equal(empty.ttsProviders.edge.testedInWranglerLocal, true)
  const edgeOnly = await (await run('/health', testEnv(createBucket(), { EDGE_TTS_ENABLED: 'true' }))).json()
  assert.equal(edgeOnly.ttsProviders.edge.enabled, false, 'an env flag cannot override a failed real handshake probe')
  assert.equal(edgeOnly.ttsConfigured, false, 'enabling the known-unviable endpoint must not imply configured TTS')
  assert.equal(empty.ttsProviders.edge.testedInWorkers, false)
  assert.equal(empty.ttsProviders.sarvam.configured, false)
  assert.equal(empty.ttsProviders.googleCloud.configured, false)
  assert.equal(empty.ttsProviders.azureSpeech.configured, false)
  assert.equal(empty.webPushConfigured, false)

  const ready = await (await run('/health', testEnv(createBucket(), {
    SARVAM_API_KEY: 'test-only-sarvam-key',
    WEB_PUSH_VAPID_PUBLIC_KEY: 'test-only-vapid-public-key',
  }))).json()
  assert.equal(ready.ttsConfigured, true)
  assert.equal(ready.ttsCacheBucketBound, true)
  assert.equal(ready.ttsProviders.sarvam.configured, true)
  assert.equal(ready.webPushConfigured, true)
  assert.equal(JSON.stringify(ready).includes('test-only-sarvam-key'), false)
  assert.equal(JSON.stringify(ready).includes('test-only-vapid-public-key'), false)
})

test('TTS requires authentication, enforces configured max characters and never retries provider errors', async () => {
  const noAuth = await run('/api/tts', testEnv(createBucket()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json({ text: 'வணக்கம்' }),
  })
  assert.equal(noAuth.status, 401)
  assert.equal((await noAuth.json()).code, 'TTS_AUTH_REQUIRED')

  const tooLong = await run('/api/tts', testEnv(createBucket(), { TTS_MAX_CHARS: '4' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
    body: json({ text: '12345' }),
  })
  assert.equal(tooLong.status, 413)
  assert.equal((await tooLong.json()).code, 'TTS_MAX_CHARS_EXCEEDED')

  const originalFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async (url) => {
    if (authFetch(url)) return authResponse()
    providerCalls += 1
    return new Response('temporarily unavailable', { status: 503 })
  }
  try {
    const response = await run('/api/tts', testEnv(createBucket(), { SARVAM_API_KEY: 'test-only-sarvam-key' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'வணக்கம் HJ GROUPS' }),
    })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'TTS_PROVIDERS_UNAVAILABLE')
    assert.equal(providerCalls, 1, 'one provider attempt; no retry storm')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TTS miss writes one stable R2 key and subsequent normalized text request is a cache hit', async () => {
  const bucket = createBucket()
  const originalFetch = globalThis.fetch
  let authCalls = 0
  let providerCalls = 0
  let providerUrl = ''
  let providerHeaders
  let providerBody
  globalThis.fetch = async (url, init = {}) => {
    if (authFetch(url)) { authCalls += 1; return authResponse() }
    providerCalls += 1
    providerUrl = String(url)
    providerHeaders = new Headers(init.headers)
    providerBody = JSON.parse(init.body)
    return new Response(AUDIO, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }
  try {
    const first = await run('/api/tts', testEnv(bucket, { SARVAM_API_KEY: 'test-only-sarvam-key' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'வணக்கம்   HJ GROUPS', voice: 'ta-IN-PallaviNeural' }),
    })
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('X-TTS-Provider'), 'sarvam')
    assert.equal(first.headers.get('Accept-Ranges'), 'bytes')
    assert.equal((await first.arrayBuffer()).byteLength, AUDIO.byteLength)
    assert.equal(providerUrl, 'https://api.sarvam.ai/text-to-speech/stream')
    assert.equal(providerHeaders.get('api-subscription-key'), 'test-only-sarvam-key')
    assert.equal(providerBody.model, 'bulbul:v3')
    assert.equal(providerBody.target_language_code, 'ta-IN')
    assert.equal(providerBody.speaker, 'priya', 'Pallavi preference maps to a supported female Bulbul v3 voice')

    const second = await run('/api/tts', testEnv(bucket, { SARVAM_API_KEY: 'test-only-sarvam-key' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'வணக்கம் HJ GROUPS', voice: 'ta-IN-PallaviNeural' }),
    })
    assert.equal(second.status, 200)
    assert.equal(second.headers.get('X-TTS-Provider'), 'sarvam')
    assert.equal(await second.text(), new TextDecoder().decode(AUDIO))
    assert.equal(providerCalls, 1, 'second normalized request must use R2')
    assert.equal(authCalls, 2, 'each request still authenticates the caller')
    assert.equal(bucket.putKeys.filter((key) => key.startsWith('tts/')).length, 1)
    assert.equal([...bucket.store.keys()].filter((key) => /^tts\/[a-f0-9]{64}\.mp3$/.test(key)).length, 1)
    assert.equal(bucket.putKeys.some((key) => key.startsWith('tts-usage/')), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TTS maps saved male/female voice preferences to each configured provider', async () => {
  const bucket = createBucket()
  const originalFetch = globalThis.fetch
  let googleVoice
  let azureSsml = ''
  const sarvamSpeakers = []
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    if (authFetch(target)) return authResponse()
    if (target === 'https://texttospeech.googleapis.com/v1/text:synthesize') {
      googleVoice = JSON.parse(init.body).voice
      return new Response(json({ audioContent: 'SUQzBAUG' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (target.includes('tts.speech.microsoft.com/cognitiveservices/v1')) {
      azureSsml = String(init.body || '')
      return new Response(AUDIO, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    }
    if (target === 'https://api.sarvam.ai/text-to-speech/stream') {
      sarvamSpeakers.push(JSON.parse(init.body).speaker)
      return new Response(AUDIO, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    }
    throw new Error('Unexpected mocked provider URL: ' + target)
  }
  try {
    const googleResponse = await run('/api/tts', testEnv(bucket, { GOOGLE_CLOUD_TTS_API_KEY: 'test-only-google-key' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'வணக்கம் Google', voice: 'ta-IN-ValluvarNeural' }),
    })
    assert.equal(googleResponse.status, 200)
    assert.deepEqual(googleVoice, { languageCode: 'ta-IN', name: 'ta-IN-Standard-B' })

    const azureResponse = await run('/api/tts', testEnv(bucket, {
      AZURE_SPEECH_KEY: 'test-only-azure-key',
      AZURE_SPEECH_REGION: 'eastus',
    }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'Hello from Azure', voice: 'en-IN-PrabhatNeural' }),
    })
    assert.equal(azureResponse.status, 200)
    assert.match(azureSsml, /voice name='en-IN-PrabhatNeural'/, 'Prabhat must not silently normalize to Neerja')

    const sarvamFemale = await run('/api/tts', testEnv(bucket, { SARVAM_API_KEY: 'test-only-sarvam-key' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'வணக்கம் Sarvam female', voice: 'ta-IN-PallaviNeural' }),
    })
    const sarvamMale = await run('/api/tts', testEnv(bucket, { SARVAM_API_KEY: 'test-only-sarvam-key' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'வணக்கம் Sarvam male', voice: 'ta-IN-ValluvarNeural' }),
    })
    assert.equal(sarvamFemale.status, 200)
    assert.equal(sarvamMale.status, 200)
    assert.deepEqual(sarvamSpeakers, ['priya', 'ratan'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cached TTS honours a single byte Range request with 206 and Content-Range', async () => {
  const bucket = createBucket()
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async (url) => {
    if (authFetch(url)) return authResponse()
    providerCalls += 1
    return new Response(AUDIO, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }
  try {
    const env = testEnv(bucket, { SARVAM_API_KEY: 'test-only-sarvam-key' })
    await run('/api/tts', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'Range Tamil text' }),
    })
    const response = await run('/api/tts', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token', Range: 'bytes=1-3' },
      body: json({ text: 'Range Tamil text' }),
    })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('Content-Range'), 'bytes 1-3/' + AUDIO.byteLength)
    assert.equal(response.headers.get('Content-Length'), '3')
    assert.equal((await response.arrayBuffer()).byteLength, 3)
    assert.equal(providerCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TTS enforces a per-user daily limit using R2 only', async () => {
  const bucket = createBucket()
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async (url) => {
    if (authFetch(url)) return authResponse()
    providerCalls += 1
    return new Response(AUDIO, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }
  try {
    const env = testEnv(bucket, { SARVAM_API_KEY: 'test-only-sarvam-key', TTS_DAILY_LIMIT: '1' })
    const make = () => run('/api/tts', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-user-token' },
      body: json({ text: 'Daily limit Tamil' }),
    })
    assert.equal((await make()).status, 200)
    const limited = await make()
    assert.equal(limited.status, 429)
    assert.equal((await limited.json()).code, 'TTS_DAILY_LIMIT_REACHED')
    assert.equal(providerCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('standalone Edge route remains explicit error and frontend does not require that route', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Unexpected network request') }
  try {
    const response = await run('/api/edge-tts', {}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json({ text: 'வணக்கம் HJ GROUPS' }),
    })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'EDGE_TTS_NOT_MIGRATED')
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('frontend authenticates TTS once, falls back to Tamil device voice and disables unavailable read aloud', async () => {
  const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8')
  const bridgeStart = app.indexOf('const installEdgeTtsSpeechBridge')
  const bridgeEnd = app.indexOf('export function App()', bridgeStart)
  const bridge = app.slice(bridgeStart, bridgeEnd)
  assert.match(bridge, /fetch\('\/api\/tts'/)
  assert.match(bridge, /headers\.Authorization = 'Bearer ' \+ session\.access_token/)
  assert.doesNotMatch(bridge, /for \(let attempt = 0; attempt < 2/)
  assert.match(bridge, /error: 'no-tamil-voice'/)
  assert.match(app, /voiceschanged/)
  assert.match(app, /chunkTextForSpeech/)
  assert.match(app, /disabled=\{readerLocked \|\| ttsFallbackUnavailable\}/)
  assert.match(app, /Tamil voice unavailable on this device/)
  assert.doesNotMatch(bridge, /speaker:\s*'ratan'/, 'frontend must not override the selected voice with a hard-coded speaker')
  assert.match(app, /Voice names are preferences: Azure uses the named neural voice/)
  const account = await readFile(new URL('../../src/AccountSettings.jsx', import.meta.url), 'utf8')
  assert.match(account, /Pallavi \(female preference\)/)
  assert.match(account, /Valluvar \(male preference\)/)
  assert.match(account, /Prabhat \(male preference\)/)
})

test('admin notification center never reports a fake sent count while delivery is deferred', async () => {
  const ui = await readFile(new URL('../../src/components/AdminNotificationCenter.jsx', import.meta.url), 'utf8')
  assert.match(ui, /Delivery is not available yet in the Cloudflare Pages runtime/)
  assert.match(ui, /disabled>Delivery not available yet</)
  assert.doesNotMatch(ui, /✓ Sent:|Targeted users:|Failed:/)
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
