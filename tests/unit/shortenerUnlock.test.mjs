import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.UNLOCK_TOKEN_SECRET = 'test-only-hj-groups-unlock-secret'
process.env.AROLINKS_API_TOKEN = 'test-arolinks-token'
process.env.EARN4LINK_API_TOKEN = 'test-earn4link-token'

const {
  getProviderOrder,
  extractProviderUrl,
  callProvider,
  createShortLinkWithFallback,
  hmacToken,
  randomToken,
  safeReturnPath,
  calculateUnlockExpiry,
  isIntentUsable,
  contentPath,
  isReusableShortLink,
  isEntitlementActive,
  chooseUnlockExpiry,
} = await import('../../server/shortenerUnlock.mjs')

const shortener = await import('../../src/lib/shortenerProviders.js')

test('provider normalization defaults to AroLinks primary and Earn4Link fallback', () => {
  const settings = shortener.normalizeShortenerSettings({})
  assert.equal(settings.primaryProvider, 'arolinks')
  assert.equal(settings.fallbackProvider, 'earn4link')
  assert.equal(shortener.getShortenerProviderHint(settings), 'AroLinks → Earn4Link')
})

test('provider normalization preserves an explicit None fallback', () => {
  const settings = shortener.normalizeShortenerSettings({
    primaryProvider: 'arolinks',
    fallbackProvider: '',
  })
  assert.equal(settings.fallbackProvider, '')
  assert.deepEqual(shortener.getShortenerProviderOrder(settings), ['arolinks'])
})

test('provider normalization persists the Admin primaryShortener field', () => {
  const settings = shortener.normalizeShortenerSettings({
    primaryShortener: 'earn4link',
    fallbackShortener: 'arolinks',
  })
  assert.equal(settings.primaryProvider, 'earn4link')
  assert.equal(settings.primaryShortener, 'earn4link')
  assert.equal(settings.fallbackProvider, 'arolinks')
  assert.equal(settings.fallbackShortener, 'arolinks')
})

test('provider order removes duplicates and ignores unsupported providers', () => {
  assert.deepEqual(
    getProviderOrder({ primary: 'arolinks', fallback: 'arolinks' }),
    ['arolinks']
  )
  assert.deepEqual(
    getProviderOrder({ primary: 'invalid', fallback: 'earn4link' }),
    ['earn4link']
  )
})

test('provider URL extraction accepts documented-style JSON response', () => {
  assert.equal(
    extractProviderUrl(
      'earn4link',
      JSON.stringify({ status: 'success', shortenedUrl: 'https://earn4link.in/abc123' })
    ),
    'https://earn4link.in/abc123'
  )
  assert.equal(
    extractProviderUrl('arolinks', JSON.stringify({
      shortenedUrl: 'https://arolinks.com/xyz789',
    })),
    'https://arolinks.com/xyz789'
  )
})

test('provider URL extraction rejects unrelated hosts', () => {
  assert.equal(
    extractProviderUrl('earn4link', JSON.stringify({
      shortenedUrl: 'https://example.com/not-a-provider-link',
    })),
    ''
  )
})

test('primary provider succeeds without invoking fallback', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (url) => {
    calls.push(String(url))
    return new Response(
      JSON.stringify({ shortenedUrl: 'https://arolinks.com/primary123' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  try {
    const result = await createShortLinkWithFallback(
      'https://hj-groups.example/unlock/audio/25',
      'hj-audio-25',
      ['arolinks', 'earn4link']
    )
    assert.equal(result.provider, 'arolinks')
    assert.equal(result.shortUrl, 'https://arolinks.com/primary123')
    assert.equal(calls.length, 1)
    assert.match(calls[0], /arolinks\.com\/api/)
  } finally {
    global.fetch = originalFetch
  }
})

test('failed primary provider falls back to Earn4Link', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (url) => {
    const target = new URL(url)
    calls.push(target.hostname)
    if (target.hostname === 'arolinks.com') {
      return new Response('temporary failure', { status: 503 })
    }
    return new Response(
      JSON.stringify({ status: 'success', shortenedUrl: 'https://earn4link.in/fallback456' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  try {
    const result = await createShortLinkWithFallback(
      'https://hj-groups.example/unlock/audio/25',
      'hj-audio-25',
      ['arolinks', 'earn4link']
    )
    assert.equal(result.provider, 'earn4link')
    assert.equal(result.shortUrl, 'https://earn4link.in/fallback456')
    assert.deepEqual(calls, ['arolinks.com', 'earn4link.in'])
  } finally {
    global.fetch = originalFetch
  }
})

test('both providers failing returns an aggregated failure', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => new Response('failure', { status: 502 })

  try {
    await assert.rejects(
      createShortLinkWithFallback(
        'https://hj-groups.example/unlock/audio/25',
        '',
        ['arolinks', 'earn4link']
      ),
      /All shortener providers failed/
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('unlock tokens are random and HMAC changes when token changes', () => {
  const first = randomToken()
  const second = randomToken()
  assert.notEqual(first, second)
  assert.equal(first.length >= 40, true)
  assert.notEqual(hmacToken(first), hmacToken(second))
})

test('unlock return paths cannot become open redirects', () => {
  assert.equal(safeReturnPath('/'), '/')
  assert.equal(safeReturnPath('/story/25?episode=3'), '/story/25?episode=3')
  assert.equal(safeReturnPath('https://evil.example/steal'), '/')
  assert.equal(safeReturnPath('//evil.example/steal'), '/')
  assert.equal(safeReturnPath('/\r\nLocation: https://evil.example'), '/')
  assert.equal(safeReturnPath('/\\\\evil.example/path'), '/')
})

test('six-hour expiry uses server-side duration in UTC ISO format', () => {
  const now = Date.parse('2026-09-26T10:00:00.000Z')
  assert.equal(
    calculateUnlockExpiry(now, 360),
    '2026-09-26T16:00:00.000Z'
  )
})

test('unlock intent rejects wrong user, wrong content, expired, and already-used sessions', () => {
  const base = {
    user_id: 'user-1',
    content_type: 'audio',
    content_id: 25,
    status: 'pending',
    expires_at: '2026-09-26T11:00:00.000Z',
  }
  const now = Date.parse('2026-09-26T10:00:00.000Z')

  assert.equal(
    isIntentUsable(base, {
      userId: 'user-1',
      contentType: 'audio',
      contentId: 25,
      nowMs: now,
    }),
    true
  )

  assert.equal(
    isIntentUsable(base, {
      userId: 'user-2',
      contentType: 'audio',
      contentId: 25,
      nowMs: now,
    }),
    false
  )

  assert.equal(
    isIntentUsable(base, {
      userId: 'user-1',
      contentType: 'video',
      contentId: 25,
      nowMs: now,
    }),
    false
  )

  assert.equal(
    isIntentUsable(base, {
      userId: 'user-1',
      contentType: 'audio',
      contentId: 26,
      nowMs: now,
    }),
    false
  )

  assert.equal(
    isIntentUsable({
      ...base,
      expires_at: '2026-09-26T09:59:00.000Z',
    }, {
      userId: 'user-1',
      contentType: 'audio',
      contentId: 25,
      nowMs: now,
    }),
    false
  )

  assert.equal(
    isIntentUsable({
      ...base,
      status: 'completed',
    }, {
      userId: 'user-1',
      contentType: 'audio',
      contentId: 25,
      nowMs: now,
    }),
    false
  )
})

test('callProvider validates provider-specific URL host', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => new Response(
    JSON.stringify({ shortenedUrl: 'https://example.com/wrong' }),
    { status: 200 }
  )

  try {
    await assert.rejects(
      callProvider('earn4link', 'https://hj-groups.example/unlock/audio/25', ''),
      /no valid shortened URL/
    )
  } finally {
    global.fetch = originalFetch
  }
})


test('permanent short-link reuse requires an active matching provider chain', () => {
  assert.equal(
    isReusableShortLink({
      active: true,
      short_url: 'https://arolinks.com/episode25',
      destination_path: '/unlock/audio/25',
      provider_chain: 'arolinks>earn4link',
    }, 'arolinks>earn4link'),
    true
  )
  assert.equal(
    isReusableShortLink({
      active: true,
      short_url: 'https://arolinks.com/episode25',
      destination_path: '/unlock/audio/25',
      provider_chain: 'earn4link',
    }, 'arolinks>earn4link'),
    false
  )
  assert.equal(
    isReusableShortLink({
      active: true,
      short_url: '',
      destination_path: '/unlock/audio/25',
      provider_chain: 'arolinks>earn4link',
    }, 'arolinks>earn4link'),
    false
  )
})

test('temporary entitlement is active only while server expiry is in the future', () => {
  const now = Date.parse('2026-09-26T10:00:00.000Z')
  assert.equal(isEntitlementActive('2026-09-26T10:00:01.000Z', now), true)
  assert.equal(isEntitlementActive('2026-09-26T10:00:00.000Z', now), false)
  assert.equal(isEntitlementActive('2026-09-26T09:59:59.000Z', now), false)
  assert.equal(isEntitlementActive('not-a-date', now), false)
})

test('duplicate unlock completion never shortens an existing later expiry', () => {
  assert.equal(
    chooseUnlockExpiry(
      '2026-09-26T16:00:00.000Z',
      '2026-09-26T12:00:00.000Z'
    ),
    '2026-09-26T16:00:00.000Z'
  )
  assert.equal(
    chooseUnlockExpiry(
      '2026-09-26T12:00:00.000Z',
      '2026-09-26T16:00:00.000Z'
    ),
    '2026-09-26T16:00:00.000Z'
  )
})

test('unlock routes cover audio, video and book content types', () => {
  assert.equal(contentPath('audio', 25), '/unlock/audio/25')
  assert.equal(contentPath('video', 12), '/unlock/video/12')
  assert.equal(contentPath('book', 7), '/unlock/book/7')
})

test('a direct unlock route cannot grant abandoned-flow access', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'server/shortenerUnlock.mjs'),
    'utf8'
  )
  const start = source.indexOf('async function startUnlock')
  const complete = source.indexOf('async function completeUnlock')
  assert.ok(start >= 0 && complete > start)
  const startBlock = source.slice(start, complete)
  assert.equal(startBlock.includes(".from('ad_unlocks')"), false)
  assert.equal(startBlock.includes("ad_unlocks"), false)
  assert.equal(startBlock.includes("createIntent"), true)
})

test('final completion requires the authenticated completion endpoint to consume the one-time session', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'server/shortenerUnlock.mjs'),
    'utf8'
  )
  const completeStart = source.indexOf('async function completeUnlock')
  const handlerStart = source.indexOf('export async function handleShortenerRequest')
  assert.ok(completeStart >= 0 && handlerStart > completeStart)
  const block = source.slice(completeStart, handlerStart)
  assert.match(block, /await authenticate\(req\)/)
  assert.match(block, /hj_unlock_code/)
  assert.match(block, /status !== 'pending'/)
  assert.match(block, /from\('ad_unlocks'\)/)
  assert.match(block, /upsert/)
})

test('unlock completion cannot accept arbitrary browser expiry values', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'server/shortenerUnlock.mjs'),
    'utf8'
  )
  const completeStart = source.indexOf('async function completeUnlock')
  const block = source.slice(completeStart, source.indexOf('async function unlockLanding'))
  assert.equal(block.includes("body?.expiresAt"), false)
  assert.equal(block.includes("body.expiresAt"), false)
  assert.match(block, /calculateUnlockExpiry\(Date\.now\(\), settings\.unlockDurationMinutes\)/)
})

test('shortener start re-checks existing server-side access before creating a provider intent', async () => {
  const source = readFileSync(
    resolve(process.cwd(), 'server/shortenerUnlock.mjs'),
    'utf8'
  )
  const start = source.indexOf('async function startUnlock')
  const settings = source.indexOf('const settings = await getAdminSettings()', start)
  assert.ok(start >= 0 && settings > start)
  const block = source.slice(start, settings)
  assert.match(block, /getExistingAccess\(user, contentType, contentId, content\)/)
  assert.match(block, /alreadyGranted: true/)
  assert.match(block, /return json\(res, 200/)
})

test('secret configuration is server-only and never referenced through VITE_ variables', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'server/shortenerUnlock.mjs'),
    'utf8'
  )
  for (const secret of [
    'AROLINKS_API_TOKEN',
    'EARN4LINK_API_TOKEN',
    'UNLOCK_TOKEN_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    assert.equal(source.includes('VITE_' + secret), false)
  }
})

test('secure media keeps Ads content behind the server entitlement check', async () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/lib/secureMedia.js'),
    'utf8'
  )
  assert.match(source, /resolveAccessType\(item\)\.includes\('ads'\)/)
  assert.match(source, /fetch\('\/api\/shortener\/access'/)
  assert.match(source, /contentType,\n      contentId/)
})
