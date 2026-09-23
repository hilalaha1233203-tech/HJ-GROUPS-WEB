export const ACCESS_TYPES = ['free', 'vip', 'premium', 'ads']

export function resolveAccessType(item) {
  if (!item) return ['free']

  const rawAccessType = item.accessType
  if (Array.isArray(rawAccessType)) {
    const valid = rawAccessType.filter((t) => ACCESS_TYPES.includes(t))
    return valid.length > 0 ? valid : ['free']
  }

  // Production currently stores access_type as text. Accept JSON arrays so
  // one episode/book/video can retain multiple access modes without requiring
  // a database type migration.
  if (typeof rawAccessType === 'string') {
    const text = rawAccessType.trim()
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((t) => ACCESS_TYPES.includes(t))
          return valid.length > 0 ? valid : ['free']
        }
      } catch {}
    }
  }

  if (Array.isArray(item.accessType)) {
    const valid = item.accessType.filter((t) => ACCESS_TYPES.includes(t))
    return valid.length > 0 ? valid : ['free']
  }

  if (item.accessType && ACCESS_TYPES.includes(item.accessType)) {
    return [item.accessType]
  }

  // Backward compatibility with the old boolean `premium` flag.
  return item.premium ? ['premium'] : ['free']
}

export function accessLabel(item, { isAdmin } = {}) {
  if (isAdmin) return '👑 Admin VIP'
  const types = resolveAccessType(item)

  const labels = types.map((type) => {
    if (type === 'vip') return '⭐ VIP'
    if (type === 'premium') return '👑 Premium'
    if (type === 'ads') return '📺 Watch Ad'
    return 'Free'
  })

  return [...new Set(labels)].join(' + ')
}

const AD_UNLOCKS_KEY = 'hj_ads_unlocked'
const AD_UNLOCK_EXPIRIES_KEY = 'hj_ads_unlock_expiries_v1'

function readAdUnlockExpiries() {
  try {
    const raw = JSON.parse(localStorage.getItem(AD_UNLOCK_EXPIRIES_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeAdUnlockExpiries(expiries) {
  localStorage.setItem(AD_UNLOCK_EXPIRIES_KEY, JSON.stringify(expiries))
}

function cleanupAdUnlockExpiries() {
  const now = Date.now()
  const expiries = readAdUnlockExpiries()
  const active = new Set()

  for (const [key, expiry] of Object.entries(expiries)) {
    const timestamp = Number(expiry)
    if (Number.isFinite(timestamp) && timestamp > now) {
      active.add(key)
    } else {
      delete expiries[key]
    }
  }

  writeAdUnlockExpiries(expiries)
  localStorage.setItem(AD_UNLOCKS_KEY, JSON.stringify([...active]))
  return active
}

export function loadUnlockedAds() {
  if (typeof window === 'undefined') return new Set()
  try {
    // Legacy Set-only grants had no expiry. Treat them as expired on migration
    // rather than accidentally preserving indefinite Premium access.
    return cleanupAdUnlockExpiries()
  } catch {
    return new Set()
  }
}

export function saveUnlockedAd(key, durationMinutes = 360) {
  if (!key || typeof window === 'undefined') return null
  const duration = Math.min(1440, Math.max(1, Number(durationMinutes) || 360))
  const expiresAt = Date.now() + duration * 60 * 1000
  const expiries = readAdUnlockExpiries()
  expiries[String(key)] = expiresAt
  writeAdUnlockExpiries(expiries)
  localStorage.setItem(
    AD_UNLOCKS_KEY,
    JSON.stringify(
      Object.entries(expiries)
        .filter(([, expiry]) => Number(expiry) > Date.now())
        .map(([unlockKey]) => unlockKey)
    )
  )
  return expiresAt
}

export function hasActiveAdUnlock(key) {
  if (!key || typeof window === 'undefined') return false
  const expiries = readAdUnlockExpiries()
  const expiry = Number(expiries[String(key)])
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    if (Object.prototype.hasOwnProperty.call(expiries, String(key))) {
      delete expiries[String(key)]
      writeAdUnlockExpiries(expiries)
      localStorage.setItem(
        AD_UNLOCKS_KEY,
        JSON.stringify(Object.entries(expiries).filter(([, value]) => Number(value) > Date.now()).map(([unlockKey]) => unlockKey))
      )
    }
    return false
  }
  return true
}

export function saveUnlockedAds(set) {
  // Backward-compatible API: preserve the caller's set but do not create
  // indefinite access. Existing callers should migrate to saveUnlockedAd().
  const active = new Set([...set].filter((key) => hasActiveAdUnlock(key)))
  localStorage.setItem(AD_UNLOCKS_KEY, JSON.stringify([...active]))
}

export function adsKeyFor(kind, ...ids) {
  return `${kind}:${ids.join(':')}`
}

export function canAccess(
  item,
  { isAdmin, loggedIn = false, unlockedAds, adsKey, purchasedStoryIds, storyId } = {}
) {
  if (!item) return false
  if (isAdmin) return true
  if (item.available === false) return false

  const types = resolveAccessType(item)
  const requiresPurchase =
    types.includes('vip') ||
    types.includes('premium')

  // Ads is an explicit alternate access path. For mixed items such as
  // ["premium", "ads"], a valid ad unlock must grant access even when the
  // visitor is logged out.
  if (types.includes('ads') && adsKey && hasActiveAdUnlock(adsKey)) {
    return true
  }

  if (requiresPurchase) {
    if (!loggedIn) return false
    if (!purchasedStoryIds || purchasedStoryIds.size === 0) return false

    const candidates = [
      storyId,
      item.story_id,
      item.storyId,
      item.id,
    ].filter((value) => value !== undefined && value !== null && value !== '')

    for (const candidate of candidates) {
      const text = String(candidate)
      const numeric = Number(candidate)
      if (
        purchasedStoryIds.has(text) ||
        (Number.isFinite(numeric) && purchasedStoryIds.has(String(numeric)))
      ) {
        return true
      }
    }

    return false
  }

  if (types.includes('ads')) {
    return Boolean(adsKey && hasActiveAdUnlock(adsKey))
  }

  if (types.includes('free')) return true

  return false
}
