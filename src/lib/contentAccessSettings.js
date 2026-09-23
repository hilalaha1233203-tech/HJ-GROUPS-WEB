import { resolveAccessType } from './accessControl'

export const CONTENT_ACCESS_SETTINGS_KEY = 'hj_content_access_settings_v1'

export const DEFAULT_CONTENT_ACCESS_SETTINGS = Object.freeze({
  freeAudioEpisodes: 10,
  freeVideoEpisodes: 10,
  freeBookPages: 50,
})

const clampInt = (value, min, max, fallback) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.floor(numeric)))
}

export function normalizeContentAccessSettings(content = {}) {
  const legacy = content?.firstEpisodesFree
  return {
    freeAudioEpisodes: clampInt(content?.freeAudioEpisodes ?? legacy, 0, 100, DEFAULT_CONTENT_ACCESS_SETTINGS.freeAudioEpisodes),
    freeVideoEpisodes: clampInt(content?.freeVideoEpisodes ?? legacy, 0, 100, DEFAULT_CONTENT_ACCESS_SETTINGS.freeVideoEpisodes),
    freeBookPages: clampInt(content?.freeBookPages, 0, 500, DEFAULT_CONTENT_ACCESS_SETTINGS.freeBookPages),
  }
}

export function loadCachedContentAccessSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_CONTENT_ACCESS_SETTINGS }
  try {
    return normalizeContentAccessSettings(JSON.parse(localStorage.getItem(CONTENT_ACCESS_SETTINGS_KEY) || '{}'))
  } catch {
    return { ...DEFAULT_CONTENT_ACCESS_SETTINGS }
  }
}

export function isEpisodePreviewFree(item, settings = DEFAULT_CONTENT_ACCESS_SETTINGS) {
  if (!item) return false
  const types = resolveAccessType(item)
  if (!types.some((type) => ['vip', 'premium', 'ads'].includes(type))) return false
  const kind = String(item.type || '').toLowerCase() === 'video' ? 'video' : 'audio'
  const limit = Number(kind === 'video' ? settings?.freeVideoEpisodes : settings?.freeAudioEpisodes) || 0
  const number = Number(item.number ?? item.episode_number)
  return limit > 0 && Number.isFinite(number) && number >= 1 && number <= limit
}

export function isBookPreviewPageFree(pageNumber, book, settings = DEFAULT_CONTENT_ACCESS_SETTINGS) {
  if (!book) return false
  const types = resolveAccessType(book)
  if (!types.some((type) => ['vip', 'premium', 'ads'].includes(type))) return false
  const limit = Number(settings?.freeBookPages) || 0
  const page = Number(pageNumber)
  return limit > 0 && Number.isFinite(page) && page >= 1 && page <= limit
}
