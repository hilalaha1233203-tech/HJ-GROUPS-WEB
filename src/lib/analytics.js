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
    const session = data?.session
    const userId = session?.user?.id || null
    const isAdmin = String(session?.user?.app_metadata?.role || '').toLowerCase() === 'admin'
    return userId
      ? { user_id: userId, session_id: null, is_admin: isAdmin }
      : { user_id: null, session_id: getAnonymousSessionId(), is_admin: false }
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
    if (identity.is_admin) return false
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

export function getAnalyticsSessionId() {
  return getAnonymousSessionId()
}

export async function linkAnalyticsSessionToUser() {
  const sessionId = getAnonymousSessionId()
  if (!sessionId) return false

  try {
    const { data: { session } = {} } = await supabase.auth.getSession()
    if (!session?.user?.id) return false

    const { data, error } = await supabase.rpc('link_analytics_session', {
      p_session_id: sessionId,
    })

    if (error) {
      console.warn('[HJ GROUPS] Analytics session link failed safely:', error.message)
      return false
    }

    return data === true
  } catch (error) {
    console.warn('[HJ GROUPS] Analytics session link failed safely:', error)
    return false
  }
}
