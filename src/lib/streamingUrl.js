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
