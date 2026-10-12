import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest as coverGet } from '../../functions/api/covers/[asset].js'
import { onRequestPost as coverUpload } from '../../functions/api/admin/covers/upload.js'

const hash = 'b'.repeat(64)
test('cover GET returns immutable cache headers and reads only the cover binding', async () => {
  const response = await coverGet({
    request: new Request('https://preview.test/api/covers/' + hash + '-800.webp'),
    params: { asset: hash + '-800.webp' },
    env: { COVERS_BUCKET: { async get(key) { return { body: new Uint8Array([1,2,3]), httpMetadata: { contentType: 'image/webp' }, httpEtag: '"test-etag"' } } } },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
  assert.equal(response.headers.get('Content-Type'), 'image/webp')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(await response.arrayBuffer().then(x => x.byteLength), 3)
})

test('cover GET does not reveal arbitrary object keys', async () => {
  const response = await coverGet({
    request: new Request('https://preview.test/api/covers/private.pdf'),
    params: { asset: 'private.pdf' },
    env: { COVERS_BUCKET: { async get() { throw new Error('must not be called') } } },
  })
  assert.equal(response.status, 404)
})

test('cover GET reports a missing binding without exposing internal detail', async () => {
  const response = await coverGet({
    request: new Request('https://preview.test/api/covers/' + hash + '-800.webp'),
    params: { asset: hash + '-800.webp' },
    env: {},
  })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'COVER_STORAGE_NOT_CONFIGURED')
})

test('cover upload requires admin authentication before parsing image data', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', app_metadata: {} }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  try {
    const response = await coverUpload({
      request: new Request('https://preview.test/api/admin/covers/upload', { method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: new FormData() }),
      env: { SUPABASE_URL: 'https://supabase.test', SUPABASE_PUBLISHABLE_KEY: 'test-public-key', COVERS_BUCKET: { async put() { throw new Error('must not be called') } } },
    })
    assert.equal(response.status, 403)
  } finally {
    globalThis.fetch = originalFetch
  }
})


test('admin cover upload writes both WebP variants to R2 and returns no Supabase Storage URL', async () => {
  const originalFetch = globalThis.fetch
  const writes = []
  const fakeR2 = {
    async put(key, value, options) {
      writes.push({ key, bytes: value.byteLength || value.length, options })
    },
  }
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({
        id: '00000000-0000-4000-8000-000000000003',
        app_metadata: { role: 'admin' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('Unexpected external request')
  }
  try {
    const validWebp = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,1])
    const form = new FormData()
    form.append('thumbnail', new File([validWebp], 'cover-400.webp', { type: 'image/webp' }))
    form.append('large', new File([validWebp], 'cover-800.webp', { type: 'image/webp' }))
    form.append('width', '1200')
    form.append('height', '1800')
    const response = await coverUpload({
      request: new Request('https://preview-branch.hj-groups-web.pages.dev/api/admin/covers/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-token' },
        body: form,
      }),
      env: {
        SUPABASE_URL: 'https://supabase.test',
        SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
        CF_PAGES_BRANCH: 'phase5u-cover-assets-20261012',
        COVERS_BUCKET: fakeR2,
      },
    })
    assert.equal(response.status, 201)
    const payload = await response.json()
    assert.equal(payload.ok, true)
    assert.match(payload.url, /^\/api\/covers\/preview-[a-f0-9]{64}-800\.webp$/)
    assert.equal(payload.thumbnailBytes, validWebp.length)
    assert.equal(payload.largeBytes, validWebp.length)
    assert.equal(writes.length, 2)
    assert.ok(writes.some(item => /-400\.webp$/.test(item.key)))
    assert.ok(writes.some(item => /-800\.webp$/.test(item.key)))
    assert.ok(writes.every(item => item.options.httpMetadata.cacheControl === 'public, max-age=31536000, immutable'))
    assert.ok(writes.every(item => item.options.httpMetadata.contentType === 'image/webp'))
    assert.equal(payload.url.includes('supabase.co'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('admin cover upload rejects a custom URL with a path before any R2 write', async () => {
  const originalFetch = globalThis.fetch
  let writes = 0
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({
        id: '00000000-0000-4000-8000-000000000004',
        app_metadata: { role: 'admin' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('Unexpected external request')
  }
  try {
    const validWebp = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,1])
    const form = new FormData()
    form.append('thumbnail', new File([validWebp], 'cover-400.webp', { type: 'image/webp' }))
    form.append('large', new File([validWebp], 'cover-800.webp', { type: 'image/webp' }))
    form.append('width', '1200')
    form.append('height', '1800')
    const response = await coverUpload({
      request: new Request('https://preview-branch.hj-groups-web.pages.dev/api/admin/covers/upload', {
        method: 'POST', headers: { Authorization: 'Bearer admin-token' }, body: form,
      }),
      env: {
        SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
        CF_PAGES_BRANCH: 'phase5u-cover-assets-20261012',
        COVER_PUBLIC_BASE_URL: 'https://covers.example.test/something',
        COVERS_BUCKET: { async put() { writes += 1 } },
      },
    })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'COVER_PUBLIC_BASE_URL_INVALID')
    assert.equal(writes, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cover upload rejects missing admin authorization', async () => {
  const response = await coverUpload({
    request: new Request('https://preview.test/api/admin/covers/upload', { method: 'POST', body: new FormData() }),
    env: { COVERS_BUCKET: { async put() { throw new Error('must not be called') } } },
  })
  assert.equal(response.status, 401)
})
