from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Could not locate {label}')
    return text.replace(old, new, 1)


app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')
s = s.replace(
    "const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || STREAMING_SERVER_URL;",
    "const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || 'http://localhost:3000';",
    1,
)

start = s.find('  const persistStories = (list) =>')
end = s.find('  const persistBooks = (list) =>', start)
if start == -1 or end == -1:
    raise SystemExit('Could not locate story persistence block')

replacement = '''  const persistStories = (list) => {
    setAdminStories(list)
    saveList('hj_admin_stories', list)
  }

  const getSupabaseStoryId = (storyId) => {
    if (typeof storyId === 'number' && Number.isFinite(storyId)) return storyId
    const text = String(storyId || '')
    if (text.startsWith('tg-story-')) {
      const id = Number(text.slice('tg-story-'.length))
      return Number.isFinite(id) ? id : null
    }
    return null
  }

  const addStory = async (story) => {
    const { data, error } = await supabase
      .from('stories')
      .insert({
        title: story.title,
        genre: story.genre || 'Fantasy',
        cover_file_id: story.cover || null,
        description: story.description || '',
      })
      .select('*')
      .single()
    if (error) {
      console.error('Supabase story insert error:', error)
      throw error
    }
    return data
  }

  const updateStory = async (storyId, updates) => {
    const supabaseId = getSupabaseStoryId(storyId)
    if (supabaseId !== null) {
      const { error } = await supabase.from('stories').update({
        title: updates.title,
        genre: updates.genre,
        cover_file_id: updates.cover,
        description: updates.description || '',
      }).eq('id', supabaseId)
      if (error) throw error
      return
    }
    persistStories(adminStories.map((story) =>
      story.id === storyId ? { ...story, ...updates } : story
    ))
  }

  const addEpisodeToStory = async (storyId, episode) => {
    const supabaseId = getSupabaseStoryId(storyId)
    if (supabaseId !== null) {
      const row = {
        story_id: supabaseId,
        number: Number(episode.number),
        title: episode.title,
        type: episode.type || 'audio',
        file_id: episode.file_id || null,
        access_type: Array.isArray(episode.accessType) ? (episode.accessType[0] || 'free') : (episode.accessType || 'free'),
        available: episode.available !== false,
      }
      if (episode.telegram_message_id) row.telegram_message_id = episode.telegram_message_id
      const { error } = await supabase.from('episodes').insert(row)
      if (error) {
        console.error('Supabase episode insert error:', error)
        throw error
      }
      return
    }
    persistStories(adminStories.map((story) =>
      story.id === storyId ? { ...story, episodes: [...(story.episodes || []), episode] } : story
    ))
  }

  const updateEpisode = async (storyId, episodeNumber, updates) => {
    const supabaseId = getSupabaseStoryId(storyId)
    if (supabaseId !== null) {
      const row = {
        number: Number(updates.number),
        title: updates.title,
        type: updates.type || 'audio',
        file_id: updates.file_id || null,
        access_type: Array.isArray(updates.accessType) ? (updates.accessType[0] || 'free') : (updates.accessType || 'free'),
        available: updates.available !== false,
      }
      if (updates.telegram_message_id) row.telegram_message_id = updates.telegram_message_id
      const { error } = await supabase.from('episodes').update(row)
        .eq('story_id', supabaseId).eq('number', Number(episodeNumber))
      if (error) throw error
      return
    }
    persistStories(adminStories.map((story) =>
      story.id === storyId
        ? { ...story, episodes: (story.episodes || []).map((ep) => ep.number === episodeNumber ? { ...ep, ...updates } : ep) }
        : story
    ))
  }

  const deleteEpisode = async (storyId, episodeNumber) => {
    const supabaseId = getSupabaseStoryId(storyId)
    if (supabaseId !== null) {
      const { error } = await supabase.from('episodes').delete()
        .eq('story_id', supabaseId).eq('number', Number(episodeNumber))
      if (error) throw error
      return
    }
    persistStories(adminStories.map((story) =>
      story.id === storyId ? { ...story, episodes: (story.episodes || []).filter((ep) => ep.number !== episodeNumber) } : story
    ))
  }

  const deleteAdminStory = async (storyId) => {
    const supabaseId = getSupabaseStoryId(storyId)
    if (supabaseId !== null) {
      const { error } = await supabase.from('stories').delete().eq('id', supabaseId)
      if (error) throw error
      return
    }
    persistStories(adminStories.filter((story) => story.id !== storyId))
  }

'''
s = s[:start] + replacement + s[end:]

# Remove the older local-only episode/story handlers left behind by the previous patch.
old_start = s.find('  const addEpisodeToStory = (')
old_end = s.find('  const addBook = (', old_start)
if old_start != -1 and old_end != -1:
    s = s[:old_start] + s[old_end:]

app.write_text(s, encoding='utf-8')

ap = Path('src/AdminPanel.jsx')
a = ap.read_text(encoding='utf-8')
a = a.replace(
    "const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || STREAMING_SERVER_URL;",
    "const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || 'http://localhost:3000';",
    1,
)
a = a.replace("episode_number: Number(finalNumber),", "number: Number(finalNumber),")
a = a.replace("        audio_url: null,\n", "        file_id: null,\n        access_type: 'free',\n        available: true,\n")
old = '''        // Update local React state once to avoid closure bugs
        onUpdateStory(Number(bulkStoryId), {
          episodes: [...(story.episodes || []), ...newLocalEpisodes]
        })'''
new = '''        // Supabase is the source of truth for Telegram stories. Realtime refreshes the UI.
        if (!String(bulkStoryId).startsWith('tg-story-')) {
          onUpdateStory(Number(bulkStoryId), {
            episodes: [...(story.episodes || []), ...newLocalEpisodes]
          })
        }'''
a = a.replace(old, new, 1)
a = a.replace("          id: Date.now(),\n", "", 1)
ap.write_text(a, encoding='utf-8')

print('Content sync patch completed.')
