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

test('cover upload rejects missing admin authorization', async () => {
  const response = await coverUpload({
    request: new Request('https://preview.test/api/admin/covers/upload', { method: 'POST', body: new FormData() }),
    env: { COVERS_BUCKET: { async put() { throw new Error('must not be called') } } },
  })
  assert.equal(response.status, 401)
})
