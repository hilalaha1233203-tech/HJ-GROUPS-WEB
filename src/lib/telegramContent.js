import { supabase } from '../supabase'

/*
  Bridges the Telegram-ingested Supabase tables (stories, episodes,
  books, video_stories, video_episodes) into the exact same shape
  App.jsx already uses for its seed/localStorage content:

    story  = { id, title, genre, cover, description, episodes: [...] }
    episode = { number, title, type, src, available, accessType }
    book   = { id, title, author, description, type, category, cover, file, accessType }
    videoStory = { id, title, category, cover, accessType, episodes: [...] }

  `cover` / `src` / `file` are turned into URLs pointing at our own
  telegram-file Edge Function (never at Telegram directly), built
  from the stored file_id.
*/

export function fileUrlFromId(fileId) {
  if (!fileId) return ''
  // Backwards compatibility for testing: if it looks like a Telegram file_id (no dot), use proxy
  if (!fileId.includes('.')) {
    const FUNCTIONS_URL = 'http://localhost:3000/audio';
    return `${FUNCTIONS_URL}/${encodeURIComponent(fileId)}`;
  }
  
  // Otherwise, it's a Supabase storage path from our new architecture
  const { data } = supabase.storage.from('telegram_files').getPublicUrl(fileId)
  return data.publicUrl
}

function normalizeStories(storyRows, episodeRows) {
  const episodesByStory = new Map()

  for (const ep of episodeRows) {
    const list = episodesByStory.get(ep.story_id) || []
    
    let messageId = ep.telegram_message_id;

    const normalizedEpisode = {
      number: ep.number || ep.episode_number,
      title: ep.title,
      type: ep.type || "audio",
      src: messageId 
        ? `http://localhost:3000/audio/message/${messageId}` 
        : ((ep.audio_url && ep.audio_url.includes('example.com')) ? null : (ep.audio_url || fileUrlFromId(ep.file_id) || null)),
      available: ep.available !== undefined ? ep.available : true,
      accessType: ep.access_type,
    };
    console.log("RAW EPISODE", ep);
    console.log("NORMALIZED EPISODE", normalizedEpisode);
    list.push(normalizedEpisode);
    episodesByStory.set(ep.story_id, list)
  }

  return storyRows.map((story) => ({
    id: `tg-story-${story.id}`,
    title: story.title,
    genre: story.genre,
    cover: fileUrlFromId(story.cover_file_id),
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
    cover: fileUrlFromId(book.cover_file_id),
    file: fileUrlFromId(book.file_id),
    accessType: book.access_type,
  }))
}

function normalizeVideoStories(videoStoryRows, videoEpisodeRows) {
  const episodesByVideo = new Map()

  for (const ep of videoEpisodeRows) {
    const list = episodesByVideo.get(ep.video_story_id) || []
    list.push({
      number: ep.number,
      title: ep.title,
      type: 'video',
      src: fileUrlFromId(ep.file_id),
      available: ep.available,
      accessType: ep.access_type,
    })
    episodesByVideo.set(ep.video_story_id, list)
  }

  return videoStoryRows.map((video) => ({
    id: `tg-video-${video.id}`,
    title: video.title,
    category: video.category,
    cover: fileUrlFromId(video.cover_file_id),
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

  console.log("STORIES QUERY RESULT", stories);
  console.log("EPISODES QUERY RESULT", episodes);

  const firstError = stories.error || episodes.error;

  if (firstError) {
    throw firstError;
  }

  const normalizedStories = normalizeStories(stories.data || [], episodes.data || []);
  console.log("NORMALIZED STORIES", normalizedStories);

  return {
    stories: normalizedStories,
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
