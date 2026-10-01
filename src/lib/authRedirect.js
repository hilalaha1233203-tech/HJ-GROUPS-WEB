const PRODUCTION_SITE_URL = 'https://hj-groups-website.getvoroa.com/'
const LOCAL_AUTH_ORIGIN_PATTERN = /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?$/i

function appendAuthPath(base, path = '/') {
  const url = new URL(base)
  url.hash = ''
  url.search = ''

  const cleanPath = String(path || '/').trim()
  const targetPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath
  const basePath = url.pathname.replace(/\/+$/, '')

  url.pathname = basePath && basePath !== '/'
    ? basePath + (targetPath === '/' ? '/' : targetPath)
    : targetPath

  const result = url.toString().replace(/\/+$/, '')
  return targetPath === '/' ? result + '/' : result
}

export function getAuthRedirectUrl({ productionSafe = false, path = '/' } = {}) {
  const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL || '').trim()

  if (productionSafe) {
    try {
      return appendAuthPath(PRODUCTION_SITE_URL, path)
    } catch {
      return PRODUCTION_SITE_URL
    }
  }

  if (typeof window === 'undefined') return PRODUCTION_SITE_URL

  const origin = String(window.location.origin || '').trim()
  if (LOCAL_AUTH_ORIGIN_PATTERN.test(origin)) {
    return appendAuthPath(origin, path)
  }

  if (configured) {
    try {
      return appendAuthPath(configured, path)
    } catch {
      // Ignore an invalid build-time value and use the current origin.
    }
  }

  try {
    return appendAuthPath(origin, path)
  } catch {
    return PRODUCTION_SITE_URL
  }
}
