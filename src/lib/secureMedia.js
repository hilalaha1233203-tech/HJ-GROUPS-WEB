import { resolveAccessType } from './accessControl'
import { isEpisodePreviewFree, isBookPreviewPageFree, loadCachedContentAccessSettings } from './contentAccessSettings'
import { supabase } from '../supabase'

const STREAMING_SERVER_URL = String(import.meta.env.VITE_STREAMING_SERVER_URL || '').trim().replace(/\/+$/, '')
const protectedTypes = new Set(['premium', 'vip'])

const isProtected = (item) => {
  const types = resolveAccessType(item)
  // Mixed Premium/VIP + Ads content keeps the existing ad-unlock route.
  // Only content without an Ads fallback requires an authenticated secure
  // media ticket from the dedicated streaming service.
  return !types.includes('ads') && types.some((type) => protectedTypes.has(type))
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

  // Never return a fallback source for Ads content until the server verifies
  // the current user's temporary/paid entitlement.
  await assertServerAccess(item, type, item.id, previewFree)

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
  const contentSettings = loadCachedContentAccessSettings()
  const previewFreePages = Number(contentSettings.freeBookPages) || 0

  // Preserve the existing free-book-pages preview rule: page 1 is allowed
  // without an entitlement when a book has a configured free-page preview.
  // The reader gates every later page through requestBookPageAccess().
  // A dedicated partial-document route is still required for strong server
  // enforcement without exposing the whole PDF to the browser.
  const previewPageIsFree = isBookPreviewPageFree(1, book, contentSettings)
  await assertServerAccess(book, 'book', book.id, previewPageIsFree)

  if (isProtectedBook && (!messageId || !STREAMING_SERVER_URL)) {
    throw new Error('Protected books are not available through a secure streaming source.')
  }

  if (!messageId || !STREAMING_SERVER_URL) return String(book.file || '')
  if (!isProtectedBook) return `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(messageId)}`

  if (previewFreePages > 0) {
    // Preserve the current reader implementation; page-level gating remains
    // client-side until the streaming service supports document-aware slicing.
    return `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(messageId)}`
  }

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
