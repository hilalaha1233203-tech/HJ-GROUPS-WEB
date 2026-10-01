export const PASSWORD_RESET_PATH = '/reset-password'

const AUTH_QUERY_KEYS = [
  'code',
  'type',
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'error',
  'error_code',
  'error_description',
]

export function getAuthRecoveryParams(location = window.location) {
  const search = new URLSearchParams(String(location?.search || ''))
  const hash = new URLSearchParams(String(location?.hash || '').replace(/^#/, ''))
  const read = (key) => hash.get(key) ?? search.get(key)

  const pathname = String(location?.pathname || '')
    .replace(/\/+$/, '') || '/'

  const authType = read('type')
  const accessToken = read('access_token')
  const refreshToken = read('refresh_token')
  const code = search.get('code')
  const authError = read('error')
  const authErrorCode = read('error_code')
  const authErrorDescription = read('error_description')

  const isResetPath = pathname === PASSWORD_RESET_PATH
  const hasRecoveryCallback = isResetPath && Boolean(
    code ||
    accessToken ||
    refreshToken ||
    authError ||
    authErrorCode ||
    authErrorDescription
  )
  const isRecoveryFlow = authType === 'recovery' || hasRecoveryCallback

  return {
    pathname,
    isResetPath,
    isRecoveryFlow,
    authType,
    accessToken,
    refreshToken,
    code,
    authError,
    authErrorCode,
    authErrorDescription,
  }
}

export function cleanAuthCallbackUrl({ preserveSearch = true, path = null } = {}) {
  if (typeof window === 'undefined') return '/'

  const url = new URL(window.location.href)
  AUTH_QUERY_KEYS.forEach((key) => url.searchParams.delete(key))
  url.hash = ''

  if (path) {
    url.pathname = path
  }

  return url.pathname + (
    preserveSearch && url.searchParams.toString()
      ? '?' + url.searchParams.toString()
      : ''
  )
}
