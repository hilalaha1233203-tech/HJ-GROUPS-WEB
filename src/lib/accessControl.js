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

export function loadUnlockedAds() {
  try {
    const raw = localStorage.getItem('hj_ads_unlocked')
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function saveUnlockedAds(set) {
  localStorage.setItem('hj_ads_unlocked', JSON.stringify([...set]))
}

export function adsKeyFor(kind, ...ids) {
  return `${kind}:${ids.join(':')}`
}

export function canAccess(
  item,
  { isAdmin, unlockedAds, adsKey, purchasedStoryIds, storyId } = {}
) {
  if (!item) return false
  if (isAdmin) return true
  if (item.available === false) return false

  const types = resolveAccessType(item)
  const requiresPurchase =
    types.includes('vip') ||
    types.includes('premium')

  // A paid access type always takes precedence over a legacy/accidental
  // "free" flag. Otherwise an item such as ["free","premium"] could be
  // opened by a logged-out visitor and bypass the intended gate.
  if (requiresPurchase) {
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

    // Premium/VIP can coexist with an ads access mode, but the presence of
    // the paid type means the normal free path must never unlock it.
    if (types.includes('ads') && adsKey && unlockedAds?.has(adsKey)) {
      return true
    }

    return false
  }

  if (types.includes('ads')) {
    return Boolean(adsKey && unlockedAds?.has(adsKey))
  }

  if (types.includes('free')) return true

  return false
}
