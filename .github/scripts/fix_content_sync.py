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

# Remove legacy local-only story handlers if an old copy still exists.
old_start = s.find('  const addStory = (story) =>')
old_end = s.find('  const addBook = (', old_start)
if old_start != -1 and old_end != -1:
    s = s[:old_start] + s[old_end:]

# Remove the unwanted local demo stories, idempotently.
old_state = """  const [adminStories, setAdminStories] =\n    useState(() =>\n      loadList('hj_admin_stories')\n    )"""
new_state = """  const [adminStories, setAdminStories] =\n    useState(() => {\n      const list = loadList('hj_admin_stories')\n      const blockedTitles = new Set(['கி.பி2500', 'Cult'])\n      const filtered = list.filter((story) => !blockedTitles.has(String(story?.title || '').trim()))\n      if (filtered.length !== list.length) {\n        saveList('hj_admin_stories', filtered)\n      }\n      return filtered\n    })"""
if old_state in s:
    s = s.replace(old_state, new_state, 1)

# Responsive watermark sizing/positioning, idempotently.
old_width = """      const targetWidth =\n        Math.min(\n          320,\n          width * 0.4\n        )"""
new_width = """      const isMobile = width <= 700\n      const targetWidth = isMobile\n        ? Math.min(240, width * 0.78)\n        : Math.min(320, width * 0.4)"""
if old_width in s:
    s = s.replace(old_width, new_width, 1)

old_origin = """      const originY =\n        height * 0.14"""
new_origin = """      const originY = isMobile\n        ? Math.max(88, height * 0.12)\n        : height * 0.14"""
if old_origin in s:
    s = s.replace(old_origin, new_origin, 1)

# Add scroll-driven parallax to the existing particle watermark.
if 'let scrollOffset = 0' not in s:
    s = s.replace(
        "    let particles = []\n    let ready = false\n",
        "    let particles = []\n    let ready = false\n    let scrollOffset = 0\n",
        1,
    )

if 'particle.homeY -\n              scrollOffset' not in s:
    s = s.replace(
        """          for (const particle of particles) {\n            let targetX =\n              particle.homeX\n\n            let targetY =\n              particle.homeY\n""",
        """          for (const particle of particles) {\n            let targetX =\n              particle.homeX\n\n            // Page-scroll parallax keeps the background logo moving with the page.\n            let targetY =\n              particle.homeY -\n              scrollOffset\n""",
        1,
    )

if 'const handleScroll = () =>' not in s:
    s = s.replace(
        """    const handleMouseMove = (\n      event\n    ) => {\n""",
        """    const handleScroll = () => {\n      scrollOffset = window.scrollY * 0.22\n    }\n\n    const handleMouseMove = (\n      event\n    ) => {\n""",
        1,
    )

if "'scroll',\n      handleScroll" not in s:
    s = s.replace(
        """    window.addEventListener(\n      'mousemove',\n      handleMouseMove\n    )\n\n    animate()\n""",
        """    window.addEventListener(\n      'mousemove',\n      handleMouseMove\n    )\n\n    window.addEventListener(\n      'scroll',\n      handleScroll,\n      { passive: true }\n    )\n\n    handleScroll()\n    animate()\n""",
        1,
    )

if "'scroll',\n        handleScroll" not in s:
    s = s.replace(
        """      window.removeEventListener(\n        'mousemove',\n        handleMouseMove\n      )\n    }\n""",
        """      window.removeEventListener(\n        'mousemove',\n        handleMouseMove\n      )\n\n      window.removeEventListener(\n        'scroll',\n        handleScroll\n      )\n    }\n""",
        1,
    )

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