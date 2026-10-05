const DEFAULT_STREAMING_SERVER_URL = 'https://hj-telegram-streaming.onrender.com'

const VERCEL_STREAMING_HOST_PATTERN =
  /^https:\/\/hj-telegram-streaming(?:-[a-z0-9-]+-ak-3a25)?\.vercel\.app$/i

export function normalizeStreamingServerUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return DEFAULT_STREAMING_SERVER_URL

  try {
    const url = new URL(raw)
    const normalized = url.toString().replace(/\/+$/, '')

    if (VERCEL_STREAMING_HOST_PATTERN.test(normalized)) {
      return DEFAULT_STREAMING_SERVER_URL
    }

    return normalized
  } catch {
    return raw
  }
}

export const STREAMING_SERVER_URL = normalizeStreamingServerUrl(
  import.meta.env.VITE_STREAMING_SERVER_URL
)

export { DEFAULT_STREAMING_SERVER_URL }

export async function fetchTelegramMessages(query = '', init = {}) {
  const suffix = String(query || '').trim().replace(/^\?/, '')
  const candidates = [...new Set([STREAMING_SERVER_URL, DEFAULT_STREAMING_SERVER_URL].filter(Boolean))]

  let lastError = null
  for (const base of candidates) {
    const url = base + '/telegram/messages' + (suffix ? '?' + suffix : '')
    try {
      const response = await fetch(url, init)
      if (response.ok) return response

      // Preserve auth/configuration failures; only fall back for an unavailable
      // configured endpoint such as localhost during local full-stack testing.
      if (![404, 502, 503].includes(response.status) || base === candidates[candidates.length - 1]) {
        return response
      }
      lastError = new Error('Telegram server returned HTTP ' + response.status)
    } catch (error) {
      lastError = error
      if (base === candidates[candidates.length - 1]) throw error
    }
  }

  throw lastError || new Error('Telegram server is unavailable.')
}
