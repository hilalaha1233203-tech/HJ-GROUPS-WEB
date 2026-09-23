import { resolveAccessType } from './accessControl'
import { supabase } from '../supabase'

const STREAMING_SERVER_URL = String(import.meta.env.VITE_STREAMING_SERVER_URL || '').trim().replace(/\/+$/, '')
const protectedTypes = new Set(['premium', 'vip'])

const isProtected = (item) => {
  const types = resolveAccessType(item)
  return !types.includes('free') && !types.includes('ads') && types.some((type) => protectedTypes.has(type))
}

const getMessageId = (item) => {
  const value = Number(item?.telegram_message_id)
  return Number.isInteger(value) && value > 0 ? value : null
}

export async function resolveMediaSource(item) {
  if (!item) throw new Error('Content is unavailable.')
  const messageId = getMessageId(item)
  if (!messageId || !STREAMING_SERVER_URL) return String(item.src || '')

  const type = item.type === 'video' ? 'video' : 'audio'
  if (!isProtected(item)) {
    return `${STREAMING_SERVER_URL}/${type}/message/${encodeURIComponent(messageId)}`
  }

  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in to access premium content.')

  const response = await fetch(
    `${STREAMING_SERVER_URL}/media-ticket/${type}/message/${encodeURIComponent(messageId)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' },
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
  if (!messageId || !STREAMING_SERVER_URL) return String(book.file || '')

  const isProtectedBook = isProtected(book)
  if (!isProtectedBook) return `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(messageId)}`

  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in to access premium books.')

  const response = await fetch(
    `${STREAMING_SERVER_URL}/media-ticket/document/message/${encodeURIComponent(messageId)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' },
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