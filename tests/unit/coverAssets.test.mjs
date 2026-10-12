import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalCoverSource, handleCoverImageError, resolveCoverImage } from '../../src/lib/coverAssets.js'

const original = 'https://yajkfglagnyvenddyvok.supabase.co/storage/v1/object/public/story-covers/stories/example.png'
const staticHash = 'a'.repeat(64)
const entry = {
  src: '/covers/' + staticHash + '-800.webp',
  srcSet: '/covers/' + staticHash + '-400.webp 400w, /covers/' + staticHash + '-800.webp 800w',
  originalUrl: original,
  width: 800,
  height: 1200,
}
const fixture = { version: 1, covers: { [original]: entry, 'stories/example.png': entry } }

test('cover manifest hit unwraps legacy wsrv URL and resolves the static asset', () => {
  const legacy = 'https://wsrv.nl/?url=' + encodeURIComponent(original) + '&w=800&fit=inside&output=webp&q=75'
  const result = resolveCoverImage(legacy, '', fixture)
  assert.equal(result.mapped, true)
  assert.equal(result.src, entry.src)
  assert.equal(result.fallbackSrc, original)
  assert.equal(result.width, 800)
  assert.equal(canonicalCoverSource(legacy), original)
})

test('manifest hit also accepts storage paths with no database mutation', () => {
  const result = resolveCoverImage('', 'stories/example.png', fixture)
  assert.equal(result.src, entry.src)
  assert.equal(result.mapped, true)
})

test('manifest miss falls back to the direct original URL instead of wsrv.nl', () => {
  const legacy = 'https://wsrv.nl/?url=' + encodeURIComponent(original) + '&w=800'
  const result = resolveCoverImage(legacy, '', { version: 1, covers: {} })
  assert.equal(result.src, original)
  assert.equal(result.src.includes('wsrv.nl'), false)
  assert.equal(result.mapped, false)
})

test('R2 upload URLs infer responsive 400/800 variants', () => {
  const hash = 'a'.repeat(64)
  const result = resolveCoverImage('/api/covers/preview-' + hash + '-800.webp', '')
  assert.equal(result.mapped, true)
  assert.match(result.srcSet, /preview-[a-f0-9]{64}-400\.webp 400w/)
  assert.match(result.srcSet, /preview-[a-f0-9]{64}-800\.webp 800w/)
})

test('broken mapped image first retries the original then switches to a placeholder', () => {
  const image = {
    src: '/covers/static-hash-800.webp',
    dataset: {},
    attrs: { src: '/covers/static-hash-800.webp', srcset: 'x' },
    getAttribute(name) { return this.attrs[name] || null },
    removeAttribute(name) { delete this.attrs[name] },
    set src(value) { this._src = value; this.attrs.src = value },
    get src() { return this._src || this.attrs.src },
    onerror: () => {},
  }
  const event = { currentTarget: image }
  assert.equal(handleCoverImageError(event, original), 'fallback')
  assert.equal(image.src, original)
  assert.equal(image.attrs.srcset, undefined)
  assert.equal(handleCoverImageError(event, original), 'placeholder')
  assert.equal(image.src, '/cover-placeholder.svg')
  assert.equal(image.onerror, null)
})
