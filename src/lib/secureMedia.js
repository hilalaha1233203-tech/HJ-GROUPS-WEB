import { resolveAccessType } from './accessControl'
import { isEpisodePreviewFree, loadCachedContentAccessSettings } from './contentAccessSettings'
import { supabase } from '../supabase'

const STREAMING_SERVER_URL = String(import.meta.env.VITE_STREAMING_SERVER_URL || '').trim().replace(/\/+$/, '')
const protectedTypes = new Set(['premium', 'vip', 'ads'])

const isProtected = (item) => {
  const types = resolveAccessType(item)
  // Mixed Premium/VIP + Ads content keeps the existing ad-unlock route.
  // Only content without an Ads fallback requires an authenticated secure
  // media ticket from the dedicated streaming service.
  return !types.includes('ads') && types.some((type) => protectedTypes.has(type))
}

const getContentId = (item, contentType) => {
  const numericId = Number(item?.id)
  if (Number.isInteger(numericId) && numericId > 0) return numericId

  const text = String(item?.id || '')
  const prefixes = contentType === 'book'
    ? ['tg-book-']
    : contentType === 'audio'
      ? ['tg-episode-']
      : ['tg-video-']
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      const parsed = Number(text.slice(prefix.length))
      if (Number.isInteger(parsed) && parsed > 0) return parsed
    }
  }
  return null
}

const getMessageId = (item) => {
  const value = Number(item?.telegram_message_id)
  return Number.isInteger(value) && value > 0 ? value : null
}

const requiresServerAdCheck = (item, previewFree = false) => {
  if (!item || previewFree) return false
  return resolveAccessType(item).includes('ads')
}

async function assertServerAccess(item, contentType, contentId, previewFree = false) {
  if (!requiresServerAdCheck(item, previewFree)) return

  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in to unlock this content.')

  const response = await fetch('/api/shortener/access', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({
      contentType,
      contentId,
    }),
    cache: 'no-store',
  })

  let payload = null
  try { payload = await response.json() } catch {}

  if (!response.ok) {
    throw new Error(
      String(
        payload?.error ||
        (response.status === 403 ? 'Temporary or paid access required.' : 'Unable to verify content access.')
      )
    )
  }
}

export async function resolveMediaSource(item) {
  if (!item) throw new Error('Content is unavailable.')

  const messageId = getMessageId(item)
  const type = item.type === 'video' ? 'video' : 'audio'
  const previewSettings = loadCachedContentAccessSettings()
  const previewFree = isEpisodePreviewFree(item, previewSettings)

  // Never return a fallback source for protected Ads content until the server
  // verifies the current user's temporary/paid entitlement.
  const contentId = getContentId(item, type)
  if (resolveAccessType(item).includes('ads') && !contentId && !previewFree) {
    throw new Error('Protected audio/video is missing its database content ID.')
  }
  await assertServerAccess(item, type, contentId, previewFree)

  if (isProtected(item) && (!messageId || !STREAMING_SERVER_URL)) {
    throw new Error('Protected media is not available through a secure streaming source.')
  }

  if (!messageId || !STREAMING_SERVER_URL) return String(item.src || '')

  if (previewFree) {
    return `${STREAMING_SERVER_URL}/${type}/message/${encodeURIComponent(messageId)}`
  }

  if (!isProtected(item)) {
    return `${STREAMING_SERVER_URL}/${type}/message/${encodeURIComponent(messageId)}`
  }

  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in to access premium content.')

  const response = await fetch(
    `${STREAMING_SERVER_URL}/media-ticket/${type}/message/${encodeURIComponent(messageId)}`,
    {
      headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' },
      cache: 'no-store',
    }
  )
  let payload = null
  try { payload = await response.json() } catch {}
  if (!response.ok) throw new Error(String(payload?.error || `Media access denied (${response.status})`))
  const url = String(payload?.url || '').trim()
  if (!url) throw new Error('Secure media URL was not returned.')
  return url
}

export async function resolveBookSource(book) {
  if (!book) throw new Error('Book is unavailable.')

  const messageId = getMessageId(book)
  const isProtectedBook = isProtected(book)
  const contentId = getContentId(book, 'book')
  if (isProtectedBook && !contentId) {
    throw new Error('Protected book is missing its database content ID.')
  }
  await assertServerAccess(book, 'book', contentId, false)

  if (isProtectedBook && (!messageId || !STREAMING_SERVER_URL)) {
    throw new Error('Protected books are not available through a secure streaming source.')
  }

  if (!messageId || !STREAMING_SERVER_URL) return String(book.file || '')
  if (!isProtectedBook) return `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(messageId)}`

  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in to access premium books.')

  const response = await fetch(
    `${STREAMING_SERVER_URL}/media-ticket/document/message/${encodeURIComponent(messageId)}`,
    {
      headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' },
      cache: 'no-store',
    }
  )
  let payload = null
  try { payload = await response.json() } catch {}
  if (!response.ok) throw new Error(String(payload?.error || `Book access denied (${response.status})`))
  const url = String(payload?.url || '').trim()
  if (!url) throw new Error('Secure book URL was not returned.')
  return url
}

export { isProtected }
