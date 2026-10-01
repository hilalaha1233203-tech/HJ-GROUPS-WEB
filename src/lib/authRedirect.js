const PRODUCTION_SITE_URL = 'https://hj-groups-website.getvoroa.com/'

export function getAuthRedirectUrl() {
  const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL || '').trim()
  if (configured) {
    try {
      const url = new URL(configured)
      url.hash = ''
      url.search = ''
      return url.toString().replace(/\/+$/, '') + '/'
    } catch {
      // Ignore an invalid build-time value and use the safe fallback below.
    }
  }

  if (typeof window === 'undefined') return PRODUCTION_SITE_URL

  const origin = String(window.location.origin || '').trim()
  if (/^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?$/i.test(origin)) {
    return PRODUCTION_SITE_URL
  }

  return origin.replace(/\/+$/, '') + '/'
}
