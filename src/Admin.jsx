import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const ADMIN_PASSWORD = 'Kalam@2003'

function Admin({ onBack }) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [password, setPassword] = useState('')

  const [stories, setStories] = useState([])
  const [selectedStory, setSelectedStory] = useState('')

  const [storyName, setStoryName] = useState('')
  const [genre, setGenre] = useState('Fantasy')

  const [episodeNumber, setEpisodeNumber] = useState('')
  const [episodeTitle, setEpisodeTitle] = useState('')

  const [audioFile, setAudioFile] = useState(null)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (loggedIn) {
      loadStories()
    }
  }, [loggedIn])

  const loadStories = async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setStories(data || [])
  }

  const handleLogin = (event) => {
    event.preventDefault()

    if (password === ADMIN_PASSWORD) {
      setLoggedIn(true)
      setPassword('')
      setError('')
      setMessage('')
    } else {
      setError('Wrong admin password')
    }
  }

  const createStory = async () => {
    if (!storyName.trim()) {
      setError('Enter story name')
      return null
    }

    const { data, error } = await supabase
      .from('stories')
      .insert({
        title: storyName.trim(),
        genre: genre,
        cover: ''
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return null
    }

    setStories((current) => [...current, data])

    return data
  }

  const handleSaveEpisode = async (event) => {
    event.preventDefault()

    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (!audioFile) {
        throw new Error('Please select an audio file')
      }

      if (!episodeNumber) {
        throw new Error('Enter episode number')
      }

      if (!episodeTitle.trim()) {
        throw new Error('Enter episode title')
      }

      let storyId = selectedStory

      if (!storyId) {
        const newStory = await createStory()

        if (!newStory) {
          return
        }

        storyId = newStory.id
      }

      const fileExtension =
        audioFile.name.split('.').pop()?.toLowerCase() || 'mp3'

      const safeName = audioFile.name
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')

      const filePath =
        `${storyId}/episode-${episodeNumber}-${Date.now()}.${fileExtension}`

      setMessage('Uploading audio...')

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, audioFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: audioFile.type || 'audio/mpeg'
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const { data: publicUrlData } =
        supabase.storage
          .from('audio')
          .getPublicUrl(filePath)

      const audioUrl =
        publicUrlData.publicUrl

      setMessage('Saving episode...')

      const { error: episodeError } =
        await supabase
          .from('episodes')
          .insert({
            story_id: storyId,
            episode_number: Number(episodeNumber),
            title: episodeTitle.trim(),
            audio_url: audioUrl
          })

      if (episodeError) {
        throw new Error(episodeError.message)
      }

      setMessage(
        `Episode ${episodeNumber} uploaded successfully!`
      )

      setEpisodeNumber('')
      setEpisodeTitle('')
      setAudioFile(null)

      const fileInput =
        document.getElementById('audio-file')

      if (fileInput) {
        fileInput.value = ''
      }

    } catch (err) {
      setError(
        err?.message || 'Something went wrong'
      )
      setMessage('')
    } finally {
      setLoading(false)
    }
  }

  if (!loggedIn) {
    return (
      <div className="admin-page">

        <div className="admin-header">

          <div className="admin-logo">
            HJ GROUPS
          </div>

          <div className="admin-title">
            ADMIN PANEL
          </div>

        </div>

        <div className="admin-container">

          <button
            className="admin-back"
            onClick={onBack}
          >
            ← Back to Website
          </button>

          <div className="admin-heading">

            <span>
              HJ GROUPS
            </span>

            <h1>
              Admin Login
            </h1>

            <p>
              Administrator access
            </p>

          </div>

          <form
            className="admin-form"
            onSubmit={handleLogin}
          >

            <label>
              Password
            </label>

            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />

            <button
              type="submit"
              className="admin-save"
            >
              Login
            </button>

            {error && (
              <div className="admin-error">
                {error}
              </div>
            )}

          </form>

        </div>

      </div>
    )
  }

  return (
    <div className="admin-page">

      <div className="admin-header">

        <div className="admin-logo">
          HJ GROUPS
        </div>

        <div className="admin-title">
          ADMIN PANEL
        </div>

      </div>

      <div className="admin-container">

        <button
          className="admin-back"
          onClick={onBack}
        >
          ← Back to Website
        </button>

        <div className="admin-heading">

          <span>
            HJ GROUPS
          </span>

          <h1>
            Add New Episode
          </h1>

          <p>
            Upload and manage your audio stories.
          </p>

        </div>

        <form
          className="admin-form"
          onSubmit={handleSaveEpisode}
        >

          <label>
            Existing Story
          </label>

          <select
            value={selectedStory}
            onChange={(event) =>
              setSelectedStory(
                event.target.value
              )
            }
          >

            <option value="">
              + Create New Story
            </option>

            {stories.map((story) => (
              <option
                key={story.id}
                value={story.id}
              >
                {story.title}
              </option>
            ))}

          </select>


          {!selectedStory && (
            <>
              <label>
                New Story Name
              </label>

              <input
                type="text"
                placeholder="Example: ஆதிஒளியின் அதிசய மாணவன்"
                value={storyName}
                onChange={(event) =>
                  setStoryName(
                    event.target.value
                  )
                }
              />

              <label>
                Genre
              </label>

              <select
                value={genre}
                onChange={(event) =>
                  setGenre(
                    event.target.value
                  )
                }
              >
                <option>
                  Fantasy
                </option>

                <option>
                  Action
                </option>

                <option>
                  Adventure
                </option>

                <option>
                  Romance
                </option>

                <option>
                  System
                </option>

                <option>
                  Mystery
                </option>
              </select>
            </>
          )}


          <label>
            Episode Number
          </label>

          <input
            type="number"
            min="1"
            placeholder="Example: 1"
            value={episodeNumber}
            onChange={(event) =>
              setEpisodeNumber(
                event.target.value
              )
            }
          />


          <label>
            Episode Title
          </label>

          <input
            type="text"
            placeholder="Example: The Beginning"
            value={episodeTitle}
            onChange={(event) =>
              setEpisodeTitle(
                event.target.value
              )
            }
          />


          <label>
            Audio File
          </label>

          <input
            id="audio-file"
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
            onChange={(event) =>
              setAudioFile(
                event.target.files?.[0] || null
              )
            }
          />

          {audioFile && (
            <div className="selected-file">
              Selected:
              {' '}
              {audioFile.name}
            </div>
          )}


          <button
            type="submit"
            className="admin-save"
            disabled={loading}
          >
            {loading
              ? 'Uploading...'
              : 'Upload & Save Episode'}
          </button>


          {message && (
            <div className="admin-success">
              {message}
            </div>
          )}

          {error && (
            <div className="admin-error">
              {error}
            </div>
          )}

        </form>

      </div>

    </div>
  )
}

export default Admin