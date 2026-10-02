import { supabase } from '../supabase'
import { normalizeStoryAnalyticsId } from './analyticsIdentity.js'

export { normalizeStoryAnalyticsId } from './analyticsIdentity.js'

const SESSION_KEY = 'hj_analytics_session_id'
const sentKeys = new Set()
const inFlightKeys = new Set()

function getAnonymousSessionId() {
  if (typeof window === 'undefined') return null
  try {
    const existing = window.localStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    const id = `hj_${randomPart}`
    window.localStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return null
  }
}

async function getAnalyticsIdentity() {
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data?.session?.user?.id || null
    return userId
      ? { user_id: userId, session_id: null }
      : { user_id: null, session_id: getAnonymousSessionId() }
  } catch {
    return { user_id: null, session_id: getAnonymousSessionId() }
  }
}

export async function trackUserActivity(eventType, payload = {}, dedupeKey = null) {
  if (!eventType) return false
  const key = dedupeKey ? `${eventType}:${dedupeKey}` : null
  if (key && (sentKeys.has(key) || inFlightKeys.has(key))) return false
  if (key) inFlightKeys.add(key)

  try {
    const identity = await getAnalyticsIdentity()
    if (!identity.user_id && !identity.session_id) return false

    const row = {
      ...identity,
      event_type: eventType,
      story_id: eventType === 'story_view'
        ? normalizeStoryAnalyticsId(payload.story_id)
        : (payload.story_id ?? null),
      episode_id: payload.episode_id ?? null,
      book_id: payload.book_id ?? null,
      video_story_id: payload.video_story_id ?? null,
      video_episode_id: payload.video_episode_id ?? null,
      access_type: payload.access_type ?? null,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    }

    const { error } = await supabase.from('user_activity').insert(row)
    if (error) {
      console.warn('[HJ GROUPS] Analytics event was not recorded:', error.message)
      return false
    }

    if (key) sentKeys.add(key)
    return true
  } catch (error) {
    console.warn('[HJ GROUPS] Analytics event failed safely:', error)
    return false
  } finally {
    if (key) inFlightKeys.delete(key)
  }
}

export const ANALYTICS_BATCH_SIZES = Object.freeze([10, 25, 50, 100])

export function getEpisodeAnalyticsBatch(episodes, startEpisodeId, batchSize = 10) {
  const rows = Array.isArray(episodes) ? episodes : []
  const startIndex = rows.findIndex((episode) => Number(episode?.id) === Number(startEpisodeId))
  if (startIndex < 0) return []
  const sizeValue = Number(batchSize)
  const size = ANALYTICS_BATCH_SIZES.includes(sizeValue) ? sizeValue : 10
  return rows.slice(startIndex, startIndex + size)
}

export function summarizeEpisodeAnalyticsBatch(rows) {
  const episodes = Array.isArray(rows) ? rows : []
  const sum = (key) => episodes.reduce((total, row) => total + Number(row?.[key] || 0), 0)
  return {
    episode_count: episodes.length,
    total_plays: sum('total_plays'),
    completed_plays: sum('completed_plays'),
    ad_unlock_starts: sum('ad_unlock_starts'),
    ad_unlock_completions: sum('ad_unlock_completions'),
    actual_unlocks: sum('actual_unlocks'),
    average_plays_per_episode: episodes.length ? sum('total_plays') / episodes.length : 0,
  }
}

export function getAnalyticsSessionId() {
  return getAnonymousSessionId()
}
