export const ACCESS_TYPES = ['free', 'vip', 'premium', 'ads']

export function resolveAccessType(item) {
  if (!item) return ['free']
  
  if (Array.isArray(item.accessType)) {
    const valid = item.accessType.filter(t => ACCESS_TYPES.includes(t))
    return valid.length > 0 ? valid : ['free']
  }
  
  if (item.accessType && ACCESS_TYPES.includes(item.accessType)) {
    return [item.accessType]
  }
  
  // backward compatibility with the old boolean `premium` flag
  return item.premium ? ['premium'] : ['free']
}

export function accessLabel(item, { isAdmin } = {}) {
  if (isAdmin) return '👑 Admin VIP'
  const types = resolveAccessType(item)
  
  const labels = types.map(type => {
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

export function canAccess(item, { isAdmin, unlockedAds, adsKey, purchasedStoryIds }) {
  if (!item) return false
  if (isAdmin) return true
  if (item.available === false) return false

  const types = resolveAccessType(item)

  if (types.includes('free')) return true
  if (types.includes('ads') && adsKey && unlockedAds.has(adsKey)) return true
  
  if ((types.includes('vip') || types.includes('premium')) && purchasedStoryIds) {
    if (purchasedStoryIds.has(String(item.id)) || purchasedStoryIds.has(Number(item.id))) {
      return true
    }
  }

  // vip / premium: no subscription system exists yet outside the admin
  // account — keep the pre-existing behavior (locked for normal users).
  return false
}
