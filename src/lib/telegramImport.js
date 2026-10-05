import { supabase } from '../supabase'

const cleanText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

export const parseTelegramEpisodeNumber = (value) => {
  const text = cleanText(value)
  const match = text.match(/\b(?:EP|EPISODE)[\s._-]?(\d{1,6})\b/i)
  const number = match ? Number(match[1]) : NaN
  return Number.isInteger(number) && number > 0 ? number : null
}

const stripExtension = (value) =>
  cleanText(value).replace(/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|mp4|mov|mkv)$/i, '').trim()

export const buildTelegramMediaTitle = (message, fallbackNumber, fallbackKind = 'Episode') => {
  const caption = cleanText(message?.caption)
  if (caption) return caption

  const audioTitle = cleanText(message?.audioTitle)
  const performer = cleanText(message?.performer)
  if (audioTitle && performer) return performer + ' - ' + audioTitle
  if (audioTitle) return audioTitle

  const fileName = stripExtension(message?.fileName)
  if (fileName && !/^(?:audio|video|book)(?:\.\w+)?$/i.test(fileName)) return fileName

  const sourceNumber =
    parseTelegramEpisodeNumber(message?.fileName) ||
    parseTelegramEpisodeNumber(audioTitle) ||
    parseTelegramEpisodeNumber(message?.caption) ||
    (Number.isInteger(Number(fallbackNumber)) ? Number(fallbackNumber) : null)

  return sourceNumber ? `${fallbackKind} ${sourceNumber}` : `${fallbackKind}`
}

export const sortTelegramMessagesOldestFirst = (messages) =>
  [...(Array.isArray(messages) ? messages : [])].sort(
    (a, b) => Number(a?.messageId || 0) - Number(b?.messageId || 0)
  )

const getNumericId = (value, prefix) => {
  const raw = String(value || '')
  if (raw.startsWith(prefix)) {
    const parsed = Number(raw.slice(prefix.length))
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const chunk = (items, size) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function getFreshEpisodeImportState(storyId, messageIds = []) {
  const supabaseId = getNumericId(storyId, 'tg-story-')
  if (!supabaseId) {
    return { maxNumber: 0, existingMessageIds: new Set() }
  }

  const [numberResult, legacyNumberResult] = await Promise.all([
    supabase
      .from('episodes')
      .select('number')
      .eq('story_id', supabaseId)
      .not('number', 'is', null)
      .order('number', { ascending: false })
      .limit(1),
    supabase
      .from('episodes')
      .select('episode_number')
      .eq('story_id', supabaseId)
      .not('episode_number', 'is', null)
      .order('episode_number', { ascending: false })
      .limit(1),
  ])

  if (numberResult.error) throw numberResult.error
  if (legacyNumberResult.error) throw legacyNumberResult.error

  const maxNumber = Math.max(
    Number(numberResult.data?.[0]?.number) || 0,
    Number(legacyNumberResult.data?.[0]?.episode_number) || 0
  )

  const ids = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )]

  const existingMessageIds = new Set()
  for (const batch of chunk(ids, 100)) {
    const result = await supabase
      .from('episodes')
      .select('telegram_message_id')
      .eq('story_id', supabaseId)
      .in('telegram_message_id', batch)

    if (result.error) throw result.error
    for (const row of result.data || []) {
      const id = Number(row.telegram_message_id)
      if (Number.isInteger(id) && id > 0) existingMessageIds.add(id)
    }
  }

  return { maxNumber, existingMessageIds }
}

export async function getFreshVideoEpisodeImportState(videoStoryId, messageIds = []) {
  const supabaseId = getNumericId(videoStoryId, 'tg-video-')
  if (!supabaseId) {
    return { maxNumber: 0, existingMessageIds: new Set() }
  }

  const result = await supabase
    .from('video_episodes')
    .select('number')
    .eq('video_story_id', supabaseId)
    .not('number', 'is', null)
    .order('number', { ascending: false })
    .limit(1)

  if (result.error) throw result.error

  const ids = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )]

  const existingMessageIds = new Set()
  for (const batch of chunk(ids, 100)) {
    const query = await supabase
      .from('video_episodes')
      .select('telegram_message_id')
      .eq('video_story_id', supabaseId)
      .in('telegram_message_id', batch)

    if (query.error) throw query.error
    for (const row of query.data || []) {
      const id = Number(row.telegram_message_id)
      if (Number.isInteger(id) && id > 0) existingMessageIds.add(id)
    }
  }

  return {
    maxNumber: Number(result.data?.[0]?.number) || 0,
    existingMessageIds,
  }
}

export const getTelegramPagination = (response) => ({
  nextOffsetId: Number(response?.headers?.get('X-HJ-Telegram-Next-Offset') || 0) || null,
  hasMore: String(response?.headers?.get('X-HJ-Telegram-Has-More') || '').toLowerCase() === 'true',
})
