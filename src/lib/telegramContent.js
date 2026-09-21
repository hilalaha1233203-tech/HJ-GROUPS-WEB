import { supabase } from '../supabase'

// Fallback to empty string instead of localhost to prevent CORS errors
const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || 'https://hj-telegram-streaming-et8rjk1fb-ak-3a25.vercel.app'

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

    const src = messageId && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/${mediaType}/message/${encodeURIComponent(messageId)}`
      : ((ep.audio_url && ep.audio_url.includes('example.com')) ? null : (ep.audio_url || fileUrlFromId(ep.file_id, mediaType) || null))

    list.push({
      number: ep.number || ep.episode_number,
      title: ep.title,
      type: mediaType,
      telegram_message_id: messageId || null,
      src: ep.file_url || src,
      filePath: ep.file_path || '',
      available: ep.available !== undefined ? ep.available : true,
      accessType: ep.access_type,
    })
    episodesByStory.set(ep.story_id, list)
  }

  return storyRows.map((story) => ({
    id: `tg-story-${story.id}`,
    title: story.title,
    genre: story.genre,
    cover: story.cover_url || fileUrlFromId(story.cover_file_id, 'image'),
    coverPath: story.cover_path || '',
    description: story.description || '',
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
    cover: book.cover_url || fileUrlFromId(book.cover_file_id, 'image'),
    coverPath: book.cover_path || '',
    file: book.file_url || (book.telegram_message_id && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/document/message/${encodeURIComponent(book.telegram_message_id)}`
      : fileUrlFromId(book.file_id, 'document')),
    filePath: book.file_path || '',
    telegram_message_id: book.telegram_message_id || null,
    volumes: Array.isArray(book.volumes) ? book.volumes : [],
    accessType: book.access_type,
  }))
}

function normalizeVideoStories(videoStoryRows, videoEpisodeRows) {
  const episodesByVideo = new Map()

  for (const ep of videoEpisodeRows) {
    const list = episodesByVideo.get(ep.video_story_id) || []
    const messageId = ep.telegram_message_id

    const src = messageId && STREAMING_SERVER_URL
      ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(messageId)}`
      : fileUrlFromId(ep.file_id, 'video')

    list.push({
      number: ep.number,
      title: ep.title,
      type: 'video',
      telegram_message_id: messageId || null,
      src: ep.file_url || src,
      filePath: ep.file_path || '',
      available: ep.available !== false,
      accessType: ep.access_type,
    })
    episodesByVideo.set(ep.video_story_id, list)
  }

  return videoStoryRows.map((video) => ({
    id: `tg-video-${video.id}`,
    title: video.title,
    category: video.category,
    cover: video.cover_url || fileUrlFromId(video.cover_file_id, 'image'),
    coverPath: video.cover_path || '',
    telegram_message_id: video.telegram_message_id || null,
    accessType: video.access_type,
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

export function subscribeToTelegramContent(onChange) {
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
