import { supabase } from '../supabase'

const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || 'http://localhost:3000'

export function fileUrlFromId(fileId, mediaType = 'audio') {
  if (!fileId) return ''
  if (!fileId.includes('.')) {
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

    list.push({
      number: ep.number || ep.episode_number,
      title: ep.title,
      type: mediaType,
      telegram_message_id: messageId || null,
      src: messageId
        ? `${STREAMING_SERVER_URL}/${mediaType}/message/${encodeURIComponent(messageId)}`
        : ((ep.audio_url && ep.audio_url.includes('example.com')) ? null : (ep.audio_url || fileUrlFromId(ep.file_id, mediaType) || null)),
      available: ep.available !== undefined ? ep.available : true,
      accessType: ep.access_type,
    })
    episodesByStory.set(ep.story_id, list)
  }

  return storyRows.map((story) => ({
    id: `tg-story-${story.id}`,
    title: story.title,
    genre: story.genre,
    cover: fileUrlFromId(story.cover_file_id, 'image'),
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
    cover: fileUrlFromId(book.cover_file_id, 'image'),
    file: fileUrlFromId(book.file_id, 'document'),
    accessType: book.access_type,
  }))
}

function normalizeVideoStories(videoStoryRows, videoEpisodeRows) {
  const episodesByVideo = new Map()

  for (const ep of videoEpisodeRows) {
    const list = episodesByVideo.get(ep.video_story_id) || []
    const messageId = ep.telegram_message_id

    list.push({
      number: ep.number,
      title: ep.title,
      type: 'video',
      telegram_message_id: messageId || null,
      src: messageId
        ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(messageId)}`
        : fileUrlFromId(ep.file_id, 'video'),
      available: ep.available !== false,
      accessType: ep.access_type,
    })
    episodesByVideo.set(ep.video_story_id, list)
  }

  return videoStoryRows.map((video) => ({
    id: `tg-video-${video.id}`,
    title: video.title,
    category: video.category,
    cover: fileUrlFromId(video.cover_file_id, 'image'),
    accessType: video.access_type,
    episodes: (episodesByVideo.get(video.id) || []).sort((a, b) => a.number - b.number),
  }))
}

export async function fetchTelegramContent() {
  const [stories, episodes, books, videoStories, videoEpisodes] = await Promise.all([
    supabase.from('stories').select('*'),
    supabase.from('episodes').select('*'),
    supabase.from('books').select('*'),
    supabase.from('video_stories').select('*'),
    supabase.from('video_episodes').select('*'),
  ])

  const firstError = stories.error || episodes.error || books.error || videoStories.error || videoEpisodes.error
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
