export const SHORTENER_PROVIDERS = Object.freeze([
  { value: 'arolinks', label: 'AroLinks' },
  { value: 'earn4link', label: 'Earn4Link' },
])

export const SHORTENER_PROVIDER_VALUES = new Set(
  SHORTENER_PROVIDERS.map((provider) => provider.value)
)

export const DEFAULT_SHORTENER_SETTINGS = Object.freeze({
  primaryProvider: 'arolinks',
  fallbackProvider: 'earn4link',
  enabled: false,
})

export function normalizeShortenerProvider(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'none') return ''
  return SHORTENER_PROVIDER_VALUES.has(normalized) ? normalized : fallback
}

export function normalizeShortenerSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const primaryProvider = normalizeShortenerProvider(
    source.primaryProvider,
    DEFAULT_SHORTENER_SETTINGS.primaryProvider
  )
  let fallbackProvider = normalizeShortenerProvider(
    source.fallbackProvider,
    DEFAULT_SHORTENER_SETTINGS.fallbackProvider
  )

  if (fallbackProvider && fallbackProvider === primaryProvider) {
    fallbackProvider = ''
  }

  return {
    ...DEFAULT_SHORTENER_SETTINGS,
    ...source,
    primaryProvider,
    fallbackProvider,
    enabled: source.enabled === true || source.shortenerEnabled === true,
    shortenerEnabled: source.shortenerEnabled === true || source.enabled === true,
  }
}

export function getShortenerProviderLabel(value) {
  const normalized = normalizeShortenerProvider(value)
  return SHORTENER_PROVIDERS.find((provider) => provider.value === normalized)?.label || 'None'
}

export function getShortenerProviderOrder(settings = {}) {
  const normalized = normalizeShortenerSettings(settings)
  return [normalized.primaryProvider, normalized.fallbackProvider].filter(Boolean)
}

export function getShortenerProviderHint(settings = {}) {
  const order = getShortenerProviderOrder(settings)
  return order.length
    ? order.map(getShortenerProviderLabel).join(' → ')
    : 'No shortener configured'
}
