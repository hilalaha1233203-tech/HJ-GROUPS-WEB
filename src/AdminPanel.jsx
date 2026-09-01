import { useState } from 'react'
import FileUploadField from './components/FileUploadField'
import { resolveAccessType } from './lib/accessControl'

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
  const [episodeFileUploading, setEpisodeFileUploading] = useState(false)
  const [episodeAvailable, setEpisodeAvailable] = useState(true)
  const [episodeAccessType, setEpisodeAccessType] = useState('free')

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
  }

  const submitStory = (event) => {
    event.preventDefault()

    if (!storyTitle.trim() || !storyCover.trim()) {
      alert('Title and a cover image are required')
      return
    }

    if (editingStoryId) {
      onUpdateStory(editingStoryId, {
        title: storyTitle.trim(),
        genre: storyGenre,
        cover: storyCover.trim(),
        description: storyDescription.trim(),
      })
    } else {
      onAddStory({
        id: Date.now(),
        title: storyTitle.trim(),
        genre: storyGenre,
        cover: storyCover.trim(),
        description: storyDescription.trim(),
        episodes: [],
      })
    }

    resetStoryForm()
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
    setEpisodeAvailable(episode.available !== false)
    setEpisodeAccessType(resolveAccessType(episode))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitEpisode = (event) => {
    event.preventDefault()

    if (!episodeStoryId) { alert('Select a story'); return }
    if (!episodeNumber) { alert('Enter episode number'); return }
    if (!episodeTitle.trim()) { alert('Enter episode title'); return }
    if (!episodeSrc.trim()) { alert(`Choose ${episodeType === 'video' ? 'a video' : 'an audio'} file`); return }

    const number = Number(episodeNumber)
    const data = {
      number,
      title: episodeTitle.trim(),
      type: episodeType,
      src: episodeSrc.trim(),
      available: episodeAvailable,
      accessType: episodeAccessType,
    }

    if (editingEpisode) {
      onUpdateEpisode(Number(editingEpisode.storyId), Number(editingEpisode.originalNumber), data)
    } else {
      onAddEpisode(Number(episodeStoryId), data)
    }

    resetEpisodeForm()
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

  return (
    <div className="admin-panel">
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
                  <FileUploadField
                    label="Choose Audio"
                    kind="audio"
                    bucket="audio"
                    folder={`story-${episodeStoryId || 'unassigned'}`}
                    value={episodeSrc}
                    accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                    onUploaded={(url) => setEpisodeSrc(url)}
                    onUploadingChange={setEpisodeFileUploading}
                  />
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

            <section className="admin-section">
              <h3>Your Stories ({adminStoryIds.length})</h3>

              <div className="admin-list">
                {stories.filter((story) => adminStoryIds.includes(story.id)).map((story) => (
                  <div key={story.id} className="admin-story-block">
                    <div className="admin-list-item">
                      <img src={story.cover} alt="" />
                      <div>
                        <strong>{story.title}</strong>
                        <small>{story.genre} · {story.episodes.length} episodes</small>
                      </div>
                      <button className="admin-edit" onClick={() => startEditStory(story)}>✏️ Edit</button>
                      <button className="admin-delete" onClick={() => { if (window.confirm(`Delete "${story.title}"?`)) onDeleteStory(story.id) }}>🗑 Delete</button>
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
                                {episode.type === 'video' ? '🎬' : '🎧'} {resolveAccessType(episode).toUpperCase()}
                                {episode.available === false ? ' · Coming Soon' : ''}
                              </small>
                            </div>
                            <button className="admin-edit" onClick={() => startEditEpisode(story, episode)}>✏️</button>
                            <button className="admin-delete" onClick={() => { if (window.confirm(`Delete Episode ${episode.number}?`)) onDeleteEpisode(story.id, episode.number) }}>🗑</button>
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
                    <img src={book.cover} alt="" />
                    <div>
                      <strong>{book.title}</strong>
                      <small>{book.type.toUpperCase()} · {book.category} · {resolveAccessType(book).toUpperCase()}</small>
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
                      <img src={video.cover} alt="" />
                      <div>
                        <strong>{video.title}</strong>
                        <small>{video.category} · {resolveAccessType(video).toUpperCase()}</small>
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
                              <small>{resolveAccessType(episode).toUpperCase()}</small>
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
