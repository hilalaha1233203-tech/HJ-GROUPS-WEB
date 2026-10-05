import { supabase } from '../supabase'

// The streaming service is deployed separately. Use its stable Vercel project URL
// instead of pinning the website to an immutable deployment URL.
import { STREAMING_SERVER_URL } from './streamingUrl'
import { normalizeContentStatus } from './contentStatus.js'

export function fileUrlFromId(fileId, mediaType = 'audio') {
  if (!fileId) return ''
  if (!fileId.includes('.')) {
    if (!STREAMING_SERVER_URL) return '' // Return empty if no server URL configured
    const route = mediaType === 'video' ? 'video' : 'audio'
    return `${STREAMING_SERVER_URL}/${route}/${encodeURIComponent(fileId)}`
  }

  const { data } = supabase.storage.from('telegram_files').getPublicUrl(fileId)
  return data.publicUrl
}

function normalizeStories(storyRows, episodeRows) {
  const episodesByStory = new Map()

  for (const ep of episodeRows) {
    const list = episodesByStory.get(ep.story_id) || []
    const messageId = ep.telegram_message_id
    const mediaType = ep.type === 'video' ? 'video' : 'audio'
    const importKey = String(ep.telegram_import_key || '').trim()
    const canonicalImportKey = messageId
      ? String(ep.story_id) + ':' + String(messageId)
      : ''
    const isTelegramDuplicate = Boolean(
      messageId &&
      importKey &&
      canonicalImportKey &&
      importKey !== canonicalImportKey
    )

    const src = messageId && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/${mediaType}/message/${encodeURIComponent(messageId)}`
      : ((ep.audio_url && ep.audio_url.includes('example.com')) ? null : (ep.audio_url || fileUrlFromId(ep.file_id, mediaType) || null))

    list.push({
      id: ep.id,
      number: ep.number || ep.episode_number,
      title: ep.title,
      type: mediaType,
      telegram_message_id: messageId || null,
      isTelegramDuplicate,
      src: ep.file_url || src,
      filePath: ep.file_path || '',
      language: ep.language || 'Tamil',
      available: ep.available !== undefined ? ep.available : true,
      accessType: ep.access_type,
      created_at: ep.created_at || null,
    })
    episodesByStory.set(ep.story_id, list)
  }

  return storyRows.map((story) => ({
    id: `tg-story-${story.id}`,
    title: story.title,
    genre: story.genre,
    language: story.language || 'Tamil',
    cover: story.cover_url || fileUrlFromId(story.cover_file_id, 'image'),
    coverPath: story.cover_path || '',
    description: story.description || '',
    accessType: story.access_type,
    status: normalizeContentStatus(story.status),
    episodes: (episodesByStory.get(story.id) || []).sort((a, b) => a.number - b.number),
  }))
}

function normalizeBooks(bookRows) {
  return bookRows.map((book) => ({
    id: `tg-book-${book.id}`,
    title: book.title,
    author: book.author || '',
    description: book.description || '',
    type: book.type,
    category: book.category,
    language: book.language || 'Tamil',
    cover: book.cover_url || fileUrlFromId(book.cover_file_id, 'image'),
    coverPath: book.cover_path || '',
    file: book.file_url || (book.telegram_message_id && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(book.telegram_message_id)}`
      : (String(book.file_id || '').startsWith('tg-document:')
        ? `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(String(book.file_id).slice('tg-document:'.length))}`
        : fileUrlFromId(book.file_id, 'document'))),
    filePath: book.file_path || '',
    telegram_message_id: book.telegram_message_id || null,
    volumes: Array.isArray(book.volumes) ? book.volumes : [],
    accessType: book.access_type,
    status: normalizeContentStatus(book.status),
  }))
}

function normalizeVideoStories(videoStoryRows, videoEpisodeRows) {
  const episodesByVideo = new Map()

  for (const ep of videoEpisodeRows) {
    const list = episodesByVideo.get(ep.video_story_id) || []
    const messageId = ep.telegram_message_id

    const src = messageId && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(messageId)}`
      : (String(ep.file_id || '').startsWith('tg-video:')
        ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(String(ep.file_id).slice('tg-video:'.length))}`
        : fileUrlFromId(ep.file_id, 'video'))

    list.push({
      id: ep.id,
      number: ep.number,
      title: ep.title,
      type: 'video',
      telegram_message_id: messageId || null,
      src: ep.file_url || src,
      filePath: ep.file_path || '',
      language: ep.language || 'Tamil',
      available: ep.available !== false,
      accessType: ep.access_type,
    })
    episodesByVideo.set(ep.video_story_id, list)
  }

  return videoStoryRows.map((video) => ({
    id: `tg-video-${video.id}`,
    title: video.title,
    category: video.category,
    language: video.language || 'Tamil',
    cover: video.cover_url || fileUrlFromId(video.cover_file_id, 'image'),
    coverPath: video.cover_path || '',
    telegram_message_id: video.telegram_message_id || null,
    accessType: video.access_type,
    status: normalizeContentStatus(video.status),
    episodes: (episodesByVideo.get(video.id) || []).sort((a, b) => a.number - b.number),
  }))
}

async function selectOptional(table) {
  const result = await supabase.from(table).select('*')
  if (result.error) {
    const message = String(result.error.message || '')
    if (/could not find the table|schema cache|relation .* does not exist/i.test(message)) {
      console.warn(`Optional content table "${table}" is not available yet:`, message)
      return { data: [], error: null, missing: true }
    }
  }
  return result
}

export async function fetchTelegramContent() {
  // Audio stories/episodes are the core catalogue. Books/videos are optional
  // until their production tables have been created.
  const [stories, episodes, books, videoStories, videoEpisodes] = await Promise.all([
    supabase.from('stories').select('*'),
    supabase.from('episodes').select('*'),
    selectOptional('books'),
    selectOptional('video_stories'),
    selectOptional('video_episodes'),
  ])

  const firstError = stories.error || episodes.error
  if (firstError) throw firstError

  return {
    stories: normalizeStories(stories.data || [], episodes.data || []),
    books: normalizeBooks(books.data || []),
    videoStories: normalizeVideoStories(videoStories.data || [], videoEpisodes.data || []),
  }
}

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1'])
const LOCAL_CONTENT_POLL_MS = 30_000

export function subscribeToTelegramContent(onChange) {
  // Local development frequently runs behind restrictive firewalls/proxies
  // that block WebSockets. Keep production Realtime unchanged, but use a
  // lightweight polling fallback locally so the app stays live without a
  // noisy browser WebSocket failure.
  const hostname = typeof window !== 'undefined' ? String(window.location.hostname || '') : ''
  if (LOCAL_DEV_HOSTS.has(hostname)) {
    const timer = window.setInterval(() => {
      Promise.resolve(onChange?.()).catch(() => {})
    }, LOCAL_CONTENT_POLL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }

  const channel = supabase
    .channel('hj-groups-content')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'episodes' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_stories' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_episodes' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
