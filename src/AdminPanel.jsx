import FileUploadField from './components/FileUploadField'
import { resolveAccessType } from './lib/accessControl'
import { supabase } from './supabase'
import React, { useState } from 'react'


function AccessTypeField({ groupName, value, onChange }) {
  const options = [
    { value: 'free', label: 'Free' },
    { value: 'vip', label: 'VIP' },
    { value: 'premium', label: 'Premium' },
    { value: 'ads', label: 'Ads' },
  ]

  // Convert old single string values to array for backward compatibility during edit
  const selectedValues = Array.isArray(value) 
    ? value 
    : (typeof value === 'string' && value ? [value] : ['free'])

  const handleCheckboxChange = (optValue, isChecked) => {
    let newValues = [...selectedValues]
    if (isChecked) {
      if (!newValues.includes(optValue)) newValues.push(optValue)
    } else {
      newValues = newValues.filter(v => v !== optValue)
    }
    // Prevent empty array, fallback to 'free'
    if (newValues.length === 0) newValues = ['free']
    onChange(newValues)
  }

  return (
    <div className="access-type-field">
      <span className="access-type-label">Access Types</span>
      <div className="access-type-options">
        {options.map((opt) => (
          <label key={opt.value} className="access-type-option">
            <input
              type="checkbox"
              name={`${groupName}_${opt.value}`}
              checked={selectedValues.includes(opt.value)}
              onChange={(e) => handleCheckboxChange(opt.value, e.target.checked)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function AdminPanel({
  stories,
  books,
  videoStories,

  onClose,

  onAddStory,
  onUpdateStory,

  onAddEpisode,
  onUpdateEpisode,
  onDeleteEpisode,

  onDeleteStory,

  onAddBook,
  onUpdateBook,
  onDeleteBook,

  onAddVideo,
  onUpdateVideo,
  onAddVideoEpisode,
  onUpdateVideoEpisode,
  onDeleteVideoEpisode,
  onDeleteVideo,

  adminStoryIds,
  adminBookIds,
  adminVideoIds,
}) {
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  const showToast = (message, type = 'success') => {
    setToastMessage(message)
    setToastType(type)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const [tab, setTab] = useState('stories')

  const [editingStoryId, setEditingStoryId] = useState(null)
  const [editingBookId, setEditingBookId] = useState(null)
  const [editingVideoId, setEditingVideoId] = useState(null)
  const [editingEpisode, setEditingEpisode] = useState(null)

  /* =====================================================
     STORY FORM
  ===================================================== */

  const [storyTitle, setStoryTitle] = useState('')
  const [storyGenre, setStoryGenre] = useState('Fantasy')
  const [storyCover, setStoryCover] = useState('')
  const [storyCoverUploading, setStoryCoverUploading] = useState(false)
  const [storyDescription, setStoryDescription] = useState('')

  /* =====================================================
     EPISODE FORM
  ===================================================== */

  const [episodeStoryId, setEpisodeStoryId] = useState('')
  const [episodeNumber, setEpisodeNumber] = useState('')
  const [episodeTitle, setEpisodeTitle] = useState('')
  const [episodeType, setEpisodeType] = useState('audio')
  const [episodeSrc, setEpisodeSrc] = useState('')
  const [episodeTelegramUrl, setEpisodeTelegramUrl] = useState('')
  const [episodeFileUploading, setEpisodeFileUploading] = useState(false)
  const [episodeAvailable, setEpisodeAvailable] = useState(true)
  const [episodeAccessType, setEpisodeAccessType] = useState('free')

  /* =====================================================
     BULK TELEGRAM IMPORT
  ===================================================== */
  const [bulkStoryId, setBulkStoryId] = useState('')
  const [bulkMessages, setBulkMessages] = useState([])
  const [bulkSelectedIds, setBulkSelectedIds] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkTitleOverrides, setBulkTitleOverrides] = useState({})
  const [bulkNumberOverrides, setBulkNumberOverrides] = useState({})

  /* =====================================================
     BOOK FORM
  ===================================================== */

  const [bookTitle, setBookTitle] = useState('')
  const [bookAuthor, setBookAuthor] = useState('')
  const [bookDescription, setBookDescription] = useState('')
  const [bookType, setBookType] = useState('pdf')
  const [bookCategory, setBookCategory] = useState('Tamil Stories')
  const [bookCover, setBookCover] = useState('')
  const [bookCoverUploading, setBookCoverUploading] = useState(false)
 const [bookFile, setBookFile] = useState('')
const [bookFilePath, setBookFilePath] = useState('')
const [bookFileUploading, setBookFileUploading] = useState(false)

const [bookCoverPath, setBookCoverPath] = useState('')

const [bookAccessType, setBookAccessType] = useState('free')

  /* =====================================================
     VIDEO FORM
  ===================================================== */

  const [videoTitle, setVideoTitle] = useState('')
  const [videoCategory, setVideoCategory] = useState('Action')
  const [videoCover, setVideoCover] = useState('')
  const [videoCoverUploading, setVideoCoverUploading] = useState(false)
  const [videoSrc, setVideoSrc] = useState('')
  const [videoFileUploading, setVideoFileUploading] = useState(false)
  const [videoAccessType, setVideoAccessType] = useState('free')
  const [videoEpisodeTitle, setVideoEpisodeTitle] = useState('Episode 01')

  /* =====================================================
     STORY
  ===================================================== */

  const handleScanTelegram = async () => {
    setBulkLoading(true)
    showToast('Scanning Telegram messages...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast('Not authenticated', 'error')
        setBulkLoading(false)
        return
      }

      const res = await fetch('http://localhost:3000/telegram/messages', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!res.ok) {
        showToast('Unable to connect to Telegram server or unauthorized', 'error')
        setBulkLoading(false)
        return
      }

      const msgs = await res.json()
      if (!msgs || msgs.length === 0) {
         showToast('No audio messages found')
         setBulkMessages([])
      } else {
         setBulkMessages(msgs)
         setBulkSelectedIds([])
         setBulkTitleOverrides({})
         setBulkNumberOverrides({})
         showToast('Telegram messages loaded')
      }
    } catch (e) {
      console.error(e)
      showToast('Unable to connect to Telegram server', 'error')
    }
    setBulkLoading(false)
  }

  const handleBulkToggle = (msgId) => {
    setBulkSelectedIds(prev => {
      if (prev.includes(msgId)) {
        return prev.filter(id => id !== msgId)
      } else {
        return [...prev, msgId]
      }
    })
  }

  const handleBulkToggleAll = () => {
    if (bulkSelectedIds.length === bulkMessages.length) {
      setBulkSelectedIds([])
    } else {
      setBulkSelectedIds(bulkMessages.map(m => m.messageId))
    }
  }

  const handleBulkTitleChange = (msgId, title) => {
    setBulkTitleOverrides(prev => ({ ...prev, [msgId]: title }))
  }

  const handleBulkNumberChange = (msgId, num) => {
    setBulkNumberOverrides(prev => ({ ...prev, [msgId]: num }))
  }

  const handleBulkImport = async () => {
    if (!bulkStoryId) {
      showToast('Select a story first', 'error')
      return
    }
    if (bulkSelectedIds.length === 0) {
      showToast('Select at least one Telegram message', 'error')
      return
    }

    const story = stories.find(s => String(s.id) === bulkStoryId)
    if (!story) {
      showToast('Story not found', 'error')
      return
    }

    const existingMsgIds = new Set((story.episodes || []).map(e => e.telegram_message_id).filter(Boolean))
    
    let maxEpisodeNumber = 0
    if (story.episodes && story.episodes.length > 0) {
      maxEpisodeNumber = Math.max(...story.episodes.map(e => e.number))
    }

    let importedCount = 0
    let skippedCount = 0
    
        const selectedMsgs = bulkSelectedIds.map(id => bulkMessages.find(m => m.messageId === id)).filter(Boolean)

    const newLocalEpisodes = []
    const newSupabaseEpisodes = []

    for (const msg of selectedMsgs) {
      if (existingMsgIds.has(msg.messageId)) {
        skippedCount++
        continue
      }
      
      maxEpisodeNumber++
      const finalNumber = bulkNumberOverrides[msg.messageId] || maxEpisodeNumber
      const finalTitle = bulkTitleOverrides[msg.messageId] || msg.caption || msg.fileName || 'Untitled Episode'

      // Independent object for local state UI
      const localEpisodeObj = {
        number: Number(finalNumber),
        title: finalTitle.trim(),
        type: 'audio',
        src: '',
        telegram_message_id: msg.messageId,
        available: true,
        accessType: ['free'],
      }
      newLocalEpisodes.push(localEpisodeObj)

      // Independent object for Supabase insertion
      const supabaseEpisodeObj = {
        story_id: Number(bulkStoryId),
        episode_number: Number(finalNumber),
        title: finalTitle.trim(),
        telegram_message_id: msg.messageId,
        audio_url: null,
        type: 'audio'
      }
      newSupabaseEpisodes.push(supabaseEpisodeObj)
      
      importedCount++
    }

    if (newSupabaseEpisodes.length > 0) {
      try {
        const { error } = await supabase.from('episodes').insert(newSupabaseEpisodes)
        if (error) {
          console.error('Supabase bulk insert error:', error)
          showToast('Failed to insert some episodes to database', 'error')
        }
        
        // Update local React state once to avoid closure bugs
        onUpdateStory(Number(bulkStoryId), {
          episodes: [...(story.episodes || []), ...newLocalEpisodes]
        })
      } catch (e) {
        console.error('Error during bulk import', e)
        showToast('Exception occurred during bulk import', 'error')
      }
    }

    if (skippedCount > 0) {
      showToast(`${importedCount} episodes imported successfully. ${skippedCount} duplicates skipped.`)
    } else {
      showToast(`${importedCount} episodes imported successfully`)
    }

    setBulkSelectedIds([])
  }

  const resetStoryForm = () => {
    setEditingStoryId(null)
    setStoryTitle('')
    setStoryGenre('Fantasy')
    setStoryCover('')
    setStoryDescription('')
  }

  const startEditStory = (story) => {
    setEditingStoryId(story.id)
    setStoryTitle(story.title || '')
    setStoryGenre(story.genre || 'Fantasy')
    setStoryCover(story.cover || '')
    setStoryDescription(story.description || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showToast('Editing story — form moved to top')
  }

  const submitStory = (event) => {
    event.preventDefault()

    if (!storyTitle.trim() || !storyCover.trim()) {
      showToast('Title and a cover image are required', 'error')
      return
    }

    try {
      if (editingStoryId) {
        onUpdateStory(editingStoryId, {
          title: storyTitle.trim(),
          genre: storyGenre,
          cover: storyCover.trim(),
          description: storyDescription.trim(),
        })
        showToast('Story updated successfully')
      } else {
        onAddStory({
          id: Date.now(),
          title: storyTitle.trim(),
          genre: storyGenre,
          cover: storyCover.trim(),
          description: storyDescription.trim(),
          episodes: [],
        })
        showToast('Story added successfully')
      }

      resetStoryForm()
    } catch (error) {
      console.error('Error saving story:', error)
      showToast('Error saving story. Check console.', 'error')
    }
  }

  /* =====================================================
     EPISODE
  ===================================================== */

  const resetEpisodeForm = () => {
    setEditingEpisode(null)
    setEpisodeStoryId('')
    setEpisodeNumber('')
    setEpisodeTitle('')
    setEpisodeType('audio')
    setEpisodeSrc('')
    setEpisodeTelegramUrl('')
    setEpisodeAvailable(true)
    setEpisodeAccessType('free')
  }

  const startEditEpisode = (story, episode) => {
    setEditingEpisode({ storyId: story.id, originalNumber: episode.number })
    setEpisodeStoryId(String(story.id))
    setEpisodeNumber(String(episode.number))
    setEpisodeTitle(episode.title || '')
    setEpisodeType(episode.type || 'audio')
    setEpisodeSrc(episode.src || '')
    setEpisodeTelegramUrl(episode.telegram_message_id ? `https://t.me/c/id/${episode.telegram_message_id}` : '')
    setEpisodeAvailable(episode.available !== false)
    setEpisodeAccessType(resolveAccessType(episode))
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showToast('Editing episode')
  }

  const submitEpisode = (event) => {
    event.preventDefault()

    if (!episodeStoryId) { showToast('Select a story', 'error'); return }
    if (!episodeNumber) { showToast('Enter episode number', 'error'); return }
    if (!episodeTitle.trim()) { showToast('Enter episode title', 'error'); return }

    let extractedTelegramId = null
    if (episodeType === 'audio' && episodeTelegramUrl.trim()) {
      const parts = episodeTelegramUrl.trim().split('/')
      const lastPart = parts[parts.length - 1]
      if (!isNaN(lastPart) && lastPart) {
        extractedTelegramId = Number(lastPart)
      } else {
        showToast('Invalid Telegram URL. Make sure it ends with the message ID.', 'error')
        return
      }
    }

    if (!episodeSrc.trim() && !extractedTelegramId) { showToast(`Choose ${episodeType === 'video' ? 'a video' : 'an audio'} file or paste Telegram URL`, 'error'); return }

    try {
      const number = Number(episodeNumber)
      const data = {
        number,
        title: episodeTitle.trim(),
        type: episodeType,
        src: episodeSrc.trim(),
        available: episodeAvailable,
        accessType: episodeAccessType,
      }
      
      if (extractedTelegramId) {
        data.telegram_message_id = extractedTelegramId;
      }

      if (editingEpisode) {
        onUpdateEpisode(Number(editingEpisode.storyId), Number(editingEpisode.originalNumber), data)
        showToast('Episode updated successfully')
      } else {
        onAddEpisode(Number(episodeStoryId), data)
        showToast('Episode added successfully')
      }
      resetEpisodeForm()
    } catch (error) {
      console.error('Error submitting episode:', error)
      showToast('Error saving episode. Check console.', 'error')
    }
  }

  /* =====================================================
     BOOK
  ===================================================== */

  const resetBookForm = () => {
  setEditingBookId(null)
  setBookTitle('')
  setBookAuthor('')
  setBookDescription('')
  setBookType('pdf')
  setBookCategory('Tamil Stories')
  setBookCover('')
  setBookCoverPath('')
  setBookFile('')
  setBookFilePath('')
  setBookAccessType('free')
}

  const startEditBook = (book) => {
  setEditingBookId(book.id)

  setBookTitle(book.title || '')
  setBookAuthor(book.author || '')
  setBookDescription(book.description || '')

  setBookType(book.type || 'pdf')
  setBookCategory(book.category || 'Tamil Stories')

  setBookCover(book.cover || '')
  setBookCoverPath(book.coverPath || '')

  setBookFile(book.file || '')
  setBookFilePath(book.filePath || '')

  setBookAccessType(resolveAccessType(book))

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

 const submitBook = (event) => {
  event.preventDefault()

  if (!bookTitle.trim() || !bookCover.trim() || !bookFile.trim()) {
    alert('Title, cover image and book file are all required')
    return
  }

  const data = {
    title: bookTitle.trim(),
    author: bookAuthor.trim(),
    description: bookDescription.trim(),
    type: bookType,
    category: bookCategory,

    cover: bookCover.trim(),
    coverPath: bookCoverPath || '',

    file: bookFile.trim(),
    filePath: bookFilePath || '',

    accessType: bookAccessType,
  }

  if (editingBookId) {
    onUpdateBook(editingBookId, data)
  } else {
    onAddBook({
      id: Date.now(),
      ...data,
    })
  }

  resetBookForm()
}
  /* =====================================================
     VIDEO
  ===================================================== */

  const resetVideoForm = () => {
    setEditingVideoId(null)
    setVideoTitle('')
    setVideoCategory('Action')
    setVideoCover('')
    setVideoSrc('')
    setVideoAccessType('free')
    setVideoEpisodeTitle('Episode 01')
  }

  const startEditVideo = (video) => {
    setEditingVideoId(video.id)
    setVideoTitle(video.title || '')
    setVideoCategory(video.category || 'Action')
    setVideoCover(video.cover || '')

    const firstEpisode = video.episodes?.[0]
    setVideoSrc(firstEpisode?.src || '')
    setVideoEpisodeTitle(firstEpisode?.title || 'Episode 01')
    setVideoAccessType(resolveAccessType(video))

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitVideo = (event) => {
    event.preventDefault()

    if (!videoTitle.trim() || !videoCover.trim() || !videoSrc.trim()) {
      alert('Title, cover image and video file are all required')
      return
    }

    if (editingVideoId) {
      const currentVideo = videoStories.find((video) => video.id === editingVideoId)

      onUpdateVideo(editingVideoId, {
        title: videoTitle.trim(),
        category: videoCategory,
        cover: videoCover.trim(),
        accessType: videoAccessType,
      })

      if (currentVideo?.episodes?.length) {
        onUpdateVideoEpisode(editingVideoId, currentVideo.episodes[0].number, {
          title: videoEpisodeTitle.trim(),
          src: videoSrc.trim(),
          type: 'video',
          available: true,
          accessType: videoAccessType,
        })
      } else {
        onAddVideoEpisode(editingVideoId, {
          number: 1,
          title: videoEpisodeTitle.trim(),
          type: 'video',
          src: videoSrc.trim(),
          available: true,
          accessType: videoAccessType,
        })
      }
    } else {
      onAddVideo({
        id: Date.now(),
        title: videoTitle.trim(),
        category: videoCategory,
        cover: videoCover.trim(),
        accessType: videoAccessType,
        episodes: [
          {
            number: 1,
            title: videoEpisodeTitle.trim(),
            type: 'video',
            src: videoSrc.trim(),
            available: true,
            accessType: videoAccessType,
          },
        ],
      })
    }

    resetVideoForm()
  }

  const editVideoEpisode = (video, episode) => {
    const newTitle = window.prompt('Episode title:', episode.title)
    if (newTitle === null) return

    const newSrc = window.prompt('Video URL (paste an existing Supabase file URL):', episode.src)
    if (newSrc === null) return

    onUpdateVideoEpisode(video.id, episode.number, { title: newTitle.trim(), src: newSrc.trim() })
  }

  /* =====================================================
     RENDER
  ===================================================== */

  const handleDeleteStory = (story) => {
    if (window.confirm('Are you sure you want to delete this story?')) {
      try {
        onDeleteStory(story.id)
        showToast('Story deleted successfully')
      } catch (error) {
        console.error(error)
        showToast('Error deleting story', 'error')
      }
    }
  }

  const handleDeleteEpisode = (storyId, episodeNumber) => {
    if (window.confirm('Are you sure you want to delete this episode?')) {
      try {
        onDeleteEpisode(storyId, episodeNumber)
        showToast('Episode deleted successfully')
      } catch (error) {
        console.error(error)
        showToast('Error deleting episode', 'error')
      }
    }
  }

  return (
    <div className="admin-panel">
      {toastMessage && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toastType === 'error' ? '#f44336' : '#4CAF50',
          color: 'white', padding: '10px 20px', borderRadius: '5px', zIndex: 100000
        }}>
          {toastMessage}
        </div>
      )}
      <div className="admin-header">
        <strong>⚙ HJ GROUPS Admin</strong>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="admin-tabs">
        <button className={tab === 'stories' ? 'active' : ''} onClick={() => setTab('stories')}>📖 Stories & Episodes</button>
        <button className={tab === 'books' ? 'active' : ''} onClick={() => setTab('books')}>📚 Books</button>
        <button className={tab === 'videos' ? 'active' : ''} onClick={() => setTab('videos')}>🎬 Video Stories</button>
      </div>

      <div className="admin-body">
        {/* ================= STORIES ================= */}

        {tab === 'stories' && (
          <>
            <section className="admin-section">
              <h3>{editingStoryId ? '✏️ Edit Story' : '➕ Add New Story'}</h3>

              <form onSubmit={submitStory} className="admin-form">
                <input placeholder="Story title" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} />

                <select value={storyGenre} onChange={(e) => setStoryGenre(e.target.value)}>
                  {['Fantasy', 'Action', 'Adventure', 'Romance', 'System', 'Mystery'].map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>

                <FileUploadField
                  label="Choose Cover Image"
                  kind="image"
                  bucket="story-covers"
                  folder="stories"
                  value={storyCover}
                  accept="image/*"
                  onUploaded={(url) => setStoryCover(url)}
                  onUploadingChange={setStoryCoverUploading}
                />

                <textarea placeholder="Description" value={storyDescription} onChange={(e) => setStoryDescription(e.target.value)} />

                <button type="submit" className="admin-submit" disabled={storyCoverUploading}>
                  {editingStoryId ? '✓ Save Story' : '+ Add Story'}
                </button>

                {editingStoryId && <button type="button" className="admin-cancel" onClick={resetStoryForm}>Cancel Edit</button>}
              </form>
            </section>

            <section className="admin-section">
              <h3>{editingEpisode ? '✏️ Edit Episode' : '🎧 Add Episode'}</h3>

              <form onSubmit={submitEpisode} className="admin-form">
                <select value={episodeStoryId} onChange={(e) => setEpisodeStoryId(e.target.value)}>
                  <option value="">Select story</option>
                  {adminStoryIds.length > 0 &&
                    stories
                      .filter((story) => adminStoryIds.includes(story.id))
                      .map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
                </select>

                <input
                  type="number"
                  min="1"
                  placeholder="Episode number"
                  value={episodeNumber}
                  onChange={(e) => setEpisodeNumber(e.target.value)}
                />

                <input placeholder="Episode title" value={episodeTitle} onChange={(e) => setEpisodeTitle(e.target.value)} />

                <select value={episodeType} onChange={(e) => { setEpisodeType(e.target.value); setEpisodeSrc('') }}>
                  <option value="audio">🎧 Audio</option>
                  <option value="video">🎬 Video</option>
                </select>

                {episodeType === 'audio' ? (
                  <>
                    <input
                      type="text"
                      placeholder="Paste Telegram message URL (e.g. https://t.me/c/123/456)"
                      value={episodeTelegramUrl}
                      onChange={(e) => {
                        setEpisodeTelegramUrl(e.target.value)
                        if (e.target.value) setEpisodeSrc('')
                      }}
                    />
                    <div style={{ textAlign: 'center', margin: '10px 0', fontWeight: 'bold' }}>OR</div>
                    <FileUploadField
                      label="Choose Audio"
                      kind="audio"
                      bucket="audio"
                      folder={`story-${episodeStoryId || 'unassigned'}`}
                      value={episodeSrc}
                      accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                      onUploaded={(url) => {
                        setEpisodeSrc(url)
                        setEpisodeTelegramUrl('')
                      }}
                      onUploadingChange={setEpisodeFileUploading}
                    />
                  </>
                ) : (
                  <FileUploadField
                    label="Choose Video"
                    kind="video"
                    bucket="videos"
                    folder={`story-${episodeStoryId || 'unassigned'}`}
                    value={episodeSrc}
                    accept="video/*,.mp4,.webm,.mov"
                    onUploaded={(url) => setEpisodeSrc(url)}
                    onUploadingChange={setEpisodeFileUploading}
                  />
                )}

                <label className="admin-checkbox">
                  <input type="checkbox" checked={episodeAvailable} onChange={(e) => setEpisodeAvailable(e.target.checked)} />
                  Available
                </label>

                <AccessTypeField groupName="episode-access" value={episodeAccessType} onChange={setEpisodeAccessType} />

                <button type="submit" className="admin-submit" disabled={episodeFileUploading}>
                  {editingEpisode ? '✓ Save Episode' : '+ Add Episode'}
                </button>

                {editingEpisode && <button type="button" className="admin-cancel" onClick={resetEpisodeForm}>Cancel Edit</button>}
              </form>
            </section>

            <section className="admin-section bulk-telegram-section">
              <h3>🎧 Bulk Telegram Import</h3>
              <div className="admin-form">
                <select value={bulkStoryId} onChange={(e) => setBulkStoryId(e.target.value)}>
                  <option value="">Select Story</option>
                  {adminStoryIds.length > 0 &&
                    stories
                      .filter((story) => adminStoryIds.includes(story.id))
                      .map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
                </select>

                <button type="button" className="admin-submit" style={{ backgroundColor: '#7C83FF' }} onClick={handleScanTelegram} disabled={bulkLoading}>
                  {bulkLoading ? '🔄 Scanning...' : '🔄 Scan Telegram Messages'}
                </button>

                {bulkMessages.length > 0 && (
                  <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                      <strong style={{ color: '#fff' }}>Selected: {bulkSelectedIds.length}</strong>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" className="primary-btn" style={{ padding: '5px 10px', fontSize: '14px' }} onClick={handleBulkToggleAll}>Toggle All</button>
                        <button type="button" className="admin-cancel" style={{ padding: '5px 10px', fontSize: '14px' }} onClick={() => setBulkSelectedIds([])}>Clear</button>
                      </div>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {bulkMessages.map(msg => {
                        const isSelected = bulkSelectedIds.includes(msg.messageId)
                        const defaultTitle = msg.caption || msg.fileName || 'Untitled Episode'
                        
                        return (
                          <div key={msg.messageId} style={{ 
                            background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', 
                            borderLeft: isSelected ? '4px solid #7C83FF' : '4px solid transparent',
                            display: 'flex', gap: '15px', alignItems: 'flex-start'
                          }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={() => handleBulkToggle(msg.messageId)}
                              style={{ width: '20px', height: '20px', marginTop: '10px' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>
                                ID: {msg.messageId} · {new Date(msg.date * 1000).toLocaleString()} · {Math.round(msg.size / 1024 / 1024 * 100) / 100} MB
                              </div>
                              <input 
                                type="text"
                                placeholder={defaultTitle}
                                value={bulkTitleOverrides[msg.messageId] !== undefined ? bulkTitleOverrides[msg.messageId] : defaultTitle}
                                onChange={(e) => handleBulkTitleChange(msg.messageId, e.target.value)}
                                style={{ width: '100%', padding: '8px', marginBottom: '5px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ fontSize: '12px', color: '#ccc' }}>Episode No:</label>
                                <input 
                                  type="number"
                                  min="1"
                                  placeholder="Auto"
                                  value={bulkNumberOverrides[msg.messageId] || ''}
                                  onChange={(e) => handleBulkNumberChange(msg.messageId, e.target.value)}
                                  style={{ width: '80px', padding: '5px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff' }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <button type="button" className="admin-submit" style={{ marginTop: '20px' }} onClick={handleBulkImport} disabled={bulkSelectedIds.length === 0}>
                      ⬆️ Import Selected
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="admin-section">
              <h3>Your Stories ({adminStoryIds.length})</h3>

              <div className="admin-list">
                {stories.filter((story) => adminStoryIds.includes(story.id)).map((story) => (
                  <div key={story.id} className="admin-story-block">
                    <div className="admin-list-item">
                      <img src={story.cover || undefined} alt="" />
                      <div>
                        <strong>{story.title}</strong>
                        <small>{story.genre} · {story.episodes?.length || 0} episodes</small>
                      </div>
                      <button className="admin-edit" onClick={() => startEditStory(story)}>✏️ Edit</button>
                      <button className="admin-delete" onClick={() => handleDeleteStory(story)}>🗑 Delete</button>
                    </div>

                    <div className="admin-episodes">
                      <strong>🎧 Episodes</strong>

                      {story.episodes?.length ? (
                        story.episodes.slice().sort((a, b) => a.number - b.number).map((episode) => (
                          <div key={episode.number} className="admin-episode-item">
                            <div>
                              <b>{String(episode.number).padStart(2, '0')}</b>
                              <span>{episode.title}</span>
                              <small>
                                {episode.type === 'video' ? '🎬' : '🎧'} {resolveAccessType(episode).join(', ').toUpperCase()}
                                {episode.available === false ? ' · Coming Soon' : ''}
                              </small>
                            </div>
                            <button className="admin-edit" onClick={() => startEditEpisode(story, episode)}>✏️</button>
                            <button className="admin-delete" onClick={() => handleDeleteEpisode(story.id, episode.number)}>🗑</button>
                          </div>
                        ))
                      ) : (
                        <small>No episodes yet.</small>
                      )}
                    </div>
                  </div>
                ))}

                {!adminStoryIds.length && <p>No admin-added stories yet.</p>}
              </div>
            </section>
          </>
        )}

        {/* ================= BOOKS ================= */}

        {tab === 'books' && (
          <>
            <section className="admin-section">
              <h3>{editingBookId ? '✏️ Edit Book' : '➕ Add New Book'}</h3>

              <form onSubmit={submitBook} className="admin-form">
                <input placeholder="Book title" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} />
                <input placeholder="Author (optional)" value={bookAuthor} onChange={(e) => setBookAuthor(e.target.value)} />
                <textarea placeholder="Description (optional)" value={bookDescription} onChange={(e) => setBookDescription(e.target.value)} />

                <select value={bookType} onChange={(e) => { setBookType(e.target.value); setBookFile('') }}>
                  <option value="pdf">PDF</option>
                  <option value="epub">EPUB</option>
                </select>

                <select value={bookCategory} onChange={(e) => setBookCategory(e.target.value)}>
                  {['Tamil Stories', 'Fantasy', 'Romance', 'Mystery', 'Other'].map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>

                <FileUploadField
                  label="Choose Cover Image"
                  kind="image"
                  bucket="story-covers"
                  folder="books"
                  value={bookCover}
                  accept="image/*"
                  onUploaded={(url, path) => {
  setBookCover(url)
  setBookCoverPath(path || '')
}}
                  onUploadingChange={setBookCoverUploading}
                />

                {bookType === 'pdf' ? (
                  <FileUploadField
                    label="Choose PDF"
                    kind="pdf"
                    bucket="books"
                    folder="pdf"
                    value={bookFile}
                    accept="application/pdf,.pdf"
                    onUploaded={(url, path) => {
  setBookFile(url)
  setBookFilePath(path || '')
}}
                    onUploadingChange={setBookFileUploading}
                  />
                ) : (
                  <FileUploadField
                    label="Choose EPUB"
                    kind="epub"
                    bucket="books"
                    folder="epub"
                    value={bookFile}
                    accept=".epub"
                    onUploaded={(url, path) => {
  setBookFile(url)
  setBookFilePath(path || '')
}}
                    onUploadingChange={setBookFileUploading}
                  />
                )}

                <AccessTypeField groupName="book-access" value={bookAccessType} onChange={setBookAccessType} />

                <button type="submit" className="admin-submit" disabled={bookCoverUploading || bookFileUploading}>
                  {editingBookId ? '✓ Save Book' : '+ Add Book'}
                </button>

                {editingBookId && <button type="button" className="admin-cancel" onClick={resetBookForm}>Cancel Edit</button>}
              </form>
            </section>

            <section className="admin-section">
              <h3>Your Books ({adminBookIds.length})</h3>

              <div className="admin-list">
                {books.filter((book) => adminBookIds.includes(book.id)).map((book) => (
                  <div key={book.id} className="admin-list-item">
                    <img src={book.cover || undefined} alt="" />
                    <div>
                      <strong>{book.title}</strong>
                      <small>{book.type.toUpperCase()} · {book.category} · {resolveAccessType(book).join(', ').toUpperCase()}</small>
                    </div>
                    <button className="admin-edit" onClick={() => startEditBook(book)}>✏️ Edit</button>
                    <button className="admin-delete" onClick={() => { if (window.confirm(`Delete "${book.title}"?`)) onDeleteBook(book.id) }}>🗑 Delete</button>
                  </div>
                ))}

                {!adminBookIds.length && <p>No admin-added books yet.</p>}
              </div>
            </section>
          </>
        )}

        {/* ================= VIDEOS ================= */}

        {tab === 'videos' && (
          <>
            <section className="admin-section">
              <h3>{editingVideoId ? '✏️ Edit Video Story' : '➕ Add New Video Story'}</h3>

              <form onSubmit={submitVideo} className="admin-form">
                <input placeholder="Video story title" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} />

                <select value={videoCategory} onChange={(e) => setVideoCategory(e.target.value)}>
                  {['Fantasy', 'Action', 'Adventure', 'Romance'].map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>

                <FileUploadField
                  label="Choose Thumbnail"
                  kind="image"
                  bucket="story-covers"
                  folder="video-stories"
                  value={videoCover}
                  accept="image/*"
                  onUploaded={(url) => setVideoCover(url)}
                  onUploadingChange={setVideoCoverUploading}
                />

                <FileUploadField
                  label="Choose Video"
                  kind="video"
                  bucket="videos"
                  folder="video-stories"
                  value={videoSrc}
                  accept="video/*,.mp4,.webm,.mov"
                  onUploaded={(url) => setVideoSrc(url)}
                  onUploadingChange={setVideoFileUploading}
                />

                <input placeholder="Episode title" value={videoEpisodeTitle} onChange={(e) => setVideoEpisodeTitle(e.target.value)} />

                <AccessTypeField groupName="video-access" value={videoAccessType} onChange={setVideoAccessType} />

                <button type="submit" className="admin-submit" disabled={videoCoverUploading || videoFileUploading}>
                  {editingVideoId ? '✓ Save Video' : '+ Add Video Story'}
                </button>

                {editingVideoId && <button type="button" className="admin-cancel" onClick={resetVideoForm}>Cancel Edit</button>}
              </form>
            </section>

            <section className="admin-section">
              <h3>Your Video Stories ({adminVideoIds.length})</h3>

              <div className="admin-list">
                {videoStories.filter((video) => adminVideoIds.includes(video.id)).map((video) => (
                  <div key={video.id} className="admin-story-block">
                    <div className="admin-list-item">
                      <img src={video.cover || undefined} alt="" />
                      <div>
                        <strong>{video.title}</strong>
                        <small>{video.category} · {resolveAccessType(video).join(', ').toUpperCase()}</small>
                      </div>
                      <button className="admin-edit" onClick={() => startEditVideo(video)}>✏️ Edit</button>
                      <button className="admin-delete" onClick={() => { if (window.confirm(`Delete "${video.title}"?`)) onDeleteVideo(video.id) }}>🗑 Delete</button>
                    </div>

                    <div className="admin-episodes">
                      <strong>🎬 Episodes</strong>

                      {video.episodes?.length ? (
                        video.episodes.map((episode) => (
                          <div key={episode.number} className="admin-episode-item">
                            <div>
                              <b>{String(episode.number).padStart(2, '0')}</b>
                              <span>{episode.title}</span>
                              <small>{resolveAccessType(episode).join(', ').toUpperCase()}</small>
                            </div>
                            <button className="admin-edit" onClick={() => editVideoEpisode(video, episode)}>✏️</button>
                            <button className="admin-delete" onClick={() => { if (window.confirm(`Delete Episode ${episode.number}?`)) onDeleteVideoEpisode(video.id, episode.number) }}>🗑</button>
                          </div>
                        ))
                      ) : (
                        <small>No episodes yet.</small>
                      )}
                    </div>
                  </div>
                ))}

                {!adminVideoIds.length && <p>No admin-added video stories yet.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminPanel






