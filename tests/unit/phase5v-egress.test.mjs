import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPublicCatalogFetcher } from '../../src/lib/publicCatalogClient.js'
import { onRequestGet } from '../../functions/api/public-catalog.js'

test('catalog client has no direct fallback, Realtime subscription, or polling', async () => {
  const source = await readFile(new URL('../../src/lib/telegramContent.js', import.meta.url), 'utf8')
  assert.match(source, /publicCatalogClient\.js/)
  assert.doesNotMatch(source, /\.channel\(/)
  assert.doesNotMatch(source, /setInterval/)
  assert.doesNotMatch(source, /supabase\.from\(/)
  assert.doesNotMatch(source, /select\('\*'\)/)
})

test('402/429/5xx opens a five-minute circuit breaker without retries', async () => {
  for (const status of [402, 429, 503]) {
    let now = 1_000_000
    let calls = 0
    const fetcher = createPublicCatalogFetcher({
      now: () => now, cooldownMs: 300_000, random: () => 0,
      sleep: async () => assert.fail('HTTP failure should not retry'),
      fetchImpl: async () => {
        calls += 1
        return new Response(JSON.stringify({ error: 'upstream unavailable' }), {
          status, headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    await assert.rejects(fetcher(), /PUBLIC_CATALOG_TEMPORARILY_UNAVAILABLE/)
    await assert.rejects(fetcher(), /PUBLIC_CATALOG_COOLDOWN/)
    assert.equal(calls, 1)
    now += 300_001
    await assert.rejects(fetcher(), /PUBLIC_CATALOG_TEMPORARILY_UNAVAILABLE/)
    assert.equal(calls, 2)
  }
})

test('network failure retries once using exponential delay plus jitter', async () => {
  let calls = 0
  const sleeps = []
  const fetcher = createPublicCatalogFetcher({
    random: () => 0.25, sleep: async (ms) => sleeps.push(ms),
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) throw new TypeError('simulated network failure')
      return new Response(JSON.stringify({ ok: true, stories: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  assert.equal((await fetcher()).ok, true)
  assert.equal(calls, 2)
  assert.deepEqual(sleeps, [500])
})

test('non-transient 4xx fails immediately with no retry', async () => {
  let calls = 0
  const sleeps = []
  const fetcher = createPublicCatalogFetcher({
    sleep: async (ms) => sleeps.push(ms),
    fetchImpl: async () => {
      calls += 1
      return new Response(JSON.stringify({ error: 'bad request' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  await assert.rejects(fetcher(), /bad request/)
  assert.equal(calls, 1)
  assert.deepEqual(sleeps, [])
})

test('public catalog returns five-minute headers, explicit column queries, and cache MISS then HIT', async () => {
  const oldFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const oldCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  const backing = new Map()
  const upstreamUrls = []
  const pending = []
  Object.defineProperty(globalThis, 'caches', {
    configurable: true, writable: true,
    value: { default: {
      async match(key) { const value = backing.get(key.url); return value ? value.clone() : undefined },
      async put(key, value) { backing.set(key.url, value.clone()) },
    } },
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, writable: true,
    value: async (input) => {
      upstreamUrls.push(String(input))
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  try {
    const context = {
      request: new Request('https://preview.example/api/public-catalog'),
      env: { SUPABASE_URL: 'https://project.example', SUPABASE_PUBLISHABLE_KEY: 'public-key' },
      waitUntil(promise) { pending.push(promise) },
    }
    const cold = await onRequestGet(context)
    assert.equal(cold.status, 200)
    assert.equal(cold.headers.get('Cache-Control'), 'public, max-age=300, s-maxage=300')
    assert.equal(cold.headers.get('X-HJ-Public-Catalog-Cache'), 'MISS')
    assert.equal(upstreamUrls.length, 5)
    for (const raw of upstreamUrls) {
      const query = new URL(raw).searchParams
      const select = query.get('select')
      assert.ok(select)
      assert.notEqual(select, '*')
    }
    const episodeUrl = upstreamUrls.map((raw) => new URL(raw)).find((url) => url.pathname.endsWith('/episodes'))
    assert.ok(episodeUrl)
    assert.match(episodeUrl.searchParams.get('select'), /telegram_message_id/)
    assert.match(episodeUrl.searchParams.get('select'), /access_type/)
    await Promise.all(pending)
    const warm = await onRequestGet(context)
    assert.equal(warm.status, 200)
    assert.equal(warm.headers.get('X-HJ-Public-Catalog-Cache'), 'HIT')
    assert.equal(upstreamUrls.length, 5, 'cache HIT must not query Supabase again')
  } finally {
    if (oldFetch) Object.defineProperty(globalThis, 'fetch', oldFetch)
    else delete globalThis.fetch
    if (oldCaches) Object.defineProperty(globalThis, 'caches', oldCaches)
    else delete globalThis.caches
  }
})

test('authorization is no-store; failed upstream status is not cached', async () => {
  const oldFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const oldCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  const backing = new Map()
  let calls = 0
  Object.defineProperty(globalThis, 'caches', {
    configurable: true, writable: true,
    value: { default: {
      async match(key) { const value = backing.get(key.url); return value ? value.clone() : undefined },
      async put(key, value) { backing.set(key.url, value.clone()) },
    } },
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, writable: true,
    value: async () => {
      calls += 1
      return new Response('quota exceeded', { status: 402 })
    },
  })
  try {
    const auth = await onRequestGet({
      request: new Request('https://preview.example/api/public-catalog', {
        headers: { Authorization: 'Bearer unit-test-only' },
      }),
      env: {}, waitUntil() { assert.fail('authorization response must not cache') },
    })
    assert.equal(auth.status, 400)
    assert.equal(auth.headers.get('Cache-Control'), 'no-store')
    assert.equal(calls, 0)

    const failure = await onRequestGet({
      request: new Request('https://preview.example/api/public-catalog'),
      env: { SUPABASE_URL: 'https://project.example', SUPABASE_PUBLISHABLE_KEY: 'public-key' },
      waitUntil() { assert.fail('failed response must not cache') },
    })
    assert.equal(failure.status, 503)
    assert.equal(failure.headers.get('Cache-Control'), 'no-store')
    assert.equal(backing.size, 0)
  } finally {
    if (oldFetch) Object.defineProperty(globalThis, 'fetch', oldFetch)
    else delete globalThis.fetch
    if (oldCaches) Object.defineProperty(globalThis, 'caches', oldCaches)
    else delete globalThis.caches
  }
})

test('audio preload remains disabled and friendly catalog warning is present', async () => {
  const source = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8')
  assert.match(source, /<audio[\s\S]*?preload="none"/)
  assert.match(source, /catalog-load-warning/)
})
