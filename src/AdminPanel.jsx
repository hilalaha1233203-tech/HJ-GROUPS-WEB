import FileUploadField from './components/FileUploadField'
import { resolveAccessType } from './lib/accessControl'
import { normalizeContentAccessSettings } from './lib/contentAccessSettings'
import { normalizeShortenerSettings } from './lib/shortenerProviders'
import { supabase } from './supabase'
import React, { useEffect, useState } from 'react'

const makeAdminEntityId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000)

// The streaming service is deployed separately. Configure its public URL in VITE_STREAMING_SERVER_URL.
const STREAMING_SERVER_URL = String(import.meta.env.VITE_STREAMING_SERVER_URL || '')
  .trim()
  .replace(/\/+$/, '')


const ADMIN_SETTINGS_KEY = 'hj_admin_settings_v1'

const DEFAULT_ADMIN_SETTINGS = Object.freeze({
  website: {
    siteName: 'HJ GROUPS',
    tagline: 'Stories, Books & Videos',
    supportEmail: '',
    logoUrl: '',
    maintenanceMode: false,
    allowNewSignup: true,
    allowOtpSignup: true,
  },
  content: {
    defaultAudioAccess: ['free'],
    defaultBookAccess: ['free'],
    defaultVideoAccess: ['free'],
    freeAudioEpisodes: 10,
    freeVideoEpisodes: 10,
    freeBookPages: 50,
    listenOnlyMode: true,
  },
  ads: {
    enabled: false,
    provider: '',
    publisherId: '',
    rewardedAdUnitId: '',
    interstitialAdUnitId: '',
    unlockDurationMinutes: 360,
    shortenerEnabled: false,
    primaryShortener: 'earn4link',
    fallbackShortener: 'shrinkme',
  },
  payments: {
    enabled: false,
    provider: '',
    currency: 'INR',
    merchantId: '',
    publishableKey: '',
    checkoutUrl: '',
    premiumMonthly: '',
    storyLifetime: '',
    allStories1Month: '',
    allStories2Month: '',
    allStoriesLifetime: '',
    secretConfigured: false,
  },
})

const readAdminSettings = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || '{}')
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      ...stored,
      website: { ...DEFAULT_ADMIN_SETTINGS.website, ...(stored?.website || {}) },
      content: {
        ...DEFAULT_ADMIN_SETTINGS.content,
        ...normalizeContentAccessSettings(stored?.content || {}),
        ...(stored?.content || {}),
      },
      ads: { ...DEFAULT_ADMIN_SETTINGS.ads, ...(stored?.ads || {}) },
      payments: { ...DEFAULT_ADMIN_SETTINGS.payments, ...(stored?.payments || {}) },
    }
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_ADMIN_SETTINGS))
  }
}

const GENRE_OPTIONS = [
  'Fantasy', 'Action', 'Adventure', 'Romance', 'Mystery', 'Thriller',
  'Sci-Fi', 'Horror', 'Comedy', 'Drama', 'Historical', 'Mythology',
  'Crime', 'Supernatural', 'System', 'Isekai', 'Cultivation',
  'Martial Arts', 'School', 'Family', 'Spiritual', 'Kids', 'Biography',
  'Other',
]

const BOOK_GENRE_OPTIONS = [
  'Tamil Literature', 'Fiction', 'Fantasy', 'Action', 'Adventure',
  'Romance', 'Mystery', 'Thriller', 'Sci-Fi', 'Horror', 'Comedy',
  'Drama', 'Historical', 'Mythology', 'Crime', 'Supernatural',
  'Self Help', 'Biography', 'Education', 'Children', 'Poetry', 'Other',
]

const VIDEO_GENRE_OPTIONS = [
  'Action', 'Adventure', 'Drama', 'Romance', 'Comedy', 'Thriller',
  'Mystery', 'Crime', 'Horror', 'Sci-Fi', 'Fantasy', 'Historical',
  'Documentary', 'Short Film', 'Music', 'Kids', 'Family', 'Animation',
  'Educational', 'Other',
]

const LANGUAGE_OPTIONS = [
  'Tamil', 'English', 'Hindi', 'Malayalam', 'Telugu', 'Kannada',
  'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu', 'Odia',
  'Assamese', 'Sanskrit', 'Other',
]

function AccessTypeSelect({ groupName, value, onChange }) {
  const options = [
    { value: 'free', label: 'Free' },
    { value: 'vip', label: 'VIP' },
    { value: 'premium', label: 'Premium' },
    { value: 'ads', label: 'Ads' },
  ]

  const selectedValues = Array.isArray(value)
    ? value
    : (typeof value === 'string' && value ? [value] : ['free'])

  const toggle = (type, checked) => {
    let next = checked
      ? [...new Set([...selectedValues, type])]
      : selectedValues.filter((item) => item !== type)

    if (!next.length) next = ['free']
    onChange(next)
  }

  return (
    <div className="access-type-field">
      <span className="access-type-label">Access Types</span>
      <div className="access-type-options">
        {options.map((option) => (
          <label key={option.value} className="access-type-option">
            <input
              type="checkbox"
              name={`${groupName}_${option.value}`}
              checked={selectedValues.includes(option.value)}
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}
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

  const [tab, setTab] = useState('overview')

  const [adminSettings, setAdminSettings] = useState(() => readAdminSettings())
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadCloudSettings = async () => {
      setSettingsLoading(true)
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('id', 'hj_admin_settings')
          .maybeSingle()

        if (error) {
          const message = String(error.message || '')
          if (/could not find the table|schema cache|relation .* does not exist/i.test(message)) {
            return
          }
          console.warn('Cloud admin settings load failed:', error.message)
          return
        }

        if (mounted && data?.value && typeof data.value === 'object') {
          const stored = data.value
          setAdminSettings({
            ...DEFAULT_ADMIN_SETTINGS,
            ...stored,
            website: { ...DEFAULT_ADMIN_SETTINGS.website, ...(stored.website || {}) },
            content: {
              ...DEFAULT_ADMIN_SETTINGS.content,
              ...normalizeContentAccessSettings(stored.content || {}),
              ...(stored.content || {}),
            },
            ads: normalizeShortenerSettings({ ...DEFAULT_ADMIN_SETTINGS.ads, ...(stored.ads || {}) }),
            payments: { ...DEFAULT_ADMIN_SETTINGS.payments, ...(stored.payments || {}) },
          })
          try {
            localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(stored))
          } catch {}
        }
      } catch (error) {
        console.warn('Cloud admin settings unavailable:', error)
      } finally {
        if (mounted) setSettingsLoading(false)
      }
    }

    loadCloudSettings()

    return () => {
      mounted = false
    }
  }, [])

  const updateAdminSetting = (section, key, value) => {
    setAdminSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }))
    setSettingsDirty(true)
  }

  const saveAdminSettings = async () => {
    try {
      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(adminSettings))
      setEpisodeAccessType(adminSettings.content.defaultAudioAccess)
      setBookAccessType(adminSettings.content.defaultBookAccess)
      setVideoAccessType(adminSettings.content.defaultVideoAccess)
      setBulkDefaultAccessType(adminSettings.content.defaultAudioAccess)
      setVideoBulkDefaultAccessType(adminSettings.content.defaultVideoAccess)
      setBookBulkDefaultAccessType(adminSettings.content.defaultBookAccess)
      const { error: cloudError } = await supabase
        .from('app_settings')
        .upsert({
          id: 'hj_admin_settings',
          value: adminSettings,
          updated_at: new Date().toISOString(),
        })

      if (cloudError) throw cloudError

      const preview = normalizeContentAccessSettings(adminSettings.content)
      const { error: previewError } = await supabase
        .from('content_access_settings')
        .upsert({
          id: 'default',
          audio_free_episodes: preview.freeAudioEpisodes,
          video_free_episodes: preview.freeVideoEpisodes,
          book_free_pages: preview.freeBookPages,
          ad_unlock_duration_minutes: Math.min(1440, Math.max(1, Number(adminSettings.ads.unlockDurationMinutes) || 360)),
          updated_at: new Date().toISOString(),
        })

      if (previewError) throw previewError
      showToast('Management settings saved')

      setSettingsDirty(false)
    } catch (error) {
      console.error('Admin settings save error:', error)
      showToast('Could not save management settings', 'error')
    }
  }

  const resetAdminSettings = () => {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_ADMIN_SETTINGS))
    setAdminSettings(defaults)
    try {
      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(defaults))
      setEpisodeAccessType(defaults.content.defaultAudioAccess)
      setBookAccessType(defaults.content.defaultBookAccess)
      setVideoAccessType(defaults.content.defaultVideoAccess)
      setBulkDefaultAccessType(defaults.content.defaultAudioAccess)
      setVideoBulkDefaultAccessType(defaults.content.defaultVideoAccess)
      setBookBulkDefaultAccessType(defaults.content.defaultBookAccess)
      setSettingsDirty(false)
      showToast('Management settings reset')
    } catch {
      setSettingsDirty(true)
      showToast('Settings reset in memory only', 'error')
    }
  }

  const totalEpisodes = stories.reduce(
    (sum, story) => sum + (story?.episodes?.length || 0),
    0
  )
  const premiumStories = stories.filter(
    (story) => resolveAccessType(story).some((type) => ['vip', 'premium'].includes(type))
  ).length
  const totalBooks = books.length
  const totalVideos = videoStories.length

  const [editingStoryId, setEditingStoryId] = useState(null)
  const [editingBookId, setEditingBookId] = useState(null)
  const [editingVideoId, setEditingVideoId] = useState(null)
  const [editingEpisode, setEditingEpisode] = useState(null)

  /* =====================================================
     STORY FORM
  ===================================================== */

  const [storyTitle, setStoryTitle] = useState('')
  const [storyGenre, setStoryGenre] = useState('Fantasy')
  const [storyLanguage, setStoryLanguage] = useState('Tamil')
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
  const [episodeAccessType, setEpisodeAccessType] = useState(() => readAdminSettings().content.defaultAudioAccess)
  const [episodeLanguage, setEpisodeLanguage] = useState('Tamil')

  /* =====================================================
     BULK TELEGRAM IMPORT
  ===================================================== */
  const [bulkStoryId, setBulkStoryId] = useState('')
  const [bulkMessages, setBulkMessages] = useState([])
  const [bulkSelectedIds, setBulkSelectedIds] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkTitleOverrides, setBulkTitleOverrides] = useState({})
  const [bulkNumberOverrides, setBulkNumberOverrides] = useState({})
  const [bulkAccessTypes, setBulkAccessTypes] = useState({})
  const [bulkDefaultAccessType, setBulkDefaultAccessType] = useState(() => readAdminSettings().content.defaultAudioAccess)

  /* =====================================================
     BOOK FORM
  ===================================================== */

  const [bookTitle, setBookTitle] = useState('')
  const [bookAuthor, setBookAuthor] = useState('')
  const [bookDescription, setBookDescription] = useState('')
  const [bookType, setBookType] = useState('pdf')
  const [bookCategory, setBookCategory] = useState('Tamil Literature')
  const [bookLanguage, setBookLanguage] = useState('Tamil')
  const [bookCover, setBookCover] = useState('')
  const [bookCoverUploading, setBookCoverUploading] = useState(false)
 const [bookFile, setBookFile] = useState('')
const [bookFilePath, setBookFilePath] = useState('')
const [bookFileUploading, setBookFileUploading] = useState(false)

const [bookCoverPath, setBookCoverPath] = useState('')

const [bookAccessType, setBookAccessType] = useState(() => readAdminSettings().content.defaultBookAccess)
  const [bookTelegramUrl, setBookTelegramUrl] = useState('')

  // Multi-volume books: one parent book can contain many PDF/EPUB volumes.
  const [bookVolumes, setBookVolumes] = useState([])
  const [bookVolumeUploading, setBookVolumeUploading] = useState(false)
  const [volumeBookId, setVolumeBookId] = useState('')
  const [volumeTitle, setVolumeTitle] = useState('')
  const [volumeFile, setVolumeFile] = useState('')
  const [volumeFilePath, setVolumeFilePath] = useState('')


  const addBookVolume = () => {
    setBookVolumes(prev => [...prev, { id: makeAdminEntityId(), title: `Volume ${prev.length + 1}`, file: '', filePath: '' }])
  }
  const updateBookVolume = (id, patch) => {
    setBookVolumes(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v))
  }
  const removeBookVolume = (id) => {
    setBookVolumes(prev => prev.filter(v => v.id !== id))
  }

  const extractTelegramMessageId = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const parts = raw.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || ''
    return /^\d+$/.test(last) ? Number(last) : null
  }

  const extractStreamingMessageId = (value) => {
    const match = String(value || '').match(/\/(?:audio|video|document)\/message\/(\d+)/i)
    return match ? Number(match[1]) : null
  }

  const resetAddVolumeForm = () => {
    setVolumeBookId('')
    setVolumeTitle('')
    setVolumeFile('')
    setVolumeFilePath('')
  }

  const submitVolumeToExistingBook = (event) => {
    event.preventDefault()
    const book = books.find((item) => String(item.id) === String(volumeBookId))
    if (!book) {
      alert('Select a book first')
      return
    }
    if (!volumeTitle.trim() || !volumeFile.trim()) {
      alert('Volume name and file are required')
      return
    }
    const existingVolumes = Array.isArray(book.volumes) ? book.volumes : []
    const nextNumber = existingVolumes.length + 1
    const nextVolume = {
      number: nextNumber,
      title: volumeTitle.trim(),
      file: volumeFile.trim(),
      filePath: volumeFilePath || '',
      type: book.type || 'pdf',
    }
    onUpdateBook(book.id, {
      ...book,
      volumes: [...existingVolumes, nextVolume],
    })
    showToast(`Volume ${nextNumber} added to ${book.title}`)
    resetAddVolumeForm()
  }

  /* =====================================================
     VIDEO FORM
  ===================================================== */

  const [videoTitle, setVideoTitle] = useState('')
  const [videoCategory, setVideoCategory] = useState('Action')
  const [videoLanguage, setVideoLanguage] = useState('Tamil')
  const [videoCover, setVideoCover] = useState('')
  const [videoCoverUploading, setVideoCoverUploading] = useState(false)
  const [videoSrc, setVideoSrc] = useState('')
  const [videoFileUploading, setVideoFileUploading] = useState(false)
  const [videoAccessType, setVideoAccessType] = useState(() => readAdminSettings().content.defaultVideoAccess)
  const [videoEpisodeTitle, setVideoEpisodeTitle] = useState('Episode 01')
  const [videoTelegramUrl, setVideoTelegramUrl] = useState('')
  
  const [videoBulkMessages, setVideoBulkMessages] = useState([])
  const [videoBulkSelectedIds, setVideoBulkSelectedIds] = useState([])
  const [videoBulkLoading, setVideoBulkLoading] = useState(false)
  const [videoBulkTitleOverrides, setVideoBulkTitleOverrides] = useState({})
  const [videoBulkNumberOverrides, setVideoBulkNumberOverrides] = useState({})
  const [bulkVideoStoryId, setBulkVideoStoryId] = useState('')
  const [videoBulkAccessTypes, setVideoBulkAccessTypes] = useState({})
  const [videoBulkDefaultAccessType, setVideoBulkDefaultAccessType] = useState(() => readAdminSettings().content.defaultVideoAccess)

  /* =====================================================
     BOOK BULK TELEGRAM IMPORT
  ===================================================== */
  const [bookBulkMessages, setBookBulkMessages] = useState([])
  const [bookBulkSelectedIds, setBookBulkSelectedIds] = useState([])
  const [bookBulkLoading, setBookBulkLoading] = useState(false)
  const [bookBulkTitleOverrides, setBookBulkTitleOverrides] = useState({})
  const [bookBulkTypeOverrides, setBookBulkTypeOverrides] = useState({})
  const [bookBulkAccessTypes, setBookBulkAccessTypes] = useState({})
  const [bookBulkDefaultAccessType, setBookBulkDefaultAccessType] = useState(() => readAdminSettings().content.defaultBookAccess)

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

      const res = await fetch(`${STREAMING_SERVER_URL}/telegram/messages`, {
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
         setBulkAccessTypes({})
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

    const story = stories.find((s) => String(s.id) === String(bulkStoryId))
    if (!story) {
      showToast('Story not found', 'error')
      return
    }

    const existingMsgIds = new Set(
      (story.episodes || [])
        .map((episode) => episode.telegram_message_id || extractStreamingMessageId(episode.src))
        .filter((id) => Number.isFinite(Number(id)))
        .map(Number)
    )

    let maxEpisodeNumber = (story.episodes || []).reduce(
      (max, episode) => Math.max(max, Number(episode.number) || 0),
      0
    )

    const selectedMsgs = bulkSelectedIds
      .map((id) => bulkMessages.find((message) => String(message.messageId) === String(id)))
      .filter(Boolean)

    let importedCount = 0
    let skippedCount = 0
    let failedCount = 0

    try {
      for (const msg of selectedMsgs) {
        const messageId = Number(msg.messageId)

        if (!Number.isFinite(messageId) || existingMsgIds.has(messageId)) {
          skippedCount++
          continue
        }

        const overrideNumber = Number(bulkNumberOverrides[msg.messageId])
        const finalNumber = Number.isFinite(overrideNumber) && overrideNumber > 0
          ? overrideNumber
          : maxEpisodeNumber + 1

        const finalTitle = String(
          bulkTitleOverrides[msg.messageId] ??
          msg.caption ??
          msg.fileName ??
          'Untitled Episode'
        ).trim()

        const episode = {
          number: finalNumber,
          title: finalTitle || 'Untitled Episode',
          type: 'audio',
          src: '',
          telegram_message_id: messageId,
          available: true,
          accessType: bulkAccessTypes[msg.messageId] || bulkDefaultAccessType,
        }

        try {
          // Always go through App.jsx's persistence callback. This correctly
          // converts tg-story-<id> into the real Supabase story id and also
          // refreshes the Telegram catalogue after a successful insert.
          await onAddEpisode(story.id, episode)
          importedCount++
          existingMsgIds.add(messageId)
          maxEpisodeNumber = Math.max(maxEpisodeNumber, finalNumber)
        } catch (error) {
          failedCount++
          console.error('Telegram episode import failed:', {
            storyId: story.id,
            messageId,
            error,
          })
        }
      }

      setBulkSelectedIds([])

      if (failedCount > 0) {
        showToast(
          `${importedCount} imported, ${failedCount} failed. Check the console for details.`,
          'error'
        )
      } else if (skippedCount > 0) {
        showToast(
          `${importedCount} episodes imported successfully. ${skippedCount} duplicates skipped.`
        )
      } else {
        showToast(`${importedCount} episodes imported successfully`)
      }
    } catch (error) {
      console.error('Error during bulk Telegram import:', error)
      showToast('Telegram import failed. Check console.', 'error')
    }
  }

  const resetStoryForm = () => {
    setEditingStoryId(null)
    setStoryTitle('')
    setStoryGenre('Fantasy')
    setStoryLanguage('Tamil')
    setStoryCover('')
    setStoryDescription('')
  }

  const startEditStory = (story) => {
    setEditingStoryId(story.id)
    setStoryTitle(story.title || '')
    setStoryGenre(story.genre || 'Fantasy')
    setStoryLanguage(story.language || 'Tamil')
    setStoryCover(story.cover || '')
    setStoryDescription(story.description || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showToast('Editing story — form moved to top')
  }

  const submitStory = async (event) => {
    event.preventDefault()

    if (!storyTitle.trim() || !storyCover.trim()) {
      showToast('Title and a cover image are required', 'error')
      return
    }

    try {
      if (editingStoryId) {
        await onUpdateStory(editingStoryId, {
          title: storyTitle.trim(),
          genre: storyGenre,
          language: storyLanguage,
          cover: storyCover.trim(),
          description: storyDescription.trim(),
        })
        showToast('Story updated successfully')
      } else {
        await onAddStory({
          title: storyTitle.trim(),
          genre: storyGenre,
          language: storyLanguage,
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

  const submitEpisode = async (event) => {
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
        await onUpdateEpisode(editingEpisode.storyId, Number(editingEpisode.originalNumber), data)
        showToast('Episode updated successfully')
      } else {
        await onAddEpisode(episodeStoryId, data)
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
  setBookCategory('Tamil Literature')
  setBookLanguage('Tamil')
  setBookCover('')
  setBookCoverPath('')
  setBookFile('')
  setBookFilePath('')
  setBookAccessType('free')
  setBookTelegramUrl('')
  setBookVolumes([])
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
  setBookTelegramUrl(book.telegram_message_id ? `https://t.me/c/id/${book.telegram_message_id}` : '')

  setBookAccessType(resolveAccessType(book))
  setBookVolumes(Array.isArray(book.volumes) ? book.volumes.map((v, index) => ({ id: makeAdminEntityId() + index, title: v.title || `Volume ${index + 1}`, file: v.file || '', filePath: v.filePath || '' })) : [])

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

 const submitBook = async (event) => {
  event.preventDefault()

  const bookTelegramMessageId = extractTelegramMessageId(bookTelegramUrl)
  const validVolumes = bookVolumes.filter(v => v.file && v.file.trim())
  if (!bookTitle.trim() || !bookCover.trim() || (!bookFile.trim() && !bookTelegramMessageId && validVolumes.length === 0)) {
    alert('Title, cover image and either a Telegram message URL, a book upload, or at least one volume are required')
    return
  }

  if (bookTelegramUrl.trim() && !bookTelegramMessageId) {
    alert('Invalid Telegram URL. Make sure it ends with the message ID.')
    return
  }

  const data = {
    title: bookTitle.trim(),
    author: bookAuthor.trim(),
    description: bookDescription.trim(),
    type: bookType,
    category: bookCategory,
    language: bookLanguage,

    cover: bookCover.trim(),
    coverPath: bookCoverPath || '',

    file: bookFile.trim(),
    filePath: bookFilePath || '',

    accessType: bookAccessType,
    telegram_message_id: bookTelegramMessageId,
    volumes: validVolumes.map((v, index) => ({
      number: index + 1,
      title: (v.title || `Volume ${index + 1}`).trim(),
      file: v.file.trim(),
      filePath: v.filePath || '',
      type: bookType,
    })),
  }

  try {
    if (editingBookId) {
      await onUpdateBook(editingBookId, data)
    } else {
      await onAddBook({
        id: makeAdminEntityId(),
        ...data,
      })
    }
    resetBookForm()
  } catch (error) {
    console.error('Error saving book:', error)
    alert(`Error saving book: ${error?.message || error}`)
  }
}
  /* =====================================================
     VIDEO
  ===================================================== */

  const handleScanVideoTelegram = async () => {
    setVideoBulkLoading(true)
    showToast('Scanning Telegram videos...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast('Not authenticated', 'error')
        return
      }

      const res = await fetch(`${STREAMING_SERVER_URL}/telegram/messages?type=video`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (!res.ok) {
        showToast('Unable to load Telegram videos', 'error')
        return
      }

      const msgs = await res.json()
      setVideoBulkMessages(Array.isArray(msgs) ? msgs : [])
      setVideoBulkSelectedIds([])
      setVideoBulkTitleOverrides({})
      setVideoBulkNumberOverrides({})
      setVideoBulkAccessTypes({})
      showToast(Array.isArray(msgs) && msgs.length ? 'Telegram videos loaded' : 'No Telegram videos found')
    } catch (error) {
      console.error(error)
      showToast('Unable to connect to Telegram server', 'error')
    } finally {
      setVideoBulkLoading(false)
    }
  }

  const handleVideoBulkToggle = (messageId) => {
    setVideoBulkSelectedIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    )
  }

  const handleVideoBulkToggleAll = () => {
    if (videoBulkSelectedIds.length === videoBulkMessages.length) {
      setVideoBulkSelectedIds([])
    } else {
      setVideoBulkSelectedIds(videoBulkMessages.map((msg) => msg.messageId))
    }
  }

  const handleVideoBulkTitleChange = (messageId, title) => {
    setVideoBulkTitleOverrides((prev) => ({ ...prev, [messageId]: title }))
  }

  const handleVideoBulkNumberChange = (messageId, number) => {
    setVideoBulkNumberOverrides((prev) => ({ ...prev, [messageId]: number }))
  }

  const handleVideoBulkImport = async () => {
    if (!bulkVideoStoryId) {
      showToast('Select a video story first', 'error')
      return
    }
    if (!videoBulkSelectedIds.length) {
      showToast('Select at least one Telegram video', 'error')
      return
    }

    const story = videoStories.find((item) => String(item.id) === String(bulkVideoStoryId))
    if (!story) {
      showToast('Video story not found', 'error')
      return
    }

    const existingIds = new Set(
      (story.episodes || [])
        .map((ep) => ep.telegram_message_id || extractStreamingMessageId(ep.src))
        .filter((id) => Number.isFinite(Number(id)))
        .map(Number)
    )
    let maxNumber = Math.max(0, ...(story.episodes || []).map((ep) => Number(ep.number) || 0))
    let importedCount = 0
    let skippedCount = 0
    let failedCount = 0

    const selected = videoBulkSelectedIds
      .map((id) => videoBulkMessages.find((msg) => String(msg.messageId) === String(id)))
      .filter(Boolean)

    for (const msg of selected) {
      const messageId = Number(msg.messageId)
      if (!Number.isFinite(messageId) || existingIds.has(messageId)) {
        skippedCount++
        continue
      }

      const overrideNumber = Number(videoBulkNumberOverrides[msg.messageId])
      const number = Number.isFinite(overrideNumber) && overrideNumber > 0
        ? overrideNumber
        : maxNumber + 1
      const title = String(
        videoBulkTitleOverrides[msg.messageId] ??
        msg.caption ??
        msg.fileName ??
        `Episode ${String(number).padStart(2, '0')}`
      ).trim() || `Episode ${String(number).padStart(2, '0')}`

      try {
        await onAddVideoEpisode(Number(bulkVideoStoryId), {
          number,
          title,
          type: 'video',
          telegram_message_id: messageId,
          src: '',
          filePath: '',
          available: true,
          accessType: videoBulkAccessTypes[msg.messageId] || videoBulkDefaultAccessType,
        })
        importedCount++
        existingIds.add(messageId)
        maxNumber = Math.max(maxNumber, number)
      } catch (error) {
        failedCount++
        console.error('Video bulk import error:', {
          videoStoryId: bulkVideoStoryId,
          messageId,
          error,
        })
      }
    }

    setVideoBulkSelectedIds([])

    if (failedCount) {
      showToast(`${importedCount} imported, ${failedCount} failed, ${skippedCount} duplicates skipped. Check the console.`, 'error')
    } else if (skippedCount) {
      showToast(`${importedCount} videos imported successfully. ${skippedCount} duplicates skipped.`)
    } else {
      showToast(`${importedCount} videos imported successfully`)
    }
  }


  const handleScanBookTelegram = async () => {
    setBookBulkLoading(true)
    showToast('Scanning Telegram documents...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast('Not authenticated', 'error')
        return
      }

      const res = await fetch(`${STREAMING_SERVER_URL}/telegram/messages?type=document`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (!res.ok) {
        showToast('Unable to load Telegram documents', 'error')
        return
      }

      const msgs = await res.json()
      const documents = Array.isArray(msgs) ? msgs.filter((msg) => {
        const name = String(msg.fileName || '').toLowerCase()
        const mime = String(msg.mimeType || '').toLowerCase()
        return name.endsWith('.pdf') || name.endsWith('.epub') ||
          mime === 'application/pdf' || mime === 'application/epub+zip'
      }) : []

      setBookBulkMessages(documents)
      setBookBulkSelectedIds([])
      setBookBulkTitleOverrides({})
      setBookBulkTypeOverrides({})
      setBookBulkAccessTypes({})
      showToast(documents.length ? 'Telegram books loaded' : 'No PDF/EPUB Telegram documents found')
    } catch (error) {
      console.error(error)
      showToast('Unable to connect to Telegram server', 'error')
    } finally {
      setBookBulkLoading(false)
    }
  }

  const handleBookBulkToggle = (messageId) => {
    setBookBulkSelectedIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    )
  }

  const handleBookBulkToggleAll = () => {
    if (bookBulkSelectedIds.length === bookBulkMessages.length) {
      setBookBulkSelectedIds([])
    } else {
      setBookBulkSelectedIds(bookBulkMessages.map((msg) => msg.messageId))
    }
  }

  const handleBookBulkTitleChange = (messageId, title) => {
    setBookBulkTitleOverrides((prev) => ({ ...prev, [messageId]: title }))
  }

  const handleBookBulkTypeChange = (messageId, type) => {
    setBookBulkTypeOverrides((prev) => ({ ...prev, [messageId]: type }))
  }

  const handleBookBulkImport = async () => {
    if (!bookBulkSelectedIds.length) {
      showToast('Select at least one Telegram book', 'error')
      return
    }

    const selected = bookBulkSelectedIds
      .map((id) => bookBulkMessages.find((msg) => String(msg.messageId) === String(id)))
      .filter(Boolean)

    const importedTitles = new Set(
      books.map((book) => String(book.title || '').trim().toLowerCase()).filter(Boolean)
    )
    let importedCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const msg of selected) {
      const title = String(
        bookBulkTitleOverrides[msg.messageId] ?? msg.caption ?? msg.fileName ?? 'Untitled Book'
      ).trim() || 'Untitled Book'

      const key = title.toLowerCase()
      if (importedTitles.has(key)) {
        skippedCount++
        continue
      }

      const fileName = String(msg.fileName || '').toLowerCase()
      const mime = String(msg.mimeType || '').toLowerCase()
      const inferredType = (fileName.endsWith('.epub') || mime === 'application/epub+zip') ? 'epub' : 'pdf'
      const type = bookBulkTypeOverrides[msg.messageId] || inferredType
      const messageId = Number(msg.messageId)

      try {
        await onAddBook({
          id: makeAdminEntityId() + messageId,
          title,
          author: '',
          description: '',
          type,
          category: 'Tamil Stories',
          cover: '',
          coverPath: '',
          file: '',
          filePath: '',
          telegram_message_id: messageId,
          accessType: bookBulkAccessTypes[msg.messageId] || bookBulkDefaultAccessType,
          volumes: [],
        })
        importedCount++
        importedTitles.add(key)
      } catch (error) {
        failedCount++
        console.error('Telegram book import failed:', { messageId, error })
      }
    }

    setBookBulkSelectedIds([])

    if (failedCount) {
      showToast(`${importedCount} imported, ${failedCount} failed, ${skippedCount} duplicates skipped. Check the console.`, 'error')
    } else if (skippedCount) {
      showToast(`${importedCount} books imported successfully. ${skippedCount} duplicates skipped.`)
    } else {
      showToast(`${importedCount} books imported successfully`)
    }
  }

  const resetVideoForm = () => {
    setEditingVideoId(null)
    setVideoTitle('')
    setVideoCategory('Action')
    setVideoLanguage('Tamil')
    setVideoCover('')
    setVideoSrc('')
    setVideoAccessType('free')
    setVideoEpisodeTitle('Episode 01')
    setVideoTelegramUrl('')
    setVideoBulkMessages([])
    setVideoBulkSelectedIds([])
    setVideoBulkTitleOverrides({})
    setVideoBulkNumberOverrides({})
  }

  const startEditVideo = (video) => {
    setEditingVideoId(video.id)
    setVideoTitle(video.title || '')
    setVideoCategory(video.category || 'Action')
    setVideoLanguage(video.language || 'Tamil')
    setVideoCover(video.cover || '')

    const firstEpisode = video.episodes?.[0]
    setVideoSrc(firstEpisode?.src || '')
    setVideoEpisodeTitle(firstEpisode?.title || 'Episode 01')
    setVideoTelegramUrl(firstEpisode?.telegram_message_id ? `https://t.me/c/id/${firstEpisode.telegram_message_id}` : '')
    setVideoAccessType(resolveAccessType(video))

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitVideo = async (event) => {
    event.preventDefault()

    const videoTelegramMessageId = extractTelegramMessageId(videoTelegramUrl)
    if (!videoTitle.trim() || !videoCover.trim() || (!videoSrc.trim() && !videoTelegramMessageId)) {
      alert('Title, cover image and either a Telegram video URL or a video upload are required')
      return
    }

    if (videoTelegramUrl.trim() && !videoTelegramMessageId) {
      alert('Invalid Telegram URL. Make sure it ends with the message ID.')
      return
    }

    try {
    if (editingVideoId) {
      const currentVideo = videoStories.find((video) => video.id === editingVideoId)

      await onUpdateVideo(editingVideoId, {
        title: videoTitle.trim(),
        category: videoCategory,
        language: videoLanguage,
        cover: videoCover.trim(),
        accessType: videoAccessType,
      })

      if (currentVideo?.episodes?.length) {
        await onUpdateVideoEpisode(editingVideoId, currentVideo.episodes[0].number, {
          title: videoEpisodeTitle.trim(),
          src: videoSrc.trim(),
          type: 'video',
          available: true,
          accessType: videoAccessType,
          telegram_message_id: videoTelegramMessageId,
        })
      } else {
        await onAddVideoEpisode(editingVideoId, {
          number: 1,
          title: videoEpisodeTitle.trim(),
          type: 'video',
          src: videoSrc.trim(),
          available: true,
          accessType: videoAccessType,
          telegram_message_id: videoTelegramMessageId,
        })
      }
    } else {
      await onAddVideo({
        id: makeAdminEntityId(),
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
            telegram_message_id: videoTelegramMessageId,
          },
        ],
      })
    }

    } catch (error) {
      console.error('Error saving video:', error)
      alert(`Error saving video: ${error?.message || error}`)
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
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>⌂ Overview</button>
        <button className={tab === 'stories' ? 'active' : ''} onClick={() => setTab('stories')}>🎧 Audio Stories</button>
        <button className={tab === 'books' ? 'active' : ''} onClick={() => setTab('books')}>📚 Books</button>
        <button className={tab === 'videos' ? 'active' : ''} onClick={() => setTab('videos')}>🎬 Videos</button>
        <button className={`admin-settings-tab-button ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>⚙ Management & Settings</button>
      </div>

      <div className="admin-body">
        {tab === 'overview' && (
          <section className="admin-overview">
            <div className="admin-overview-intro">
              <div>
                <div className="admin-eyebrow">HJ GROUPS CONTENT STUDIO</div>
                <h2>Control your streaming library</h2>
                <p>Manage audio stories, episodes, books and video stories from one workspace.</p>
              </div>
              <div className="admin-status-chip">
                <span />
                Live content console
              </div>
            </div>

            <div className="admin-stat-grid">
              <div className="admin-stat-card">
                <span className="admin-stat-icon">🎧</span>
                <small>Audio Stories</small>
                <strong>{stories.length}</strong>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">▶</span>
                <small>Total Episodes</small>
                <strong>{totalEpisodes}</strong>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">♛</span>
                <small>Premium / VIP</small>
                <strong>{premiumStories}</strong>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">📚</span>
                <small>Books</small>
                <strong>{totalBooks}</strong>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">🎬</span>
                <small>Video Stories</small>
                <strong>{totalVideos}</strong>
              </div>
            </div>

            <div className="admin-overview-grid">
              <div className="admin-overview-card">
                <div className="admin-overview-card-head">
                  <div>
                    <small>QUICK ACTIONS</small>
                    <h3>Content management</h3>
                  </div>
                  <span>↗</span>
                </div>
                <div className="admin-quick-actions">
                  <button onClick={() => setTab('stories')}>＋ Add Audio Story</button>
                  <button onClick={() => setTab('stories')}>＋ Add Episode</button>
                  <button onClick={() => setTab('books')}>＋ Add Book</button>
                  <button onClick={() => setTab('videos')}>＋ Add Video Story</button>
                </div>
              </div>

              <div className="admin-overview-card">
                <div className="admin-overview-card-head">
                  <div>
                    <small>RECENT AUDIO STORIES</small>
                    <h3>Current catalogue</h3>
                  </div>
                  <span>{stories.length}</span>
                </div>
                <div className="admin-recent-list">
                  {stories.slice(0, 5).map((story) => (
                    <button key={story.id} onClick={() => setTab('stories')}>
                      <span className="admin-recent-avatar">
                        {story.cover ? <img src={story.cover} alt="" /> : '🎧'}
                      </span>
                      <span>
                        <strong>{story.title}</strong>
                        <small>{story.episodes?.length || 0} episodes · {story.genre || 'Audio Story'}</small>
                      </span>
                      <span>›</span>
                    </button>
                  ))}
                  {!stories.length && (
                    <p className="admin-empty">No audio stories yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================= MANAGEMENT & SETTINGS ================= */}

        {tab === 'settings' && (
          <>
            <section className="admin-section admin-settings-intro">
              <div className="admin-settings-intro-copy">
                <div className="admin-eyebrow">HJ GROUPS CONTROL CENTER</div>
                <h2>Management & Settings</h2>
                <p>Manage content shortcuts, advertising configuration, payment plan details, and website access rules from one place.</p>
              </div>
              <div className={`admin-settings-save-status ${settingsDirty ? 'dirty' : 'saved'}`}>
                {settingsDirty ? '● Unsaved changes' : '✓ Saved'}
              </div>
            </section>

            <section className="admin-settings-grid">
              <div className="admin-settings-card admin-settings-wide">
                <div className="admin-settings-card-head">
                  <div><small>CONTENT MANAGEMENT</small><h3>Edit Audio, Books & Videos</h3></div>
                  <span>✏️</span>
                </div>

                <div className="admin-settings-content-grid">
                  <div className="admin-settings-content-block">
                    <div className="admin-settings-content-title"><span>🎧</span><div><strong>Audio Stories</strong><small>{stories.length} stories · {totalEpisodes} episodes</small></div></div>
                    <button type="button" className="admin-submit" onClick={() => setTab('stories')}>Open Audio Manager</button>
                    <div className="admin-settings-item-list">
                      {stories.slice(0, 5).map((story) => (
                        <div key={story.id} className="admin-settings-item">
                          <span>{story.title}</span>
                          <button type="button" onClick={() => { setTab('stories'); startEditStory(story) }}>✏️ Edit</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="admin-settings-content-block">
                    <div className="admin-settings-content-title"><span>📚</span><div><strong>Books</strong><small>{books.length} books</small></div></div>
                    <button type="button" className="admin-submit" onClick={() => setTab('books')}>Open Books Manager</button>
                    <div className="admin-settings-item-list">
                      {books.slice(0, 5).map((book) => (
                        <div key={book.id} className="admin-settings-item">
                          <span>{book.title}</span>
                          <button type="button" onClick={() => { setTab('books'); startEditBook(book) }}>✏️ Edit</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="admin-settings-content-block">
                    <div className="admin-settings-content-title"><span>🎬</span><div><strong>Videos</strong><small>{videoStories.length} video stories</small></div></div>
                    <button type="button" className="admin-submit" onClick={() => setTab('videos')}>Open Video Manager</button>
                    <div className="admin-settings-item-list">
                      {videoStories.slice(0, 5).map((video) => (
                        <div key={video.id} className="admin-settings-item">
                          <span>{video.title}</span>
                          <button type="button" onClick={() => { setTab('videos'); startEditVideo(video) }}>✏️ Edit</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-settings-card">
                <div className="admin-settings-card-head"><div><small>ADS PROVIDER</small><h3>Rewarded Ads</h3></div><span>📺</span></div>

                <label className="admin-settings-toggle">
                  <input type="checkbox" checked={adminSettings.ads.enabled} onChange={(e) => updateAdminSetting('ads', 'enabled', e.target.checked)} />
                  <span>Enable Ads configuration</span>
                </label>

                <div className="admin-settings-form-grid">
                  <label>Provider
                    <select value={adminSettings.ads.provider} onChange={(e) => updateAdminSetting('ads', 'provider', e.target.value)}>
                      <option value="">Select provider</option><option value="google">Google Ad Manager / AdSense</option><option value="admob">Google AdMob</option><option value="unity">Unity Ads</option><option value="applovin">AppLovin</option><option value="custom">Custom provider</option>
                    </select>
                  </label>
                  <label>Publisher / App ID<input value={adminSettings.ads.publisherId} onChange={(e) => updateAdminSetting('ads', 'publisherId', e.target.value)} placeholder="Publisher / App ID" /></label>
                  <label>Rewarded Ad Unit ID<input value={adminSettings.ads.rewardedAdUnitId} onChange={(e) => updateAdminSetting('ads', 'rewardedAdUnitId', e.target.value)} placeholder="Rewarded placement ID" /></label>
                  <label>Interstitial Ad Unit ID<input value={adminSettings.ads.interstitialAdUnitId} onChange={(e) => updateAdminSetting('ads', 'interstitialAdUnitId', e.target.value)} placeholder="Optional interstitial ID" /></label>
                  <label>Unlock duration (minutes)<input type="number" min="1" max="1440" value={adminSettings.ads.unlockDurationMinutes} onChange={(e) => updateAdminSetting('ads', 'unlockDurationMinutes', Number(e.target.value) || 120)} /></label>
                  <label className="admin-settings-toggle">
                    <input
                      type="checkbox"
                      checked={adminSettings.ads.shortenerEnabled === true}
                      onChange={(e) => updateAdminSetting('ads', 'shortenerEnabled', e.target.checked)}
                    />
                    <span>Enable shortener routing</span>
                  </label>
                  <label>Primary shortener
                    <select
                      value={adminSettings.ads.primaryShortener || 'earn4link'}
                      onChange={(e) => updateAdminSetting('ads', 'primaryShortener', e.target.value)}
                    >
                      <option value="earn4link">Earn4Link</option>
                      <option value="shrinkme">ShrinkMe</option>
                    </select>
                  </label>
                  <label>Fallback shortener
                    <select
                      value={adminSettings.ads.fallbackShortener || ''}
                      onChange={(e) => updateAdminSetting('ads', 'fallbackShortener', e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="earn4link">Earn4Link</option>
                      <option value="shrinkme">ShrinkMe</option>
                    </select>
                  </label>
                  <small className="admin-settings-note">
                    Primary: <strong>{adminSettings.ads.primaryShortener === 'earn4link' ? 'Earn4Link' : 'ShrinkMe'}</strong>
                    {adminSettings.ads.fallbackShortener ? <> → <strong>{adminSettings.ads.fallbackShortener === 'earn4link' ? 'Earn4Link' : 'ShrinkMe'}</strong></> : null}.
                    Routing is disabled by default. Use only for provider-approved link flows; a shortener redirect is not ad-completion proof.
                  </small>
                </div>
                <small className="admin-settings-note">Provider secret/API credentials should stay in Vercel/Supabase server environment variables, not browser storage.</small>
              </div>

              <div className="admin-settings-card">
                <div className="admin-settings-card-head"><div><small>PAYMENTS</small><h3>Checkout & Plans</h3></div><span>💳</span></div>

                <label className="admin-settings-toggle">
                  <input type="checkbox" checked={adminSettings.payments.enabled} onChange={(e) => updateAdminSetting('payments', 'enabled', e.target.checked)} />
                  <span>Enable payment configuration</span>
                </label>

                <div className="admin-settings-form-grid">
                  <label>Provider
                    <select value={adminSettings.payments.provider} onChange={(e) => updateAdminSetting('payments', 'provider', e.target.value)}>
                      <option value="">Select provider</option><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option><option value="phonepe">PhonePe PG</option><option value="stripe">Stripe</option><option value="paypal">PayPal</option><option value="custom">Custom checkout</option>
                    </select>
                  </label>
                  <label>Currency
                    <select value={adminSettings.payments.currency} onChange={(e) => updateAdminSetting('payments', 'currency', e.target.value)}>
                      <option value="INR">INR ₹</option><option value="USD">USD $</option><option value="EUR">EUR €</option>
                    </select>
                  </label>
                  <label>Merchant / Account ID<input value={adminSettings.payments.merchantId} onChange={(e) => updateAdminSetting('payments', 'merchantId', e.target.value)} /></label>
                  <label>Publishable / Public Key<input value={adminSettings.payments.publishableKey} onChange={(e) => updateAdminSetting('payments', 'publishableKey', e.target.value)} /></label>
                  <label className="admin-settings-span-2">Checkout URL<input type="url" value={adminSettings.payments.checkoutUrl} onChange={(e) => updateAdminSetting('payments', 'checkoutUrl', e.target.value)} placeholder="https://..." /></label>
                  <label>Premium 1 Month<input inputMode="decimal" value={adminSettings.payments.premiumMonthly} onChange={(e) => updateAdminSetting('payments', 'premiumMonthly', e.target.value)} placeholder="e.g. 99" /></label>
                  <label>Story Lifetime<input inputMode="decimal" value={adminSettings.payments.storyLifetime} onChange={(e) => updateAdminSetting('payments', 'storyLifetime', e.target.value)} placeholder="e.g. 149" /></label>
                  <label>All Stories 1 Month<input inputMode="decimal" value={adminSettings.payments.allStories1Month} onChange={(e) => updateAdminSetting('payments', 'allStories1Month', e.target.value)} /></label>
                  <label>All Stories 2 Months<input inputMode="decimal" value={adminSettings.payments.allStories2Month} onChange={(e) => updateAdminSetting('payments', 'allStories2Month', e.target.value)} /></label>
                  <label>All Stories Lifetime<input inputMode="decimal" value={adminSettings.payments.allStoriesLifetime} onChange={(e) => updateAdminSetting('payments', 'allStoriesLifetime', e.target.value)} /></label>
                </div>

                <label className="admin-settings-toggle">
                  <input type="checkbox" checked={adminSettings.payments.secretConfigured} onChange={(e) => updateAdminSetting('payments', 'secretConfigured', e.target.checked)} />
                  <span>Payment secret is configured in server environment</span>
                </label>
                <small className="admin-settings-note">Private payment keys are intentionally never stored in the browser; mark them configured after adding them to the server environment.</small>
              </div>

              <div className="admin-settings-card">
                <div className="admin-settings-card-head"><div><small>WEBSITE SETTINGS</small><h3>Site Identity & Access</h3></div><span>🌐</span></div>
                <div className="admin-settings-form-grid">
                  <label>Website name<input value={adminSettings.website.siteName} onChange={(e) => updateAdminSetting('website', 'siteName', e.target.value)} /></label>
                  <label>Support email<input type="email" value={adminSettings.website.supportEmail} onChange={(e) => updateAdminSetting('website', 'supportEmail', e.target.value)} /></label>
                  <label className="admin-settings-span-2">Tagline<input value={adminSettings.website.tagline} onChange={(e) => updateAdminSetting('website', 'tagline', e.target.value)} /></label>
                  <label className="admin-settings-span-2">Logo URL<input value={adminSettings.website.logoUrl} onChange={(e) => updateAdminSetting('website', 'logoUrl', e.target.value)} placeholder="Optional override" /></label>
                </div>
                <div className="admin-settings-toggle-list">
                  <label className="admin-settings-toggle"><input type="checkbox" checked={adminSettings.website.allowNewSignup} onChange={(e) => updateAdminSetting('website', 'allowNewSignup', e.target.checked)} /><span>Allow new account signups</span></label>
                  <label className="admin-settings-toggle"><input type="checkbox" checked={adminSettings.website.allowOtpSignup} onChange={(e) => updateAdminSetting('website', 'allowOtpSignup', e.target.checked)} /><span>Allow email OTP signup</span></label>
                  <label className="admin-settings-toggle"><input type="checkbox" checked={adminSettings.website.maintenanceMode} onChange={(e) => updateAdminSetting('website', 'maintenanceMode', e.target.checked)} /><span>Maintenance mode</span></label>
                </div>
              </div>

              <div className="admin-settings-card">
                <div className="admin-settings-card-head"><div><small>CONTENT ACCESS</small><h3>Default Access Rules</h3></div><span>🔐</span></div>
                <div className="admin-settings-access-grid">
                  <AccessTypeField groupName="settings-default-audio" value={adminSettings.content.defaultAudioAccess} onChange={(value) => updateAdminSetting('content', 'defaultAudioAccess', value)} />
                  <AccessTypeField groupName="settings-default-books" value={adminSettings.content.defaultBookAccess} onChange={(value) => updateAdminSetting('content', 'defaultBookAccess', value)} />
                  <AccessTypeField groupName="settings-default-videos" value={adminSettings.content.defaultVideoAccess} onChange={(value) => updateAdminSetting('content', 'defaultVideoAccess', value)} />
                </div>
                <div className="admin-settings-form-grid">
                  <label>Free audio episodes<input aria-label="Free audio episodes" type="number" min="0" max="100" value={adminSettings.content.freeAudioEpisodes} onChange={(e) => updateAdminSetting('content', 'freeAudioEpisodes', Number(e.target.value) || 0)} /></label>
                  <label>Free video episodes<input aria-label="Free video episodes" type="number" min="0" max="100" value={adminSettings.content.freeVideoEpisodes} onChange={(e) => updateAdminSetting('content', 'freeVideoEpisodes', Number(e.target.value) || 0)} /></label>
                  <label>Free book pages<input aria-label="Free book pages" type="number" min="0" max="500" value={adminSettings.content.freeBookPages} onChange={(e) => updateAdminSetting('content', 'freeBookPages', Number(e.target.value) || 0)} /></label>
                </div>
                <div className="admin-preview-rule-note">
                  <strong>Secondary free-preview rule</strong>
                  <span>Upload Access Types are primary. These limits only add a free preview to Premium / VIP / Ads content: Audio episodes → first N, Video episodes → first N, Books → first N pages.</span>
                </div>
                <label className="admin-settings-toggle"><input type="checkbox" checked={adminSettings.content.listenOnlyMode} onChange={(e) => updateAdminSetting('content', 'listenOnlyMode', e.target.checked)} /><span>Listen / read inside website only (recommended)</span></label>
              </div>
            </section>

            <div className="admin-settings-actions">
              <button type="button" className="admin-submit" onClick={saveAdminSettings} disabled={settingsLoading}>
                {settingsLoading ? '⏳ Loading Settings...' : '✓ Save All Settings'}
              </button>
              <button type="button" className="admin-cancel" onClick={resetAdminSettings}>Reset Defaults</button>
              <span className="admin-settings-save-hint">
                {settingsDirty
                  ? 'Changes are not saved yet.'
                  : settingsLoading
                    ? 'Loading saved settings...'
                    : 'Cloud save + local fallback enabled.'}
              </span>
            </div>
          </>
        )}

        {/* ================= STORIES ================= */}

        {tab === 'stories' && (
          <>
            <section className="admin-section">
              <h3>{editingStoryId ? '✏️ Edit Audio Story' : '➕ Add New Audio Story'}</h3>

              <form onSubmit={submitStory} className="admin-form">
                <input placeholder="Story title" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} />

                <label>
                  Genre
                  <select value={storyGenre} onChange={(e) => setStoryGenre(e.target.value)}>
                    {GENRE_OPTIONS.map((genre) => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Language
                  <select value={storyLanguage} onChange={(e) => setStoryLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                </label>

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
                  {editingStoryId ? '✓ Save Audio Story' : '+ Add Story'}
                </button>

                {editingStoryId && <button type="button" className="admin-cancel" onClick={resetStoryForm}>Cancel Edit</button>}
              </form>
            </section>

            <section className="admin-section">
              <h3>{editingEpisode ? '✏️ Edit Episode' : '🎧 Add Episode'}</h3>

              <form onSubmit={submitEpisode} className="admin-form">
                <select value={episodeStoryId} onChange={(e) => setEpisodeStoryId(e.target.value)}>
                  <option value="">Select audio story</option>
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

                <label>
                  Language
                  <select value={episodeLanguage} onChange={(e) => setEpisodeLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                </label>

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
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <select value={bulkStoryId} onChange={(e) => setBulkStoryId(e.target.value)}>
                    <option value="">Select Story</option>

                  {adminStoryIds.length > 0 &&
                    stories
                      .filter((story) => adminStoryIds.includes(story.id))
                      .map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
                  </select>
                  <AccessTypeSelect groupName="bulk-audio-default-access" value={bulkDefaultAccessType} onChange={setBulkDefaultAccessType} />
                </div>

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
                                <AccessTypeSelect
                                  groupName={`bulk-audio-access-${msg.messageId}`}
                                  value={bulkAccessTypes[msg.messageId] || 'free'}
                                  onChange={(value) => setBulkAccessTypes((prev) => ({ ...prev, [msg.messageId]: value }))}
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
            <section className="admin-section bulk-telegram-section">
              <h3>📚 Bulk Telegram Book Import</h3>
              <div className="admin-form">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <AccessTypeSelect groupName="bulk-book-default-access" value={bookBulkDefaultAccessType} onChange={setBookBulkDefaultAccessType} />
                </div>
                <button
                  type="button"
                  className="admin-submit"
                  style={{ backgroundColor: '#7C83FF' }}
                  onClick={handleScanBookTelegram}
                  disabled={bookBulkLoading}
                >
                  {bookBulkLoading ? '🔄 Scanning Documents...' : '🔄 Scan Telegram Books (PDF / EPUB)'}
                </button>

                {bookBulkMessages.length > 0 && (
                  <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                      <strong style={{ color: '#fff' }}>Selected: {bookBulkSelectedIds.length}</strong>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" className="primary-btn" style={{ padding: '5px 10px', fontSize: '14px' }} onClick={handleBookBulkToggleAll}>Toggle All</button>
                        <button type="button" className="admin-cancel" style={{ padding: '5px 10px', fontSize: '14px' }} onClick={() => setBookBulkSelectedIds([])}>Clear</button>
                      </div>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {bookBulkMessages.map((msg) => {
                        const isSelected = bookBulkSelectedIds.includes(msg.messageId)
                        const defaultTitle = msg.caption || msg.fileName || 'Untitled Book'
                        const inferredType = String(msg.fileName || '').toLowerCase().endsWith('.epub') || String(msg.mimeType || '').toLowerCase() === 'application/epub+zip'
                          ? 'epub'
                          : 'pdf'
                        return (
                          <div key={msg.messageId} style={{
                            background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px',
                            borderLeft: isSelected ? '4px solid #7C83FF' : '4px solid transparent',
                            display: 'flex', gap: '15px', alignItems: 'flex-start'
                          }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleBookBulkToggle(msg.messageId)}
                              style={{ width: '20px', height: '20px', marginTop: '10px' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>
                                ID: {msg.messageId} · {new Date(msg.date * 1000).toLocaleString()} · {Math.round(msg.size / 1024 / 1024 * 100) / 100} MB
                              </div>
                              <input
                                type="text"
                                placeholder={defaultTitle}
                                value={bookBulkTitleOverrides[msg.messageId] !== undefined ? bookBulkTitleOverrides[msg.messageId] : defaultTitle}
                                onChange={(e) => handleBookBulkTitleChange(msg.messageId, e.target.value)}
                                style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <label style={{ fontSize: '12px', color: '#ccc' }}>Type:</label>
                                <select
                                  value={bookBulkTypeOverrides[msg.messageId] || inferredType}
                                  onChange={(e) => handleBookBulkTypeChange(msg.messageId, e.target.value)}
                                  style={{ padding: '5px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff' }}
                                >
                                  <option value="pdf">PDF</option>
                                  <option value="epub">EPUB</option>
                                </select>
                                <AccessTypeSelect
                                  groupName={`bulk-book-access-${msg.messageId}`}
                                  value={bookBulkAccessTypes[msg.messageId] || 'free'}
                                  onChange={(value) => setBookBulkAccessTypes((prev) => ({ ...prev, [msg.messageId]: value }))}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      className="admin-submit"
                      style={{ marginTop: '20px' }}
                      onClick={handleBookBulkImport}
                      disabled={bookBulkSelectedIds.length === 0}
                    >
                      ⬆️ Import Selected Books
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="admin-section">
              <h3>📚 Add Volume to Existing Book</h3>
              <form onSubmit={submitVolumeToExistingBook} className="admin-form">
                <select
                  value={volumeBookId}
                  onChange={(e) => {
                    const id = e.target.value
                    setVolumeBookId(id)
                    const selected = books.find((item) => String(item.id) === id)
                    if (selected) {
                      setBookType(selected.type || 'pdf')
                      setVolumeFile('')
                      setVolumeFilePath('')
                    }
                  }}
                >
                  <option value="">Select existing book…</option>
                  {books.filter((book) => adminBookIds.includes(book.id)).map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title} · {(book.volumes?.length || 0)} volume{(book.volumes?.length || 0) === 1 ? '' : 's'} · {(book.type || 'pdf').toUpperCase()}
                    </option>
                  ))}
                </select>

                {volumeBookId && (
                  <>
                    <input
                      placeholder="Volume name (e.g. Volume 2 / Part 2)"
                      value={volumeTitle}
                      onChange={(e) => setVolumeTitle(e.target.value)}
                    />
                    {(() => {
                      const selected = books.find((item) => String(item.id) === String(volumeBookId))
                      const type = selected?.type || 'pdf'
                      return (
                        <FileUploadField
                          label={volumeFile ? '✓ Volume uploaded — replace' : `Choose ${type.toUpperCase()} for this volume`}
                          kind={type}
                          bucket="books"
                          folder={type === 'pdf' ? 'pdf/volumes' : 'epub/volumes'}
                          value={volumeFile}
                          accept={type === 'pdf' ? 'application/pdf,.pdf' : '.epub'}
                          onUploaded={(url, path) => {
                            setVolumeFile(url)
                            setVolumeFilePath(path || '')
                          }}
                          onUploadingChange={setBookVolumeUploading}
                        />
                      )
                    })()}
                    <div className="multi-volume-actions">
                      <button type="submit" className="admin-submit" disabled={bookVolumeUploading || !volumeTitle.trim() || !volumeFile.trim()}>
                        ＋ Add Volume
                      </button>
                      <button type="button" className="admin-cancel" onClick={resetAddVolumeForm}>Clear</button>
                    </div>
                  </>
                )}
              </form>
            </section>

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

                <label>
                  Genre / Category
                  <select value={bookCategory} onChange={(e) => setBookCategory(e.target.value)}>
                    {BOOK_GENRE_OPTIONS.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Language
                  <select value={bookLanguage} onChange={(e) => setBookLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                </label>

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

                <input
                  type="text"
                  placeholder="Paste Telegram document message URL (PDF / EPUB)"
                  value={bookTelegramUrl}
                  onChange={(e) => {
                    setBookTelegramUrl(e.target.value)
                    if (e.target.value) {
                      setBookFile('')
                      setBookFilePath('')
                    }
                  }}
                />
                <div style={{ textAlign: 'center', margin: '10px 0', fontWeight: 'bold' }}>OR</div>

                {bookType === 'pdf' ? (
                  <FileUploadField
                    label={bookFile ? '✓ PDF uploaded — replace' : 'Choose PDF'}
                    kind="pdf"
                    bucket="books"
                    folder="pdf"
                    value={bookFile}
                    accept="application/pdf,.pdf"
                    onUploaded={(url, path) => {
                      setBookFile(url)
                      setBookFilePath(path || '')
                      setBookTelegramUrl('')
                    }}
                    onUploadingChange={setBookFileUploading}
                  />
                ) : (
                  <FileUploadField
                    label={bookFile ? '✓ EPUB uploaded — replace' : 'Choose EPUB'}
                    kind="epub"
                    bucket="books"
                    folder="epub"
                    value={bookFile}
                    accept=".epub"
                    onUploaded={(url, path) => {
                      setBookFile(url)
                      setBookFilePath(path || '')
                      setBookTelegramUrl('')
                    }}
                    onUploadingChange={setBookFileUploading}
                  />
                )}

                <div className="multi-volume-box" style={{ marginTop: 16, padding: 16, border: '1px solid rgba(124,131,255,.28)', borderRadius: 12, background: 'rgba(124,131,255,.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <strong>📚 Multi-Volume Book</strong>
                      <div style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>For books with 2–10+ volumes. Upload each volume separately under one book.</div>
                    </div>
                    <button type="button" className="admin-submit" onClick={addBookVolume}>＋ Add Volume</button>
                  </div>

                  {bookVolumes.length > 0 && (
                    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                      {bookVolumes.map((volume, index) => (
                        <div key={volume.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, .35fr) minmax(180px, 1fr) auto', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: 'rgba(0,0,0,.2)' }}>
                          <input value={volume.title} placeholder={`Volume ${index + 1}`} onChange={e => updateBookVolume(volume.id, { title: e.target.value })} />
                          <FileUploadField
                            label={volume.file ? `✓ Volume ${index + 1} uploaded — replace` : `Choose Volume ${index + 1} ${bookType.toUpperCase()}`}
                            kind={bookType}
                            bucket="books"
                            folder={bookType === 'pdf' ? 'pdf/volumes' : 'epub/volumes'}
                            value={volume.file}
                            accept={bookType === 'pdf' ? 'application/pdf,.pdf' : '.epub'}
                            onUploaded={(url, path) => updateBookVolume(volume.id, { file: url, filePath: path || '' })}
                            onUploadingChange={setBookVolumeUploading}
                          />
                          <button type="button" className="admin-delete" onClick={() => removeBookVolume(volume.id)}>🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <AccessTypeField groupName="book-access" value={bookAccessType} onChange={setBookAccessType} />

                <button type="submit" className="admin-submit" disabled={bookCoverUploading || bookFileUploading || bookVolumeUploading}>
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
                        {Array.isArray(book.volumes) && book.volumes.length > 0 && <small>📚 {book.volumes.length} Volumes</small>}
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

                <label>
                  Genre / Category
                  <select value={videoCategory} onChange={(e) => setVideoCategory(e.target.value)}>
                    {VIDEO_GENRE_OPTIONS.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Language
                  <select value={videoLanguage} onChange={(e) => setVideoLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                </label>

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

                <input
                  type="text"
                  placeholder="Paste Telegram video message URL"
                  value={videoTelegramUrl}
                  onChange={(e) => {
                    setVideoTelegramUrl(e.target.value)
                    if (e.target.value) setVideoSrc('')
                  }}
                />
                <div style={{ textAlign: 'center', margin: '10px 0', fontWeight: 'bold' }}>OR</div>
                <FileUploadField
                  label={videoSrc ? '✓ Video uploaded — replace' : 'Choose Video'}
                  kind="video"
                  bucket="videos"
                  folder="video-stories"
                  value={videoSrc}
                  accept="video/*,.mp4,.webm,.mov"
                  onUploaded={(url, path) => {
                    setVideoSrc(url)
                    setVideoTelegramUrl('')
                  }}
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

            <section className="admin-section bulk-telegram-section">
              <h3>🎬 Bulk Telegram Video Import</h3>
              <div className="admin-form">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <select value={bulkVideoStoryId} onChange={(e) => setBulkVideoStoryId(e.target.value)}>
                    <option value="">Select Video Story</option>

                  {videoStories.filter((video) => adminVideoIds.includes(video.id)).map((video) => (
                    <option key={video.id} value={video.id}>{video.title}</option>
                  ))}
                  </select>
                  <AccessTypeSelect groupName="bulk-video-default-access" value={videoBulkDefaultAccessType} onChange={setVideoBulkDefaultAccessType} />
                </div>

                <button
                  type="button"
                  className="admin-submit"
                  style={{ backgroundColor: '#7C83FF' }}
                  onClick={handleScanVideoTelegram}
                  disabled={videoBulkLoading}
                >
                  {videoBulkLoading ? '🔄 Scanning Videos...' : '🔄 Scan Telegram Videos'}
                </button>

                {videoBulkMessages.length > 0 && (
                  <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                      <strong style={{ color: '#fff' }}>Selected: {videoBulkSelectedIds.length}</strong>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" className="primary-btn" style={{ padding: '5px 10px', fontSize: '14px' }} onClick={handleVideoBulkToggleAll}>Toggle All</button>
                        <button type="button" className="admin-cancel" style={{ padding: '5px 10px', fontSize: '14px' }} onClick={() => setVideoBulkSelectedIds([])}>Clear</button>
                      </div>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {videoBulkMessages.map((msg) => {
                        const isSelected = videoBulkSelectedIds.includes(msg.messageId)
                        const defaultTitle = msg.caption || msg.fileName || 'Untitled Video Episode'
                        return (
                          <div key={msg.messageId} style={{
                            background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px',
                            borderLeft: isSelected ? '4px solid #7C83FF' : '4px solid transparent',
                            display: 'flex', gap: '15px', alignItems: 'flex-start'
                          }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleVideoBulkToggle(msg.messageId)}
                              style={{ width: '20px', height: '20px', marginTop: '10px' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>
                                ID: {msg.messageId} · {new Date(msg.date * 1000).toLocaleString()} · {Math.round(msg.size / 1024 / 1024 * 100) / 100} MB
                                {msg.width && msg.height ? ` · ${msg.width}×${msg.height}` : ''}
                              </div>
                              <input
                                type="text"
                                placeholder={defaultTitle}
                                value={videoBulkTitleOverrides[msg.messageId] !== undefined ? videoBulkTitleOverrides[msg.messageId] : defaultTitle}
                                onChange={(e) => handleVideoBulkTitleChange(msg.messageId, e.target.value)}
                                style={{ width: '100%', padding: '8px', marginBottom: '5px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ fontSize: '12px', color: '#ccc' }}>Episode No:</label>
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Auto"
                                  value={videoBulkNumberOverrides[msg.messageId] || ''}
                                  onChange={(e) => handleVideoBulkNumberChange(msg.messageId, e.target.value)}
                                  style={{ width: '80px', padding: '5px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff' }}
                                />
                                <AccessTypeSelect
                                  groupName={`bulk-video-access-${msg.messageId}`}
                                  value={videoBulkAccessTypes[msg.messageId] || 'free'}
                                  onChange={(value) => setVideoBulkAccessTypes((prev) => ({ ...prev, [msg.messageId]: value }))}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      className="admin-submit"
                      style={{ marginTop: '20px' }}
                      onClick={handleVideoBulkImport}
                      disabled={videoBulkSelectedIds.length === 0 || !bulkVideoStoryId}
                    >
                      ⬆️ Import Selected Videos
                    </button>
                  </div>
                )}
              </div>
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






