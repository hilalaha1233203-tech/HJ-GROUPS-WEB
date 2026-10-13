import { supabase } from '../supabase'

// The streaming service is deployed separately on Cloudflare Workers.
import { STREAMING_SERVER_URL } from './streamingUrl'
import { normalizeContentStatus } from './contentStatus.js'
import { fetchPublicCatalog } from './publicCatalogClient.js'
import { resolveAudioEpisodeUrl } from './audioUrlPolicy.js'

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

    const streamUrl = messageId && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/${mediaType}/message/${encodeURIComponent(messageId)}`
      : ''
    const storedAudioUrl = ep.audio_url && ep.audio_url.includes('example.com') ? null : ep.audio_url
    const fallbackUrl = fileUrlFromId(ep.file_id, mediaType) || null
    const src = mediaType === 'audio'
      ? resolveAudioEpisodeUrl({
        streamUrl,
        fileUrl: ep.file_url,
        audioUrl: storedAudioUrl,
        fallbackUrl,
      })
      : (streamUrl || storedAudioUrl || fallbackUrl)

    list.push({
      id: ep.id,
      number: ep.number || ep.episode_number,
      title: ep.title,
      type: mediaType,
      telegram_message_id: messageId || null,
      isTelegramDuplicate,
      src: mediaType === 'audio' ? src : (ep.file_url || src),
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


export async function fetchTelegramContent() {
  const payload = await fetchPublicCatalog()
  return {
    stories: normalizeStories(payload.stories || [], payload.episodes || []),
    books: normalizeBooks(payload.books || []),
    videoStories: normalizeVideoStories(payload.videoStories || [], payload.videoEpisodes || []),
  }
}

// Kept as a compatibility no-op; public catalog updates occur on page refresh.
export function subscribeToTelegramContent() {
  return () => {}
}
