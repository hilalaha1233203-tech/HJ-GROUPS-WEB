import manifest from './cover-manifest.json' with { type: 'json' }

export const COVER_PLACEHOLDER = '/cover-placeholder.svg'

function unwrapTransformUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.hostname.toLowerCase() === 'wsrv.nl') {
      const original = parsed.searchParams.get('url')
      if (original && /^https?:\/\//i.test(original)) return original
    }
  } catch {}
  return raw
}

function normalizePath(value) {
  try { return decodeURIComponent(String(value || '')).replace(/^\/+/, '') }
  catch { return String(value || '').replace(/^\/+/, '') }
}

function storagePathFromUrl(value) {
  try {
    const parsed = new URL(value)
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|authenticated)\/story-covers\/(.+)$/i)
    return match ? normalizePath(match[1]) : ''
  } catch {
    return ''
  }
}

function lookupKeys(rawSource, source, sourcePath) {
  const keys = []
  const add = (value) => {
    const text = String(value || '').trim()
    if (!text) return
    keys.push(text, normalizePath(text))
  }
  add(sourcePath)
  add(rawSource)
  add(source)
  add(storagePathFromUrl(source))
  try { add(new URL(source).pathname) } catch {}
  return [...new Set(keys)]
}

function relativeVariantSet(url) {
  const raw = String(url || '')
  const match = raw.match(/^(.*?)(?:-400|-800)\.webp(?:\?.*)?$/i)
  if (!match) return ''
  const base = match[1]
  return base + '-400.webp 400w, ' + base + '-800.webp 800w'
}

export function resolveCoverImage(rawSource, sourcePath = '', sourceManifest = manifest) {
  const raw = String(rawSource || '').trim()
  const source = unwrapTransformUrl(raw)
  const entries = sourceManifest && sourceManifest.covers && typeof sourceManifest.covers === 'object'
    ? sourceManifest.covers
    : {}

  for (const key of lookupKeys(raw, source, sourcePath)) {
    const entry = entries[key]
    if (entry && typeof entry.src === 'string' && entry.src) {
      return {
        src: entry.src,
        srcSet: String(entry.srcSet || relativeVariantSet(entry.src)),
        fallbackSrc: String(entry.originalUrl || source),
        width: Number(entry.width) || 400,
        height: Number(entry.height) || 600,
        mapped: true,
      }
    }
  }

  if (/^(?:https?:\/\/[^/]+)?\/api\/covers\/(?:preview-|prod-)?[a-f0-9]{64}-800\.webp(?:\?.*)?$/i.test(source)) {
    return {
      src: source,
      srcSet: relativeVariantSet(source),
      fallbackSrc: '',
      width: 800,
      height: 1200,
      mapped: true,
    }
  }

  return {
    src: source || COVER_PLACEHOLDER,
    srcSet: '',
    fallbackSrc: '',
    width: 400,
    height: 600,
    mapped: false,
  }
}

export function handleCoverImageError(event, fallbackSrc = '') {
  const image = event && event.currentTarget
  if (!image) return 'ignored'
  const fallback = String(fallbackSrc || '').trim()
  const current = String(image.getAttribute?.('src') || image.src || '')
  if (fallback && fallback !== current && image.dataset?.coverFallbackStage !== 'fallback') {
    if (image.dataset) image.dataset.coverFallbackStage = 'fallback'
    image.removeAttribute?.('srcset')
    image.src = fallback
    return 'fallback'
  }
  if (image.dataset) image.dataset.coverFallbackStage = 'placeholder'
  image.removeAttribute?.('srcset')
  image.onerror = null
  image.src = COVER_PLACEHOLDER
  return 'placeholder'
}

export function canonicalCoverSource(value) {
  return unwrapTransformUrl(value)
}
