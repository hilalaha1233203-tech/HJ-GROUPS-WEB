import FileUploadField from './components/FileUploadField'
import { resolveAccessType } from './lib/accessControl'
import { normalizeContentAccessSettings } from './lib/contentAccessSettings'
import { normalizeShortenerSettings } from './lib/shortenerProviders'
import { CONTENT_STATUS_OPTIONS, normalizeContentStatus } from './lib/contentStatus.js'
import { MAX_GENRES, normalizeGenreSelection, serializeGenreSelection } from './lib/genreSelection.js'
import { ANALYTICS_BATCH_SIZES, getEpisodeAnalyticsBatch, summarizeEpisodeAnalyticsBatch } from './lib/analyticsBatch.js'
import {
  DEFAULT_AD_UNLOCK_RULES,
  normalizeAdUnlockRules,
  validateAdUnlockRules,
} from './lib/adUnlockRules'
import { supabase } from './supabase'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AdminAnalyticsCharts from './components/AdminAnalyticsCharts'
import AdminNotificationCenter from './components/AdminNotificationCenter'
import AdminContentV2 from './AdminContentV2'
import { DEFAULT_APPEARANCE, FONT_OPTIONS, ANIMATION_INTENSITIES, EMOJI_ANIMATIONS, EMOJI_STYLES, normalizeAppearance } from './lib/appearance'

const makeAdminEntityId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000)

// The streaming service is deployed separately. Use its stable Vercel project URL
// instead of pinning the website to an immutable deployment URL.
import { fetchTelegramMessages } from './lib/streamingUrl'
import { buildTelegramMediaTitle, getFreshEpisodeImportState, sortTelegramMessagesOldestFirst } from './lib/telegramImport.js'


const ADMIN_SETTINGS_KEY = 'hj_admin_settings_v1'

const DEFAULT_ADMIN_SETTINGS = Object.freeze({
  website: {
    siteName: 'HJ GROUPS',
    tagline: 'Stories, Books & Videos',
    supportEmail: '',
    supportTelegramUrl: '',
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
    episodeUnlockRules: DEFAULT_AD_UNLOCK_RULES.map((rule) => ({ ...rule })),
  },
  shortener: {
    enabled: false,
    primaryProvider: 'arolinks',
    fallbackProvider: 'earn4link',
    unlockDurationMinutes: 360,
    episodeUnlockRules: DEFAULT_AD_UNLOCK_RULES.map((rule) => ({ ...rule })),
  },
  appearance: DEFAULT_APPEARANCE,
  payments: {
    enabled: false,
    provider: 'cashfree',
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
      ads: {
        ...DEFAULT_ADMIN_SETTINGS.ads,
        ...(stored?.ads || {}),
        episodeUnlockRules: normalizeAdUnlockRules(stored?.ads?.episodeUnlockRules),
      },
      shortener: normalizeShortenerSettings({
        ...DEFAULT_ADMIN_SETTINGS.shortener,
        ...(stored?.shortener || {}),
        enabled: stored?.shortener?.enabled === true || stored?.ads?.shortenerEnabled === true,
        primaryProvider: stored?.shortener?.primaryProvider || stored?.ads?.primaryShortener,
        fallbackProvider: Object.prototype.hasOwnProperty.call(stored?.shortener || {}, 'fallbackProvider')
          ? stored.shortener.fallbackProvider
          : stored?.ads?.fallbackShortener,
        unlockDurationMinutes: Number(stored?.shortener?.unlockDurationMinutes || stored?.ads?.unlockDurationMinutes) || 360,
        episodeUnlockRules: normalizeAdUnlockRules(
          stored?.shortener?.episodeUnlockRules || stored?.ads?.episodeUnlockRules
        ),
      }),
      appearance: normalizeAppearance(stored?.appearance || {}),
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

function AccessTypeSelect({ groupName, label = 'Access Types', value, onChange }) {
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
      <span className="access-type-label">{label}</span>
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
function AccessTypeField({ groupName, label = 'Access Types', value, onChange }) {
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
      <span className="access-type-label">{label}</span>
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

function GenreMultiSelect({ value, onChange }) {
  const selectedGenres = normalizeGenreSelection(value)

  const toggleGenre = (genre, checked) => {
    if (checked) {
      if (selectedGenres.includes(genre) || selectedGenres.length >= MAX_GENRES) return
      onChange([...selectedGenres, genre])
      return
    }

    if (selectedGenres.length <= 1) return
    onChange(selectedGenres.filter((item) => item !== genre))
  }

  return (
    <div className="genre-multi-select" aria-label="Audio story genres">
      <div className="genre-multi-select-head">
        <span>Genre</span>
        <small>{selectedGenres.length}/{MAX_GENRES} selected</small>
      </div>

      <div className="genre-multi-select-selected" aria-live="polite">
        {selectedGenres.join(' · ')}
      </div>

      <div className="genre-multi-select-options">
        {GENRE_OPTIONS.map((genre) => {
          const checked = selectedGenres.includes(genre)
          const disabled = !checked && selectedGenres.length >= MAX_GENRES

          return (
            <label key={genre} className={`genre-multi-select-option${checked ? ' selected' : ''}`}>
              <input
                type="checkbox"
                name={`story-genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                checked={checked}
                disabled={disabled}
                onChange={(event) => toggleGenre(genre, event.target.checked)}
              />
              <span>{genre}</span>
            </label>
          )
        })}
      </div>

      <small className="genre-multi-select-hint">
        Select up to {MAX_GENRES} genres. At least one genre must stay selected.
      </small>
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
  const toastTimerRef = useRef(null)

  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToastMessage(String(message || ''))
    setToastType(type)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 4000)
  }

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
  }, [])

  const [tab, setTab] = useState('overview')

  const [adminSettings, setAdminSettings] = useState(() => readAdminSettings())
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [shortenerHealth, setShortenerHealth] = useState(null)
  const [shortenerHealthLoading, setShortenerHealthLoading] = useState(false)
  const [shortenerHealthRefresh, setShortenerHealthRefresh] = useState(0)
  const [analyticsRange, setAnalyticsRange] = useState('7d')
  const [analyticsGrouping, setAnalyticsGrouping] = useState('day')
  const [securityFindings, setSecurityFindings] = useState([])
  const [securityScans, setSecurityScans] = useState([])
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const [manualSecurityRunning, setManualSecurityRunning] = useState(false)
  const [manualSecurityResult, setManualSecurityResult] = useState(null)
  const [securityProgress, setSecurityProgress] = useState({ progress_percent: 0, completed_checks: 0, total_checks: 0, current_check: null, checks: [] })
  const [playwrightState, setPlaywrightState] = useState({ status: 'not_run', run: null, tests: null, jobs: [], error: '' })
  const [playwrightLoading, setPlaywrightLoading] = useState(false)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsStorySearch, setAnalyticsStorySearch] = useState('')
  const [analyticsStoryPickerOpen, setAnalyticsStoryPickerOpen] = useState(false)
  const [analyticsSelectedStoryId, setAnalyticsSelectedStoryId] = useState(null)
  const [analyticsEpisodeSearch, setAnalyticsEpisodeSearch] = useState('')
  const [analyticsEpisodePickerOpen, setAnalyticsEpisodePickerOpen] = useState(false)
  const [analyticsSelectedEpisode, setAnalyticsSelectedEpisode] = useState(null)
  const [analyticsBatchSize, setAnalyticsBatchSize] = useState(10)
  const [analyticsBatchEpisodeIds, setAnalyticsBatchEpisodeIds] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [userExportLoading, setUserExportLoading] = useState(false)
  const [userExportError, setUserExportError] = useState('')
  const [vipUsers, setVipUsers] = useState([])
  const [vipGrants, setVipGrants] = useState([])
  const [vipError, setVipError] = useState('')
  const [vipSelectedUserId, setVipSelectedUserId] = useState('')
  const [vipExpiry, setVipExpiry] = useState('')
  const [vipNote, setVipNote] = useState('')
  const [vipLoading, setVipLoading] = useState(false)
  const [vipSaving, setVipSaving] = useState(false)
  const tabHistoryRef = useRef([])

  const setAdminTab = (nextTab) => {
    if (tab !== nextTab) tabHistoryRef.current.push(tab)
    setTab(nextTab)
  }

  const goBackAdminTab = () => {
    const previousTab = tabHistoryRef.current.pop()
    if (previousTab) setTab(previousTab)
  }

  const getAnalyticsRangeParams = () => {
    if (analyticsRange === 'all') return { start: '', end: '' }
    const now = new Date()
    const start = new Date(now)
    if (analyticsRange === 'today') start.setHours(0, 0, 0, 0)
    else if (analyticsRange === '30d') start.setDate(start.getDate() - 30)
    else start.setDate(start.getDate() - 7)
    return { start: start.toISOString(), end: now.toISOString() }
  }

  const downloadUserExport = async () => {
    if (userExportLoading) return
    setUserExportLoading(true)
    setUserExportError('')
    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Admin session is unavailable.')

      const { start, end } = getAnalyticsRangeParams()
      const query = new URLSearchParams({ range: analyticsRange })
      if (start) query.set('start', start)
      if (end) query.set('end', end)

      const response = await fetch('/api/admin/user-export.xlsx?' + query.toString(), {
        headers: { Authorization: 'Bearer ' + session.access_token },
        cache: 'no-store',
      })

      if (!response.ok) {
        let message = 'User export could not be generated.'
        try {
          const payload = await response.json()
          if (payload?.error) message = payload.error
        } catch {}
        throw new Error(message)
      }

      const buffer = await response.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        const serverText = new TextDecoder().decode(bytes).trim().slice(0, 240)
        throw new Error(serverText || 'Server returned an invalid XLSX file. Start the local HJ GROUPS backend server and retry.')
      }
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = 'hj-groups-user-data-' + new Date().toISOString().replace(/[:.]/g, '-') + '.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000)
      showToast('User Data Excel downloaded.')
    } catch (error) {
      const message = String(error?.message || 'User export failed.')
      setUserExportError(message)
      showToast(message, 'error')
    } finally {
      setUserExportLoading(false)
    }
  }


  const refreshSecurityData = useCallback(async () => {
    setSecurityLoading(true)
    setSecurityError('')
    try {
      const [{ data: findings, error: findingsError }, { data: scans, error: scansError }] = await Promise.all([
        supabase.from('security_findings').select('*').order('last_detected_at', { ascending: false }).limit(200),
        supabase.from('security_scans').select('*').order('started_at', { ascending: false }).limit(30),
      ])
      if (findingsError) throw findingsError
      if (scansError) throw scansError
      setSecurityFindings(findings || [])
      setSecurityScans(scans || [])
      const latestProgress = scans?.[0]?.summary
      if (latestProgress && typeof latestProgress === 'object' && Number.isFinite(Number(latestProgress.total_checks)) && Number(latestProgress.total_checks) > 0) {
        setSecurityProgress({
          progress_percent: Number(latestProgress.progress_percent) || 0,
          completed_checks: Number(latestProgress.completed_checks) || 0,
          total_checks: Number(latestProgress.total_checks),
          current_check: latestProgress.current_check || null,
          checks: Array.isArray(latestProgress.checks) ? latestProgress.checks : [],
        })
      } else if (!manualSecurityRunning) {
        setSecurityProgress({ progress_percent: 0, completed_checks: 0, total_checks: 0, current_check: null, checks: [] })
      }
      return { findings: findings || [], scans: scans || [] }
    } catch (error) {
      setSecurityError(String(error?.message || 'Security monitoring data unavailable.'))
      throw error
    } finally {
      setSecurityLoading(false)
    }
  }, [manualSecurityRunning])

  const runManualSecurityCheck = async () => {
    if (manualSecurityRunning) return
    setManualSecurityRunning(true)
    setSecurityError('')
    setManualSecurityResult({ status: 'running', startedAt: new Date().toISOString() })
    setSecurityProgress({ progress_percent: 0, completed_checks: 0, total_checks: 7, current_check: 'Infrastructure & Headers', checks: [] })
    try {
      const { data, error } = await supabase.functions.invoke('hj-security-monitor', {
        body: { scheduled: false },
      })
      if (error) {
        let message = error.message || 'Manual security check failed.'
        try {
          const payload = await error.context?.json?.()
          message = payload?.error || message
        } catch {}
        throw new Error(message)
      }
      setManualSecurityResult(data || { status: 'completed' })
      await refreshSecurityData()
      showToast('Manual security check completed.')
    } catch (error) {
      setManualSecurityResult({ status: 'failed', error: String(error?.message || 'Manual security check failed.') })
      showToast(String(error?.message || 'Manual security check failed.'), 'error')
    } finally {
      setManualSecurityRunning(false)
    }
  }

  const callAdminPlaywright = useCallback(async (action) => {
    const { data: { session } = {} } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Admin session is unavailable.')
    const response = await fetch('/api/admin/playwright', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ action }),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(payload?.error || 'Playwright control failed.')
      error.status = response.status
      error.payload = payload
      throw error
    }
    return payload || {}
  }, [])

  const refreshPlaywrightStatus = useCallback(async () => {
    setPlaywrightLoading(true)
    try {
      const data = await callAdminPlaywright('status')
      setPlaywrightState({
        status: data?.run?.status === 'completed'
          ? (data?.run?.conclusion === 'success' ? 'passed' : data?.run?.conclusion ? 'failed' : 'running')
          : (data?.status === 'queued' ? 'queued' : data?.run?.status || 'not_run'),
        run: data?.run || null,
        tests: data?.tests || null,
        jobs: data?.jobs || [],
        error: '',
        browserCoverage: data?.browserCoverage || [],
      })
    } catch (error) {
      const payload = error?.payload
      if (payload?.status === 'not_configured') {
        setPlaywrightState((current) => ({ ...current, status: 'not_configured', error: String(error?.message || 'Playwright control is not configured.') }))
      } else {
        setPlaywrightState((current) => ({ ...current, error: String(error?.message || 'Playwright status unavailable.') }))
      }
    } finally {
      setPlaywrightLoading(false)
    }
  }, [callAdminPlaywright])

  const runPlaywrightCheck = async () => {
    if (playwrightLoading || ['queued', 'running', 'in_progress'].includes(playwrightState.status)) return
    setPlaywrightLoading(true)
    setPlaywrightState((current) => ({ ...current, status: 'queued', error: '' }))
    try {
      const data = await callAdminPlaywright('start')
      if (data?.status === 'already_running') {
        setPlaywrightState((current) => ({
          ...current,
          status: data?.run?.status || 'running',
          run: data?.run || current.run,
          tests: data?.tests || current.tests,
          jobs: data?.jobs || current.jobs,
          error: '',
        }))
      } else {
        setPlaywrightState((current) => ({ ...current, status: 'queued', error: '' }))
      }
      showToast(data?.status === 'already_running' ? 'Playwright is already running.' : 'Playwright verification queued.')
    } catch (error) {
      const payload = error?.payload
      const message = String(error?.message || 'Could not trigger Playwright.')
      setPlaywrightState((current) => ({
        ...current,
        status: payload?.status === 'not_configured' ? 'not_configured' : 'failed',
        error: message,
      }))
      showToast(message, 'error')
    } finally {
      setPlaywrightLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'security') return undefined
    refreshSecurityData().catch(() => {})
    refreshPlaywrightStatus().catch(() => {})
  }, [tab, refreshSecurityData, refreshPlaywrightStatus])

  useEffect(() => {
    if (tab !== 'security' || !manualSecurityRunning) return undefined
    const timer = window.setInterval(() => { void refreshSecurityData().catch(() => {}) }, 1000)
    return () => window.clearInterval(timer)
  }, [tab, manualSecurityRunning, refreshSecurityData])

  useEffect(() => {
    if (tab !== 'security' || !['queued', 'running', 'in_progress'].includes(playwrightState.status)) return undefined
    const timer = window.setInterval(() => { void refreshPlaywrightStatus() }, 5000)
    return () => window.clearInterval(timer)
  }, [tab, playwrightState.status, refreshPlaywrightStatus])

  useEffect(() => {
    if (tab !== 'analytics') return undefined
    let mounted = true
    const getAnalyticsRange = () => {
      if (analyticsRange === 'all') return { start: '', end: '' }
      const now = new Date()
      const start = new Date(now)
      if (analyticsRange === 'today') start.setHours(0, 0, 0, 0)
      else if (analyticsRange === '30d') start.setDate(start.getDate() - 30)
      else start.setDate(start.getDate() - 7)
      return { start: start.toISOString(), end: now.toISOString() }
    }

    const loadAnalytics = async () => {
      setAnalyticsLoading(true)
      setAnalyticsError('')
      try {
        const { data: { session } = {} } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Admin session is unavailable.')
        const { start, end } = getAnalyticsRange()
        const query = new URLSearchParams({ range: analyticsRange, group: analyticsGrouping })
        if (start) query.set('start', start)
        if (end) query.set('end', end)
        const response = await fetch('/api/admin/analytics?' + query.toString(), {
          method: 'GET',
          credentials: 'include',
          headers: { Authorization: 'Bearer ' + session.access_token },
          cache: 'no-store',
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Unable to load analytics.')
        if (mounted) setAnalyticsData(data || null)
      } catch (error) {
        if (mounted) {
          setAnalyticsData(null)
          setAnalyticsError(error?.message || 'Unable to load analytics.')
        }
      } finally {
        if (mounted) setAnalyticsLoading(false)
      }
    }
    loadAnalytics()
    return () => { mounted = false }
  }, [tab, analyticsRange, analyticsGrouping])

  useEffect(() => {
    if (tab !== 'settings') return undefined

    let mounted = true
    const loadShortenerHealth = async () => {
      setShortenerHealthLoading(true)
      try {
        const { data: { session } = {} } = await supabase.auth.getSession()
        if (!session?.access_token) {
          if (mounted) setShortenerHealth(null)
          return
        }

        const response = await fetch('/api/shortener/status', {
          method: 'GET',
          credentials: 'include',
          headers: { Authorization: 'Bearer ' + session.access_token },
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => null)
        if (mounted && response.ok && payload) {
          setShortenerHealth(payload)
        } else if (mounted) {
          setShortenerHealth({
            error: payload?.error || 'Server health check failed',
            statusCode: response.status,
            configured: payload?.configured ?? null,
          })
        }
      } catch (error) {
        if (mounted) {
          const message = String(error?.message || 'Unable to reach the shortener health endpoint.')
          setShortenerHealth({
            error: 'Health endpoint unavailable: ' + message,
            statusCode: 0,
            configured: null,
          })
          console.warn('Shortener health check failed:', error)
        }
      } finally {
        if (mounted) setShortenerHealthLoading(false)
      }
    }

    loadShortenerHealth()
    return () => { mounted = false }
  }, [tab, shortenerHealthRefresh])

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
            ads: {
              ...DEFAULT_ADMIN_SETTINGS.ads,
              ...(stored.ads || {}),
              episodeUnlockRules: normalizeAdUnlockRules(stored?.ads?.episodeUnlockRules),
            },
            appearance: normalizeAppearance(stored.appearance || {}),
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

  useEffect(() => {
    let mounted = true
    const loadCloudAdDuration = async () => {
      try {
        const { data, error } = await supabase
          .from('content_access_settings')
          .select('ad_unlock_duration_minutes')
          .eq('id', 'default')
          .maybeSingle()

        if (!mounted || error || !data) return
        const duration = Math.min(1440, Math.max(1, Number(data.ad_unlock_duration_minutes) || 360))
        setAdminSettings((current) => ({
          ...current,
          ads: { ...current.ads, unlockDurationMinutes: duration },
        }))
      } catch {
        // Keep the existing local/cloud admin settings when the optional
        // shared content-access table is temporarily unavailable.
      }
    }

    loadCloudAdDuration()
    return () => { mounted = false }
  }, [])

  const adUnlockRules = Array.isArray(adminSettings.ads.episodeUnlockRules)
    ? adminSettings.ads.episodeUnlockRules
    : DEFAULT_AD_UNLOCK_RULES.map((rule) => ({ ...rule }))

  const adUnlockRuleValidation = validateAdUnlockRules(adUnlockRules)
  const shortenerUnlockRules = Array.isArray(adminSettings.shortener?.episodeUnlockRules)
    ? adminSettings.shortener.episodeUnlockRules
    : DEFAULT_AD_UNLOCK_RULES.map((rule) => ({ ...rule }))
  const shortenerRuleValidation = validateAdUnlockRules(shortenerUnlockRules)

  const refreshVipAccess = useCallback(async () => {
    setVipLoading(true)
    setVipError('')
    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Admin session is unavailable.')
      const response = await fetch('/api/admin/vip-access', {
        headers: { Authorization: 'Bearer ' + session.access_token },
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'VIP users could not be loaded.')
      setVipUsers(Array.isArray(payload?.users) ? payload.users : [])
      setVipGrants(Array.isArray(payload?.grants) ? payload.grants : [])
    } catch (error) {
      const message = String(error?.message || 'VIP users could not be loaded.')
      setVipError(message)
      showToast(message, 'error')
    } finally {
      setVipLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'settings') void refreshVipAccess()
  }, [tab, refreshVipAccess])

  const saveVipGrant = async () => {
    if (!vipSelectedUserId || vipSaving) return
    setVipSaving(true)
    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Admin session is unavailable.')
      const response = await fetch('/api/admin/vip-access', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          action: 'grant',
          userId: vipSelectedUserId,
          expiresAt: vipExpiry ? new Date(vipExpiry).toISOString() : null,
          note: vipNote.trim(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'VIP access could not be granted.')
      await refreshVipAccess()
      setVipNote('')
      showToast(vipExpiry ? 'VIP access granted until the selected date.' : 'Lifetime VIP access granted.')
    } catch (error) {
      showToast(String(error?.message || 'VIP access could not be granted.'), 'error')
    } finally {
      setVipSaving(false)
    }
  }

  const revokeVipGrant = async (userId) => {
    if (!userId || vipSaving) return
    setVipSaving(true)
    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Admin session is unavailable.')
      const response = await fetch('/api/admin/vip-access', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ action: 'revoke', userId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'VIP access could not be revoked.')
      await refreshVipAccess()
      showToast('VIP access revoked.')
    } catch (error) {
      showToast(String(error?.message || 'VIP access could not be revoked.'), 'error')
    } finally {
      setVipSaving(false)
    }
  }

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

  const updateAdUnlockRule = (index, key, value) => {
    setAdminSettings((current) => ({
      ...current,
      ads: {
        ...current.ads,
        episodeUnlockRules: normalizeAdUnlockRules(current.ads?.episodeUnlockRules).map((rule, ruleIndex) => (
          ruleIndex === index
            ? { ...rule, [key]: value === '' ? null : value }
            : rule
        )),
      },
    }))
    setSettingsDirty(true)
  }

  const addAdUnlockRule = () => {
    if (adUnlockRules.some((rule) => rule.endEpisode == null || String(rule.endEpisode).trim() === '')) {
      showToast('Set an End Episode on the unlimited rule before adding another rule.', 'error')
      return
    }

    const finiteEnds = adUnlockRules
      .map((rule) => Number(rule.endEpisode))
      .filter((value) => Number.isInteger(value) && value >= 1)
    const lastEnd = finiteEnds.length ? Math.max(...finiteEnds) : null
    const nextStart = Number.isInteger(lastEnd) && lastEnd >= 1 ? lastEnd + 1 : ''
    setAdminSettings((current) => ({
      ...current,
      ads: {
        ...current.ads,
        episodeUnlockRules: [
          ...normalizeAdUnlockRules(current.ads?.episodeUnlockRules),
          { startEpisode: nextStart, endEpisode: null, unlockCount: 1 },
        ],
      },
    }))
    setSettingsDirty(true)
  }

  const deleteAdUnlockRule = (index) => {
    setAdminSettings((current) => ({
      ...current,
      ads: {
        ...current.ads,
        episodeUnlockRules: normalizeAdUnlockRules(current.ads?.episodeUnlockRules).filter((_, ruleIndex) => ruleIndex !== index),
      },
    }))
    setSettingsDirty(true)
  }

  const updateShortenerUnlockRule = (index, key, value) => {
    setAdminSettings((current) => ({
      ...current,
      shortener: {
        ...current.shortener,
        episodeUnlockRules: normalizeAdUnlockRules(current.shortener?.episodeUnlockRules).map((rule, ruleIndex) => (
          ruleIndex === index ? { ...rule, [key]: value === '' ? null : value } : rule
        )),
      },
    }))
    setSettingsDirty(true)
  }

  const addShortenerUnlockRule = () => {
    if (shortenerUnlockRules.some((rule) => rule.endEpisode == null || String(rule.endEpisode).trim() === '')) {
      showToast('Set an End Episode on the unlimited Shortener rule before adding another rule.', 'error')
      return
    }
    const finiteEnds = shortenerUnlockRules.map((rule) => Number(rule.endEpisode)).filter((value) => Number.isInteger(value) && value >= 1)
    const lastEnd = finiteEnds.length ? Math.max(...finiteEnds) : null
    const nextStart = Number.isInteger(lastEnd) ? lastEnd + 1 : ''
    setAdminSettings((current) => ({
      ...current,
      shortener: {
        ...current.shortener,
        episodeUnlockRules: [
          ...normalizeAdUnlockRules(current.shortener?.episodeUnlockRules),
          { startEpisode: nextStart, endEpisode: null, unlockCount: 1 },
        ],
      },
    }))
    setSettingsDirty(true)
  }

  const deleteShortenerUnlockRule = (index) => {
    setAdminSettings((current) => ({
      ...current,
      shortener: {
        ...current.shortener,
        episodeUnlockRules: normalizeAdUnlockRules(current.shortener?.episodeUnlockRules).filter((_, ruleIndex) => ruleIndex !== index),
      },
    }))
    setSettingsDirty(true)
  }

  const saveAdminSettings = async () => {
    const ruleValidation = validateAdUnlockRules(adminSettings.ads?.episodeUnlockRules)
    if (!ruleValidation.valid) {
      showToast(ruleValidation.errors[0] || 'Fix the Ads episode unlock rules before saving.', 'error')
      return
    }
    if (!shortenerRuleValidation.valid) {
      showToast(shortenerRuleValidation.errors[0] || 'Fix the Shortener episode unlock rules before saving.', 'error')
      return
    }

    const settingsToSave = {
      ...adminSettings,
      appearance: normalizeAppearance(adminSettings.appearance),
      ads: {
        ...adminSettings.ads,
        episodeUnlockRules: ruleValidation.normalizedRules,
      },
      shortener: {
        ...normalizeShortenerSettings(adminSettings.shortener),
        enabled: adminSettings.shortener?.enabled === true,
        shortenerEnabled: adminSettings.shortener?.enabled === true,
        unlockDurationMinutes: Math.min(1440, Math.max(1, Number(adminSettings.shortener?.unlockDurationMinutes) || 360)),
        episodeUnlockRules: shortenerRuleValidation.normalizedRules,
      },
    }

    setAdminSettings(settingsToSave)

    try {
      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settingsToSave))
      setEpisodeAccessType(settingsToSave.content.defaultAudioAccess)
      setBookAccessType(settingsToSave.content.defaultBookAccess)
      setVideoAccessType(settingsToSave.content.defaultVideoAccess)
      setBulkDefaultAccessType(settingsToSave.content.defaultAudioAccess)
      setVideoBulkDefaultAccessType(settingsToSave.content.defaultVideoAccess)
      setBookBulkDefaultAccessType(settingsToSave.content.defaultBookAccess)
      const { error: cloudError } = await supabase
        .from('app_settings')
        .upsert({
          id: 'hj_admin_settings',
          value: settingsToSave,
          updated_at: new Date().toISOString(),
        })

      if (cloudError) throw cloudError

      const preview = normalizeContentAccessSettings(settingsToSave.content)
      const { error: previewError } = await supabase
        .from('content_access_settings')
        .upsert({
          id: 'default',
          audio_free_episodes: preview.freeAudioEpisodes,
          video_free_episodes: preview.freeVideoEpisodes,
          book_free_pages: preview.freeBookPages,
          ad_unlock_duration_minutes: Math.min(1440, Math.max(1, Number(settingsToSave.ads.unlockDurationMinutes) || 360)),
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
  const [storyGenre, setStoryGenre] = useState(['Fantasy'])
  const [storyLanguage, setStoryLanguage] = useState('Tamil')
  const [storyCover, setStoryCover] = useState('')
  const [storyCoverUploading, setStoryCoverUploading] = useState(false)
  const [storyDescription, setStoryDescription] = useState('')
  const [storyStatus, setStoryStatus] = useState('ongoing')

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
  const [bulkImporting, setBulkImporting] = useState(false)
  const bulkImportRunningRef = useRef(false)
  const [bulkImportProgress, setBulkImportProgress] = useState({
    status: 'idle',
    processed: 0,
    total: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0,
    currentItem: '',
    error: '',
  })
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
  const [bookStatus, setBookStatus] = useState('ongoing')
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

  const submitVolumeToExistingBook = async (event) => {
    event.preventDefault()
    const book = books.find((item) => String(item.id) === String(volumeBookId))
    if (!book) {
      showToast('Select a book first', 'error')
      return
    }
    if (!volumeTitle.trim() || !volumeFile.trim()) {
      showToast('Volume name and file are required', 'error')
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

    try {
      await onUpdateBook(book.id, {
        ...book,
        volumes: [...existingVolumes, nextVolume],
      })
      showToast(`Volume ${nextNumber} added to ${book.title}`)
      resetAddVolumeForm()
    } catch (error) {
      console.error('Error adding book volume:', error)
      showToast('Error adding book volume: ' + (error?.message || error), 'error')
    }
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
  const [videoStatus, setVideoStatus] = useState('ongoing')
  
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

      const res = await fetchTelegramMessages('', {
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
      // Telegram scan normally returns newest-first. Select All imports from
      // the bottom of that list first so auto-numbered episodes become 1, 2,
      // 3 ... in chronological/message order.
      setBulkSelectedIds([...bulkMessages].reverse().map(m => m.messageId))
    }
  }

  const handleBulkTitleChange = (msgId, title) => {
    setBulkTitleOverrides(prev => ({ ...prev, [msgId]: title }))
  }

  const handleBulkNumberChange = (msgId, num) => {
    setBulkNumberOverrides(prev => ({ ...prev, [msgId]: num }))
  }

  const handleBulkImport = async () => {
    if (bulkImportRunningRef.current) {
      showToast('Telegram import is already running.', 'error')
      return
    }

    const story = stories.find((item) => String(item.id) === String(bulkStoryId))
    if (!story) {
      showToast('Select a story first.', 'error')
      return
    }

    const selectedMsgs = sortTelegramMessagesOldestFirst(
      bulkSelectedIds
        .map((id) => bulkMessages.find((message) => String(message.messageId) === String(id)))
        .filter(Boolean)
    )

    if (!selectedMsgs.length) {
      showToast('Select at least one Telegram message.', 'error')
      return
    }

    const validSelected = selectedMsgs.filter((msg) => Number.isInteger(Number(msg.messageId)) && Number(msg.messageId) > 0)
    const invalidCount = selectedMsgs.length - validSelected.length

    bulkImportRunningRef.current = true
    setBulkImporting(true)
    setBulkImportProgress({
      status: 'running',
      processed: 0,
      total: validSelected.length,
      imported: 0,
      skipped: invalidCount,
      duplicates: 0,
      failed: 0,
      currentItem: validSelected.length ? String(validSelected[0].fileName || validSelected[0].caption || 'Telegram message ' + validSelected[0].messageId).trim() : '',
      error: '',
    })

    let processedCount = 0
    let importedCount = 0
    let skippedCount = invalidCount
    let duplicateCount = 0
    let failedCount = 0

    try {
      const fresh = await getFreshEpisodeImportState(story.id, validSelected.map((msg) => Number(msg.messageId)))
      let maxEpisodeNumber = Number(fresh.maxNumber) || 0
      const existingMessageIds = new Set(fresh.existingMessageIds)

      for (const [index, msg] of validSelected.entries()) {
        const messageId = Number(msg.messageId)
        const overrideTitle = String(bulkTitleOverrides[msg.messageId] ?? '').trim()
        const label = overrideTitle || buildTelegramMediaTitle(msg, maxEpisodeNumber + 1, 'Episode')
        const existing = existingMessageIds.has(messageId)

        setBulkImportProgress((prev) => ({
          ...prev,
          currentItem: label || 'Telegram message ' + messageId,
          processed: processedCount,
          imported: importedCount,
          skipped: skippedCount,
          duplicates: duplicateCount,
          failed: failedCount,
        }))

        if (existing) {
          duplicateCount++
          processedCount++
          setBulkImportProgress((prev) => ({
            ...prev,
            processed: processedCount,
            duplicates: duplicateCount,
          }))
          continue
        }

        const overrideNumber = Number(bulkNumberOverrides[msg.messageId])
        const finalNumber = Number.isInteger(overrideNumber) && overrideNumber > 0
          ? overrideNumber
          : maxEpisodeNumber + 1

        const episode = {
          number: finalNumber,
          title: label || 'Episode ' + finalNumber,
          type: 'audio',
          src: '',
          telegram_message_id: messageId,
          available: true,
          accessType: bulkAccessTypes[msg.messageId] || bulkDefaultAccessType,
        }

        try {
          const result = await onAddEpisode(story.id, episode)
          if (result?.status === 'duplicate') {
            duplicateCount++
          } else {
            importedCount++
            maxEpisodeNumber = Math.max(maxEpisodeNumber, finalNumber)
            existingMessageIds.add(messageId)
          }
        } catch (error) {
          failedCount++
          console.error('Telegram episode import failed:', {
            storyId: story.id,
            messageId,
            error,
          })
        }

        processedCount++
        setBulkImportProgress({
          status: 'running',
          processed: processedCount,
          total: validSelected.length,
          imported: importedCount,
          skipped: skippedCount,
          duplicates: duplicateCount,
          failed: failedCount,
          currentItem: index + 1 < validSelected.length
            ? buildTelegramMediaTitle(validSelected[index + 1], maxEpisodeNumber + 1, 'Episode')
            : '',
          error: '',
        })
      }

      setBulkSelectedIds([])
      const finalStatus = failedCount > 0 ? 'failed' : 'completed'
      setBulkImportProgress({
        status: finalStatus,
        processed: processedCount,
        total: validSelected.length,
        imported: importedCount,
        skipped: skippedCount,
        duplicates: duplicateCount,
        failed: failedCount,
        currentItem: '',
        error: failedCount > 0
          ? failedCount + ' Telegram item(s) failed to import. Check the error details and retry the failed item(s).'
          : '',
      })

      if (failedCount > 0) {
        showToast(importedCount + ' imported, ' + duplicateCount + ' duplicates, ' + skippedCount + ' skipped, ' + failedCount + ' failed.', 'error')
      } else {
        showToast(importedCount + ' imported, ' + duplicateCount + ' duplicates skipped, ' + skippedCount + ' invalid selections skipped.')
      }
    } catch (error) {
      console.error('Error during bulk Telegram import:', error)
      setBulkImportProgress({
        status: 'failed',
        processed: processedCount,
        total: validSelected.length,
        imported: importedCount,
        skipped: skippedCount,
        duplicates: duplicateCount,
        failed: failedCount,
        currentItem: '',
        error: String(error?.message || 'Telegram import failed.'),
      })
      showToast('Telegram import failed: ' + (error?.message || error), 'error')
    } finally {
      bulkImportRunningRef.current = false
      setBulkImporting(false)
    }
  }

  const resetStoryForm = () => {
    setEditingStoryId(null)
    setStoryTitle('')
    setStoryGenre(['Fantasy'])
    setStoryLanguage('Tamil')
    setStoryCover('')
    setStoryDescription('')
    setStoryStatus('ongoing')
  }

  const startEditStory = (story) => {
    setEditingStoryId(story.id)
    setStoryTitle(story.title || '')
    setStoryGenre(normalizeGenreSelection(story.genre, ['Fantasy']))
    setStoryLanguage(story.language || 'Tamil')
    setStoryCover(story.cover || '')
    setStoryDescription(story.description || '')
    setStoryStatus(normalizeContentStatus(story.status))
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
          genre: serializeGenreSelection(storyGenre),
          language: storyLanguage,
          cover: storyCover.trim(),
          description: storyDescription.trim(),
          status: storyStatus,
        })
        showToast('Story updated successfully')
      } else {
        await onAddStory({
          title: storyTitle.trim(),
          genre: serializeGenreSelection(storyGenre),
          language: storyLanguage,
          cover: storyCover.trim(),
          description: storyDescription.trim(),
          status: storyStatus,
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
    setEditingEpisode({ storyId: story.id, originalId: episode.id ?? null, originalNumber: episode.number })
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

    const protectedEpisode = resolveAccessType(episodeAccessType).some((type) => ['ads', 'premium', 'vip'].includes(type))
    if (protectedEpisode && !extractedTelegramId) {
      showToast('Protected audio/video must use a Telegram source.', 'error')
      return
    }

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
        await onUpdateEpisode(
          editingEpisode.storyId,
          Number(editingEpisode.originalNumber),
          data,
          editingEpisode.originalId
        )
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
  setBookStatus('ongoing')
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
  setBookStatus(normalizeContentStatus(book.status))
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
    showToast('Title, cover image and either a Telegram message URL, a book upload, or at least one volume are required', 'error')
    return
  }

  if (bookTelegramUrl.trim() && !bookTelegramMessageId) {
    showToast('Invalid Telegram URL. Make sure it ends with the message ID.', 'error')
    return
  }

  const protectedBook = resolveAccessType(bookAccessType).some((type) => ['ads', 'premium', 'vip'].includes(type))
  if (protectedBook && !bookTelegramMessageId) {
    showToast('Protected books must use a Telegram document source. Direct uploaded protected books are not supported.', 'error')
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
    status: bookStatus,
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
      showToast('Book updated successfully')
    } else {
      await onAddBook({
        id: makeAdminEntityId(),
        ...data,
      })
      showToast('Book added successfully')
    }
    resetBookForm()
  } catch (error) {
    console.error('Error saving book:', error)
    showToast('Error saving book: ' + (error?.message || error), 'error')
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

      const res = await fetchTelegramMessages('type=video', {
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
      setVideoBulkSelectedIds([...videoBulkMessages].reverse().map((msg) => msg.messageId))
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

      const res = await fetchTelegramMessages('type=document', {
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
      setBookBulkSelectedIds([...bookBulkMessages].reverse().map((msg) => msg.messageId))
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
    setVideoStatus('ongoing')
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
    setVideoStatus(normalizeContentStatus(video.status))

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitVideo = async (event) => {
    event.preventDefault()

    const videoTelegramMessageId = extractTelegramMessageId(videoTelegramUrl)
    if (!videoTitle.trim() || !videoCover.trim() || (!videoSrc.trim() && !videoTelegramMessageId)) {
      showToast('Title, cover image and either a Telegram video URL or a video upload are required', 'error')
      return
    }

    if (videoTelegramUrl.trim() && !videoTelegramMessageId) {
      showToast('Invalid Telegram URL. Make sure it ends with the message ID.', 'error')
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
          status: videoStatus,
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
        showToast('Video updated successfully')
      } else {
        await onAddVideo({
          id: makeAdminEntityId(),
          title: videoTitle.trim(),
          category: videoCategory,
          cover: videoCover.trim(),
          accessType: videoAccessType,
          status: videoStatus,
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
        showToast('Video added successfully')
      }

      resetVideoForm()
    } catch (error) {
      console.error('Error saving video:', error)
      showToast('Error saving video: ' + (error?.message || error), 'error')
    }
  }

  const editVideoEpisode = async (video, episode) => {
    const newTitle = window.prompt('Episode title:', episode.title)
    if (newTitle === null) return

    const newSrc = window.prompt('Video URL (paste an existing Supabase file URL):', episode.src)
    if (newSrc === null) return

    try {
      await onUpdateVideoEpisode(video.id, episode.number, { title: newTitle.trim(), src: newSrc.trim() })
      showToast('Video episode updated successfully')
    } catch (error) {
      console.error('Error updating video episode:', error)
      showToast('Error updating video episode: ' + (error?.message || error), 'error')
    }
  }

  const handleDeleteBook = async (book) => {
    if (!window.confirm(`Delete "${book.title}"?`)) return
    try {
      await onDeleteBook(book.id)
      showToast('Book deleted successfully')
    } catch (error) {
      console.error('Error deleting book:', error)
      showToast('Error deleting book: ' + (error?.message || error), 'error')
    }
  }

  const handleDeleteVideo = async (video) => {
    if (!window.confirm(`Delete "${video.title}"?`)) return
    try {
      await onDeleteVideo(video.id)
      showToast('Video story deleted successfully')
    } catch (error) {
      console.error('Error deleting video story:', error)
      showToast('Error deleting video story: ' + (error?.message || error), 'error')
    }
  }

  const handleDeleteVideoEpisode = async (video, episode) => {
    if (!window.confirm(`Delete Episode ${episode.number}?`)) return
    try {
      await onDeleteVideoEpisode(video.id, episode.number)
      showToast(`Video episode ${episode.number} deleted successfully`)
    } catch (error) {
      console.error('Error deleting video episode:', error)
      showToast('Error deleting video episode: ' + (error?.message || error), 'error')
    }
  }

  /* =====================================================
     RENDER
  ===================================================== */

  const handleDeleteStory = async (story) => {
    if (!window.confirm('Are you sure you want to delete this story?')) return
    try {
      await onDeleteStory(story.id)
      showToast('Story deleted successfully')
    } catch (error) {
      console.error(error)
      showToast('Error deleting story: ' + (error?.message || error), 'error')
    }
  }

  const handleDeleteEpisode = async (storyId, episodeId) => {
    if (!episodeId) {
      showToast('This episode is missing its database ID and cannot be safely deleted.', 'error')
      return
    }
    if (window.confirm('Are you sure you want to delete this episode?')) {
      try {
        await onDeleteEpisode(storyId, episodeId)
        showToast('Episode deleted successfully')
      } catch (error) {
        console.error('Error deleting episode:', error)
        showToast(`Error deleting episode: ${error?.message || error}`, 'error')
      }
    }
  }

  const securityCategoryCards = [
    { key: 'authentication', label: 'Authentication', icon: '🔐', progressKey: 'Admin Authentication', match: (f) => /auth|session|admin/i.test(String(f.component || '')) },
    { key: 'database', label: 'Database / RLS', icon: '🗄️', progressKey: 'Database / RLS', match: (f) => /database|rls/i.test(String(f.component || '')) },
    { key: 'environment', label: 'Environment Secrets', icon: '🔑', progressKey: 'Source & Environment Secrets', match: (f) => /secret|environment/i.test(String(f.component || '')) },
    { key: 'api', label: 'API Security', icon: '🌐', progressKey: 'API & CORS', match: (f) => /cors|api|web-server|public-settings/i.test(String(f.component || '')) },
    { key: 'media', label: 'Media Protection', icon: '🎧', progressKey: 'Client & Media Protection', match: (f) => /media/i.test(String(f.component || '')) },
    { key: 'client', label: 'Client Security', icon: '🛡️', progressKey: 'Client & Media Protection', match: (f) => /client/i.test(String(f.component || '')) },
    { key: 'dependencies', label: 'Dependencies', icon: '📦', progressKey: 'Dependency Advisories', match: (f) => f.category === 'dependency' },
  ].map((item) => {
    const findings = securityFindings.filter((finding) => finding.status !== 'closed' && item.match(finding))
    const severe = findings.some((f) => ['critical', 'high'].includes(f.severity))
    const warning = findings.some((f) => ['medium', 'low'].includes(f.severity))
    const phase = securityProgress.checks.find((check) => check.label === item.progressKey)
    const phaseRunning = manualSecurityRunning && phase?.status === 'running'
    const phasePending = manualSecurityRunning && (!phase || phase.status === 'pending')
    return {
      ...item,
      findings,
      status: manualSecurityRunning
        ? phaseRunning ? 'RUNNING' : phasePending ? 'PENDING' : severe ? 'FAIL' : warning ? 'WARNING' : 'PASS'
        : severe ? 'FAIL' : warning ? 'WARNING' : 'PASS',
    }
  })

  const overallSecurityStatus = manualSecurityResult?.summary?.overall
    || (securityFindings.some((f) => f.status !== 'closed' && ['critical', 'high'].includes(f.severity))
      ? 'issues_found'
      : securityFindings.some((f) => f.status !== 'closed' && ['medium', 'low'].includes(f.severity))
        ? 'warnings'
        : 'secure')

  return (
    <>
      {toastMessage && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="admin-toast"
              data-testid="admin-toast"
              role={toastType === 'error' ? 'alert' : 'status'}
              aria-live={toastType === 'error' ? 'assertive' : 'polite'}
              aria-atomic="true"
              style={{
                position: 'fixed',
                top: 'calc(16px + env(safe-area-inset-top))',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(560px, calc(100vw - 32px))',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                backgroundColor: toastType === 'error' ? '#b91c1c' : '#166534',
                color: '#fff',
                padding: '12px 16px',
                border: '1px solid rgba(255,255,255,.16)',
                borderRadius: '12px',
                boxShadow: '0 14px 38px rgba(0,0,0,.38)',
                zIndex: 2147483000,
                pointerEvents: 'auto',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{toastMessage}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => {
                  if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
                  toastTimerRef.current = null
                  setToastMessage('')
                }}
                style={{
                  flex: '0 0 auto',
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: '18px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                ×
              </button>
            </div>,
            document.body
          )
        : null}
      <div className="admin-panel">
        <div className="admin-header">
        {tab !== 'overview' ? (
          <button type="button" className="secondary-btn" onClick={goBackAdminTab} aria-label="Back to previous admin section" title="Back to previous admin section">
            ← Back
          </button>
        ) : <span />}
        <strong>⚙ HJ GROUPS Admin</strong>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="admin-tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setAdminTab('overview')}>⌂ Overview</button>
        <button className={tab === 'create' ? 'active' : ''} onClick={() => setAdminTab('create')}>➕ Create</button>
        <button className={tab === 'manage' ? 'active' : ''} onClick={() => setAdminTab('manage')}>🛠️ Manage</button>
        <button className={tab === 'analytics' ? 'active' : ''} onClick={() => setAdminTab('analytics')}>📊 Analytics</button>
        <button className={tab === 'security' ? 'active' : ''} onClick={() => setAdminTab('security')}>🛡 Security</button>
        <button className={`admin-settings-tab-button ${tab === 'settings' ? 'active' : ''}`} onClick={() => setAdminTab('settings')}>⚙ Management & Settings</button>
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
                  <button onClick={() => setAdminTab('stories')}>＋ Add Audio Story</button>
                  <button onClick={() => setAdminTab('stories')}>＋ Add Episode</button>
                  <button onClick={() => setAdminTab('books')}>＋ Add Book</button>
                  <button onClick={() => setAdminTab('videos')}>＋ Add Video Story</button>
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
                    <button key={story.id} onClick={() => setAdminTab('stories')}>
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

        {tab === 'security' && (
          <section className="admin-section admin-security-dashboard">
            <div className="admin-security-head">
              <div>
                <div className="admin-eyebrow">DETECT · ANALYZE · REPORT</div>
                <h2>🔐 Security & Health Dashboard</h2>
                <p>Manual audits run the existing server-side security monitor and report findings without changing production.</p>
              </div>
              <div className="admin-security-actions">
                <button
                  type="button"
                  className="admin-submit"
                  onClick={runManualSecurityCheck}
                  disabled={manualSecurityRunning}
                >
                  {manualSecurityRunning ? '🔄 Scanning…' : '🔐 Run Security Check'}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => { void refreshSecurityData(); void refreshPlaywrightStatus() }}
                  disabled={securityLoading || playwrightLoading}
                >
                  🔄 Refresh Results
                </button>
              </div>
            </div>

            {securityError && <p className="auth-error" role="alert">{securityError}</p>}

            <div className="admin-security-summary">
              <div className="admin-security-overall">
                <small>Latest overall status</small>
                <strong>
                  {manualSecurityRunning
                    ? '🔄 SCANNING'
                    : overallSecurityStatus === 'issues_found'
                      ? '🔴 ISSUES FOUND'
                      : overallSecurityStatus === 'warnings'
                        ? '🟡 WARNINGS'
                        : '🟢 SECURE'}
                </strong>
                {manualSecurityResult?.scanId && <span>Scan #{manualSecurityResult.scanId}</span>}
              </div>
              <div className="admin-security-scan-meta">
                <span>Status: <b>{manualSecurityRunning ? 'Running' : manualSecurityResult?.status === 'failed' ? 'Failed' : manualSecurityResult?.status === 'completed' ? 'Completed' : 'Ready'}</b></span>
                {manualSecurityResult?.summary && <span>Findings: <b>{manualSecurityResult.summary.finding_count ?? 0}</b></span>}
              </div>
            </div>

            <div className="admin-security-check-grid">
              {securityCategoryCards.map((card) => (
                <article key={card.key} className={`admin-security-check-card status-${String(card.status).toLowerCase()}`}>
                  <div className="admin-security-check-card-head">
                    <span>{card.icon}</span>
                    <strong>{card.label}</strong>
                    <b>{card.status === 'PASS' ? '🟢 PASS' : card.status === 'WARNING' ? '🟡 WARNING' : card.status === 'RUNNING' ? '🔄 RUNNING' : card.status === 'PENDING' ? '⚪ PENDING' : '🔴 FAIL'}</b>
                  </div>
                  <p>
                    {card.status === 'PASS'
                      ? 'No active finding was reported for this check.'
                      : `${card.findings.length} finding${card.findings.length === 1 ? '' : 's'} require attention.`}
                  </p>
                </article>
              ))}
            </div>

            {manualSecurityResult?.error && (
              <p className="auth-error" role="alert">{manualSecurityResult.error}</p>
            )}

            {(manualSecurityRunning || securityProgress.total_checks > 0) && (
              <div className="admin-security-scan-progress" role="status" aria-live="polite">
                {manualSecurityRunning && <span className="admin-security-scan-spinner" aria-hidden="true" />}
                <div className="admin-security-scan-progress-content">
                  <div className="admin-security-scan-progress-head">
                    <strong>{manualSecurityRunning ? 'Security scan in progress…' : 'Latest security scan progress'}</strong>
                    <b>{Math.max(0, Math.min(100, securityProgress.progress_percent))}%</b>
                  </div>
                  <div className="admin-security-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.max(0, Math.min(100, securityProgress.progress_percent))}>
                    <span style={{ width: Math.max(0, Math.min(100, securityProgress.progress_percent)) + '%' }} />
                  </div>
                  <small>Checks completed: <b>{securityProgress.completed_checks}/{securityProgress.total_checks}</b>{securityProgress.current_check ? ` · Current: ${securityProgress.current_check}` : ' · All checks completed'}</small>
                  {Array.isArray(securityProgress.checks) && securityProgress.checks.length > 0 && (
                    <div className="admin-security-progress-phases">
                      {securityProgress.checks.map((check) => (
                        <span key={check.key} className={'phase-' + check.status}>
                          {check.status === 'completed' ? '✓' : check.status === 'running' ? '↻' : '○'} {check.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}           <section className="admin-security-browser">
              <div className="admin-security-browser-head">
                <div>
                  <div className="admin-eyebrow">REAL BROWSER VERIFICATION</div>
                  <h3>🧪 Browser / Playwright Verification</h3>
                  <p>Uses the existing <code>.github/workflows/playwright.yml</code> workflow. No simulated PASS results.</p>
                </div>
                <div className={`admin-security-playwright-badge status-${String(playwrightState.status || 'not_run').toLowerCase()}`}>
                  {playwrightState.status === 'passed' ? '🟢 Passed'
                    : playwrightState.status === 'failed' ? '🔴 Failed'
                      : playwrightState.status === 'queued' ? '🟡 Queued'
                        : ['running', 'in_progress'].includes(playwrightState.status) ? '🔄 Running'
                          : playwrightState.status === 'not_configured' ? '⚪ Not Configured'
                            : '⚪ Not Run'}
                </div>
              </div>

              <div className="admin-security-browser-actions">
                <button
                  type="button"
                  className="admin-submit"
                  onClick={runPlaywrightCheck}
                  disabled={playwrightLoading || ['queued', 'running', 'in_progress'].includes(playwrightState.status)}
                >
                  {playwrightLoading ? '⏳ Preparing…' : '▶ Run Playwright Check'}
                </button>
                <button type="button" className="secondary-btn" onClick={() => void refreshPlaywrightStatus()} disabled={playwrightLoading}>
                  🔄 Refresh Results
                </button>
              </div>

              {playwrightState.error && (
                <p className="auth-error" role="alert">{playwrightState.error}</p>
              )}

              {playwrightState.status === 'not_configured' && (
                <p className="admin-settings-note">
                  The UI is connected to the real workflow controller, but the server-side GitHub Actions credential is not configured. Set <code>HJ_GITHUB_ACTIONS_TOKEN</code> in the backend/server environment (Voroa/Node server); do not place it in VITE_ variables.
                </p>
              )}

              <div className="admin-security-playwright-grid">
                <div><small>Status</small><strong>{playwrightState.status || 'not_run'}</strong></div>
                <div><small>Last run</small><strong>{playwrightState.run?.createdAt ? new Date(playwrightState.run.createdAt).toLocaleString() : 'Not run'}</strong></div>
                <div><small>Commit SHA</small><strong>{playwrightState.run?.commitSha ? playwrightState.run.commitSha.slice(0, 12) : '—'}</strong></div>
                <div><small>Workflow run</small><strong>{playwrightState.run?.runNumber ? `#${playwrightState.run.runNumber}` : '—'}</strong></div>
                <div><small>Duration</small><strong>{playwrightState.run?.durationMs ? `${Math.round(playwrightState.run.durationMs / 1000)}s` : '—'}</strong></div>
                <div><small>Tests</small><strong>{playwrightState.tests ? `${playwrightState.tests.passed} passed · ${playwrightState.tests.failed} failed · ${playwrightState.tests.skipped} skipped` : '—'}</strong></div>
              </div>

              {Array.isArray(playwrightState.browserCoverage) && playwrightState.browserCoverage.length > 0 && (
                <div className="admin-security-browser-coverage">
                  <small>Browser / device coverage</small>
                  <div>{playwrightState.browserCoverage.map((item) => <span key={item}>{item}</span>)}</div>
                </div>
              )}
            </section>

            {!securityLoading && (
              <>
                <div className="admin-stat-grid">
                  {[
                    ['🧾', 'Total Findings', securityFindings.length],
                    ['🔴', 'Critical', securityFindings.filter(f => f.severity === 'critical' && f.status !== 'closed').length],
                    ['🟠', 'High', securityFindings.filter(f => f.severity === 'high' && f.status !== 'closed').length],
                    ['🟡', 'Medium', securityFindings.filter(f => f.severity === 'medium' && f.status !== 'closed').length],
                    ['🔵', 'Low', securityFindings.filter(f => f.severity === 'low' && f.status !== 'closed').length],
                    ['✓', 'Fixed / Closed', securityFindings.filter(f => ['fixed', 'retested', 'closed'].includes(f.status)).length],
                  ].map(([i, l, v]) => (
                    <div className="admin-stat-card" key={l}><span className="admin-stat-icon">{i}</span><small>{l}</small><strong>{v}</strong></div>
                  ))}
                </div>

                <div className="admin-security-filters">
                  <select aria-label="Severity filter" onChange={e => document.querySelectorAll('[data-security-row]').forEach(el => { el.hidden = !!e.target.value && el.dataset.severity !== e.target.value })}>
                    <option value="">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="informational">Informational</option>
                  </select>
                </div>

                <div className="admin-security-list">
                  {securityFindings.map(f => (
                    <article key={f.id} data-security-row data-severity={f.severity} className="admin-security-finding">
                      <header>
                        <strong>{({ critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🔵 Low', informational: '🟢 Informational' })[f.severity] || f.severity}</strong>
                        <span>{String(f.status || 'new').replace('_', ' ')}</span>
                      </header>
                      <h3>{f.description}</h3>
                      <p><b>Component:</b> {f.component} · <b>Location:</b> {f.location || 'Not specified'}</p>
                      <p><b>Impact:</b> {f.impact || 'Not provided'}</p>
                      <p><b>Evidence:</b> {f.evidence || 'Not provided'}</p>
                      <p><b>Root cause:</b> {f.root_cause || 'Not verified'}</p>
                      <p><b>Recommended fix:</b> {f.recommended_fix || 'Not provided'}</p>
                      <p><b>Verification:</b> {f.verification || 'Retest after remediation.'}</p>
                      <small>First: {f.first_detected_at ? new Date(f.first_detected_at).toLocaleString() : '—'} · Last: {f.last_detected_at ? new Date(f.last_detected_at).toLocaleString() : '—'} · Recurrences: {f.recurring_count || 1}</small>
                    </article>
                  ))}
                  {!securityFindings.length && <div className="admin-empty">No recorded findings yet. Run a manual security check to populate the report.</div>}
                </div>

                <section className="admin-section">
                  <h3>📋 Manual Check History</h3>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Check</th><th>Time</th><th>Result</th><th>Findings</th></tr></thead>
                      <tbody>
                        {securityScans.map(s => (
                          <tr key={s.id}>
                            <td>🔐 Security Scan</td>
                            <td>{new Date(s.started_at).toLocaleString()}</td>
                            <td>{s.summary?.overall === 'issues_found' ? '🔴 FAIL' : s.summary?.overall === 'warnings' ? '🟡 WARNING' : '🟢 PASS'}</td>
                            <td>{s.summary?.finding_count ?? 0}</td>
                          </tr>
                        ))}
                        {playwrightState.run?.createdAt && (
                          <tr>
                            <td>🧪 Playwright</td>
                            <td>{new Date(playwrightState.run.createdAt).toLocaleString()}</td>
                            <td>{playwrightState.status === 'passed' ? '🟢 PASS' : playwrightState.status === 'failed' ? '🔴 FAIL' : '🟡 ' + String(playwrightState.status || 'RUNNING').toUpperCase()}</td>
                            <td>{playwrightState.tests ? `${playwrightState.tests.passed} passed / ${playwrightState.tests.failed} failed / ${playwrightState.tests.skipped} skipped` : '—'}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-section">
                  <h3>Recent security monitor scans</h3>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Started</th><th>Status</th><th>Findings</th><th>Critical</th><th>High</th></tr></thead>
                      <tbody>
                        {securityScans.map(s => (
                          <tr key={`monitor-${s.id}`}>
                            <td>{new Date(s.started_at).toLocaleString()}</td>
                            <td>{s.status}</td>
                            <td>{s.summary?.finding_count ?? 0}</td>
                            <td>{s.summary?.critical ?? 0}</td>
                            <td>{s.summary?.high ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </section>
        )}

        {(tab === 'create' || tab === 'manage') && (
          <AdminContentV2
            mode={tab}
            stories={stories}
            books={books}
            videoStories={videoStories}
            adminStoryIds={adminStoryIds}
            adminBookIds={adminBookIds}
            adminVideoIds={adminVideoIds}
            onAddStory={onAddStory}
            onUpdateStory={onUpdateStory}
            onAddEpisode={onAddEpisode}
            onUpdateEpisode={onUpdateEpisode}
            onDeleteStory={onDeleteStory}
            onDeleteEpisode={onDeleteEpisode}
            onAddBook={onAddBook}
            onUpdateBook={onUpdateBook}
            onDeleteBook={onDeleteBook}
            onAddVideo={onAddVideo}
            onUpdateVideo={onUpdateVideo}
            onAddVideoEpisode={onAddVideoEpisode}
            onUpdateVideoEpisode={onUpdateVideoEpisode}
            onDeleteVideo={onDeleteVideo}
            onDeleteVideoEpisode={onDeleteVideoEpisode}
            toast={showToast}
          />
        )}

        {tab === 'analytics' && (
          <section className="admin-section" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
              <div>
                <div className="admin-eyebrow">USER ACTIVITY</div>
                <h2 style={{ margin: '4px 0' }}>Analytics</h2>
                <p style={{ margin: 0, opacity: 0.75 }}>Factual activity only — anonymous sessions use a random browser session ID; authenticated activity uses the Supabase user ID.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value)} aria-label="Analytics date range">
                  <option value="today">Today</option><option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option><option value="all">All Time</option>
                </select>
                <select value={analyticsGrouping} onChange={(event) => setAnalyticsGrouping(event.target.value)} aria-label="Analytics grouping">
                  <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
                </select>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={downloadUserExport}
                  disabled={userExportLoading}
                  title="Download first-party HJ GROUPS user and analytics data as Excel"
                >
                  {userExportLoading ? '⏳ Preparing Excel…' : '📥 Download User Data'}
                </button>
              </div>
            </div>
            {userExportError && <p className="auth-error" role="alert">{userExportError}</p>}
            {analyticsLoading && <p>Loading analytics…</p>}
            {analyticsError && <p className="auth-error" role="alert">{analyticsError}</p>}
            {analyticsLoading && (
              <section className="admin-section admin-episode-analytics admin-analytics-state">
                <h3>🎧 Episode Analytics</h3>
                <p>Loading real analytics data…</p>
              </section>
            )}
            {analyticsError && (
              <section className="admin-section admin-episode-analytics admin-analytics-state">
                <h3>🎧 Episode Analytics</h3>
                <p className="auth-error" role="alert">{analyticsError}</p>
                <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>🔄 Retry Analytics</button>
              </section>
            )}
            {!analyticsLoading && !analyticsError && analyticsData && (
              <>
                <div className="admin-stat-grid">
                  {[
                    ['👥', 'Registered Users', analyticsData.overview?.registered_users ?? 0],
                    ['🟢', 'Active Logged-in Users', analyticsData.overview?.active_logged_in_users ?? 0],
                    ['🕶️', 'Active Anonymous Sessions', analyticsData.overview?.active_anonymous_sessions ?? 0],
                    ['📖', 'Story Views', analyticsData.overview?.story_views ?? 0],
                    ['▶', 'Episode Plays', analyticsData.overview?.episode_plays ?? 0],
                    ['👤', 'Unique Episode Viewers', Number(analyticsData.overview?.logged_in_episode_viewers || 0) + Number(analyticsData.overview?.anonymous_episode_viewers || 0)],
                    ['✓', 'Episode Completions', analyticsData.overview?.episode_completions ?? 0],
                    ['📢', 'Ad Unlock Starts', analyticsData.overview?.ad_unlock_starts ?? 0],
                    ['✅', 'Ad Unlock Completions', analyticsData.overview?.ad_unlock_completions ?? 0],
                    ['🔓', 'Actual Ad Unlocks', analyticsData.overview?.actual_ad_unlocks ?? 0],
                    ['🔗', 'Actual Shortener Unlocks', analyticsData.overview?.actual_shortener_unlocks ?? 0],
                    ['♛', 'Premium/VIP Accesses', analyticsData.overview?.premium_vip_accesses ?? 0],
                  ].map(([icon, label, value]) => (
                    <div className="admin-stat-card" key={label}><span className="admin-stat-icon">{icon}</span><small>{label}</small><strong>{value}</strong></div>
                  ))}
                </div>
                <AdminAnalyticsCharts data={analyticsData} />
                <section className="admin-section" style={{ marginTop: '18px' }}>
                  <h3>📚 Story Analytics</h3>
                  <div style={{ overflowX: 'auto' }}><table className="admin-table"><thead><tr><th>Story</th><th>Views</th><th>Unique Viewers</th><th>Episode Plays</th><th>Unique Episode Viewers</th><th>Completions</th><th>Ad Starts</th><th>Ad Completions</th><th>Shortener Completions</th><th>Actual Ad Unlocks</th><th>Actual Shortener Unlocks</th></tr></thead><tbody>
                    {(analyticsData.stories || []).map((row) => <tr key={row.id}><td>{row.title || 'Untitled'}</td><td>{row.story_views}</td><td>{Number(row.logged_in_unique_viewers || 0) + Number(row.anonymous_unique_viewers || 0)}</td><td>{row.episode_plays}</td><td>{Number(row.logged_in_episode_viewers || 0) + Number(row.anonymous_episode_viewers || 0)}</td><td>{row.episode_completions}</td><td>{row.ad_unlock_starts}</td><td>{row.ad_unlock_completions}</td><td>{row.shortener_unlock_completions}</td><td>{row.actual_ad_unlocks ?? 0}</td><td>{row.actual_shortener_unlocks ?? 0}</td></tr>)}
                  </tbody></table></div>
                </section>
                {(() => {
                  const episodes = Array.isArray(analyticsData.episodes) ? analyticsData.episodes : []
                  const stories = Array.isArray(analyticsData.stories) ? analyticsData.stories : []
                  const selectedStory = stories.find(
                    (story) => Number(story.id) === Number(analyticsSelectedStoryId)
                  ) || null
                  const storyEpisodes = selectedStory
                    ? episodes.filter((row) => Number(row.story_id) === Number(selectedStory.id))
                    : []
                  const storySearch = analyticsStorySearch.trim().toLowerCase()
                  const episodeSearch = analyticsEpisodeSearch.trim().toLowerCase()
                  const storySearchTerms = storySearch.split(/\s+/).filter(Boolean)
                  const episodeSearchTerms = episodeSearch.split(/\s+/).filter(Boolean)
                  const storyMatches = stories.filter((story) => {
                    if (!storySearchTerms.length) return true
                    const searchable = [story.title, story.id].join(' ').toLowerCase()
                    return storySearchTerms.every((term) => searchable.includes(term))
                  })
                  const episodeMatches = storyEpisodes.filter((row) => {
                    if (!episodeSearchTerms.length) return true
                    const episodeNumber = Number(row.episode_number)
                    const searchable = [row.episode_number, row.title].join(' ').toLowerCase()

                    return episodeSearchTerms.every((term) => {
                      const episodePrefix = term.match(/^ep0*(\d+)$/i)
                      if (
                        episodePrefix &&
                        Number.isInteger(episodeNumber) &&
                        episodeNumber === Number(episodePrefix[1])
                      ) {
                        return true
                      }

                      return searchable.includes(term)
                    })
                  })
                  const selectedEpisode = analyticsSelectedEpisode
                    ? storyEpisodes.find(
                      (row) => String(row.id ?? '').trim() === String(analyticsSelectedEpisode.id ?? '').trim()
                    ) || analyticsSelectedEpisode
                    : null
                  const selectedEpisodeIndex = selectedEpisode
                    ? storyEpisodes.findIndex((row) => String(row.id ?? '').trim() === String(selectedEpisode.id ?? '').trim())
                    : -1
                  const appliedBatchEpisodes = storyEpisodes.filter((row) =>
                    analyticsBatchEpisodeIds.some((id) => String(id ?? '').trim() === String(row.id ?? '').trim())
                  )
                  const batchSummary = summarizeEpisodeAnalyticsBatch(appliedBatchEpisodes)
                  const batchStart = appliedBatchEpisodes[0] || null
                  const batchEnd = appliedBatchEpisodes[appliedBatchEpisodes.length - 1] || null
                  const applyEpisodeBatch = () => {
                    if (selectedEpisodeIndex < 0) return
                    const batch = getEpisodeAnalyticsBatch(storyEpisodes, selectedEpisode.id, analyticsBatchSize)
                    setAnalyticsBatchEpisodeIds(batch.map((row) => row.id))
                    setAnalyticsEpisodePickerOpen(false)
                  }

                  return (
                    <section className="admin-section admin-episode-analytics" style={{ marginTop: '18px' }}>
                      <h3>🎧 Episode Analytics</h3>

                      <div className="admin-episode-analytics-picker">
                        <div className="admin-episode-analytics-picker-head">
                          <button
                            type="button"
                            className="admin-episode-picker-button"
                            onClick={() => setAnalyticsStoryPickerOpen((open) => !open)}
                            aria-expanded={analyticsStoryPickerOpen}
                            aria-label="Search and select a story for analytics"
                          >
                            {selectedStory ? `📚 ${selectedStory.title || 'Untitled Story'}` : '📚 Select Story'}
                            <span aria-hidden="true">{analyticsStoryPickerOpen ? '⌃' : '⌄'}</span>
                          </button>
                          {selectedStory && (
                            <button
                              type="button"
                              className="secondary-btn admin-episode-picker-clear"
                              onClick={() => {
                                setAnalyticsSelectedStoryId(null)
                                setAnalyticsStorySearch('')
                                setAnalyticsEpisodeSearch('')
                                setAnalyticsSelectedEpisode(null)
                                setAnalyticsBatchEpisodeIds([])
                                setAnalyticsStoryPickerOpen(false)
                                setAnalyticsEpisodePickerOpen(false)
                              }}
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        {analyticsStoryPickerOpen && (
                          <div className="admin-episode-picker-panel">
                            <input
                              type="search"
                              value={analyticsStorySearch}
                              onChange={(event) => setAnalyticsStorySearch(event.target.value)}
                              placeholder="Search story title…"
                              aria-label="Search stories"
                              autoComplete="off"
                            />
                            <div className="admin-episode-picker-results">
                              {storyMatches.length ? storyMatches.map((story) => (
                                <button
                                  key={story.id}
                                  type="button"
                                  className={Number(story.id) === Number(analyticsSelectedStoryId) ? 'selected' : ''}
                                  onClick={() => {
                                    setAnalyticsSelectedStoryId(story.id)
                                    setAnalyticsStorySearch('')
                                    setAnalyticsSelectedEpisode(null)
                                    setAnalyticsBatchEpisodeIds([])
                                    setAnalyticsEpisodeSearch('')
                                    setAnalyticsStoryPickerOpen(false)
                                    setAnalyticsEpisodePickerOpen(false)
                                  }}
                                >
                                  <strong>{story.title || 'Untitled Story'}</strong>
                                  <span>{story.story_views ?? 0} story views · {story.episode_plays ?? 0} episode plays</span>
                                </button>
                              )) : (
                                <span className="admin-episode-picker-empty">No matching stories.</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedStory && (
                        <div className="admin-episode-analytics-picker">
                          <div className="admin-episode-analytics-picker-head">
                            <button
                              type="button"
                              className="admin-episode-picker-button"
                              onClick={() => setAnalyticsEpisodePickerOpen((open) => !open)}
                              aria-expanded={analyticsEpisodePickerOpen}
                              aria-label="Search and select an episode for analytics"
                            >
                              {selectedEpisode
                                ? `🎧 Episode ${selectedEpisode.episode_number} · ${selectedEpisode.title || 'Untitled'}`
                                : '🎧 Select Episode'}
                              <span aria-hidden="true">{analyticsEpisodePickerOpen ? '⌃' : '⌄'}</span>
                            </button>
                            {selectedEpisode && (
                              <button
                                type="button"
                                className="secondary-btn admin-episode-picker-clear"
                                onClick={() => {
                                  setAnalyticsSelectedEpisode(null)
                                  setAnalyticsBatchEpisodeIds([])
                                  setAnalyticsEpisodeSearch('')
                                  setAnalyticsEpisodePickerOpen(false)
                                }}
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          {analyticsEpisodePickerOpen && (
                            <div className="admin-episode-picker-panel">
                              <input
                                type="search"
                                value={analyticsEpisodeSearch}
                                onChange={(event) => setAnalyticsEpisodeSearch(event.target.value)}
                                placeholder="Search episode number or title…"
                                aria-label="Search episodes"
                                autoComplete="off"
                              />
                              <label className="admin-analytics-batch-size">
                                Episodes per batch
                                <select
                                  aria-label="Analytics batch size"
                                  value={analyticsBatchSize}
                                  onChange={(event) => setAnalyticsBatchSize(Number(event.target.value))}
                                >
                                  {ANALYTICS_BATCH_SIZES.map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                  ))}
                                </select>
                              </label>
                              <div className="admin-episode-picker-results">
                                {episodeMatches.length ? episodeMatches.map((row) => (
                                  <button
                                    key={row.id}
                                    type="button"
                                    className={Number(row.id) === Number(selectedEpisode?.id) ? 'selected' : ''}
                                    onClick={() => {
                                      setAnalyticsSelectedEpisode(row)
                                      setAnalyticsEpisodeSearch('')
                                      setAnalyticsEpisodePickerOpen(false)
                                    }}
                                  >
                                    <strong>Episode {row.episode_number}</strong>
                                    <span>{row.title || 'Untitled'}</span>
                                  </button>
                                )) : (
                                  <span className="admin-episode-picker-empty">
                                    {episodeSearch ? 'No matching episodes.' : 'No episodes found for this story.'}
                                  </span>
                                )}
                              </div>
                              <div className="admin-analytics-picker-actions">
                                <button type="button" className="primary-btn" onClick={applyEpisodeBatch} disabled={!selectedEpisode}>
                                  ✓ OK — Show Batch
                                </button>
                                <span>
                                  {selectedEpisode
                                    ? `Starting Episode ${selectedEpisode.episode_number} · next ${analyticsBatchSize} existing episodes`
                                    : 'Select a starting episode first.'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {appliedBatchEpisodes.length ? (
                        <>
                          <div className="admin-analytics-batch-summary">
                            <div><small>Batch</small><strong>Episodes {batchStart?.episode_number}–{batchEnd?.episode_number}</strong></div>
                            <div><small>Episodes</small><strong>{batchSummary.episode_count}</strong></div>
                            <div><small>Total Plays</small><strong>{batchSummary.total_plays}</strong></div>
                            <div><small>Completed</small><strong>{batchSummary.completed_plays}</strong></div>
                            <div><small>Ad Starts</small><strong>{batchSummary.ad_unlock_starts}</strong></div>
                            <div><small>Ad Completions</small><strong>{batchSummary.ad_unlock_completions}</strong></div>
                            <div><small>Shortener Completions</small><strong>{batchSummary.shortener_unlock_completions}</strong></div>
                            <div><small>Avg Plays / Episode</small><strong>{batchSummary.average_plays_per_episode.toFixed(1)}</strong></div>
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table className="admin-table">
                              <thead><tr><th>Episode</th><th>Title</th><th>Total Plays</th><th>Unique Viewers</th><th>Completed Plays</th><th>Ad Starts</th><th>Ad Completions</th><th>Shortener Completions</th><th>Actual Ad Unlocks</th><th>Actual Shortener Unlocks</th></tr></thead>
                              <tbody>
                                {appliedBatchEpisodes.map((row) => (
                                  <tr key={row.id}>
                                    <td>{row.episode_number}</td>
                                    <td>{row.title || 'Untitled'}</td>
                                    <td>{row.total_plays}</td>
                                    <td>{Number(row.logged_in_unique_viewers || 0) + Number(row.anonymous_unique_viewers || 0)}</td>
                                    <td>{row.completed_plays}</td>
                                    <td>{row.ad_unlock_starts}</td>
                                    <td>{row.ad_unlock_completions}</td>
                                    <td>{row.shortener_unlock_completions}</td>
                                    <td>{row.actual_unlocks ?? 0}</td>
                                    <td>{row.actual_shortener_unlocks ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="admin-episode-picker-empty">
                          {selectedEpisode ? 'Select an episode to view its analytics. Choose a batch size and press OK.' : 'First select a story, then select an episode.'}
                        </p>
                      )}
                    </section>
                  )
                })()}
                <section className="admin-section" style={{ marginTop: '18px' }}>
                  <h3>📢 Unlock Analytics</h3>
                  <p style={{ opacity: 0.75 }}>Rewarded Ads and Shortener are separate unlock paths. Rewarded Ad Completions / Actual Ad Unlocks count only verified rewarded ads; Shortener Completions / Actual Shortener Unlocks count shortener access separately.</p>
                  <div style={{ overflowX: 'auto' }}><table className="admin-table"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Session</th><th>Story</th><th>Episode</th></tr></thead><tbody>
                    {(analyticsData.ad_activity || []).map((row) => <tr key={row.id}><td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td>{row.event_type}</td><td>{row.user_id || '—'}</td><td>{row.session_suffix ? <>…{row.session_suffix}</> : '—'}</td><td>{row.story_id || '—'}</td><td>{row.episode_id || '—'}</td></tr>)}
                  </tbody></table></div>
                </section>
                <section className="admin-section" style={{ marginTop: '18px' }}>
                  <h3>👥 User Activity</h3>
                  <div style={{ overflowX: 'auto' }}><table className="admin-table"><thead><tr><th>User ID</th><th>Profile</th><th>Last Activity</th><th>Plays</th><th>Completed</th><th>Rewarded Ad Unlocks</th><th>Shortener Unlocks</th><th>Total Unlocks</th></tr></thead><tbody>
                    {(analyticsData.users || []).map((row) => <tr key={row.user_id}><td>{row.user_id}</td><td>{row.full_name || '—'}</td><td>{row.last_activity ? new Date(row.last_activity).toLocaleString() : '—'}</td><td>{row.plays}</td><td>{row.completed_episodes}</td><td>{row.ad_unlocks}</td><td>{row.shortener_unlocks ?? 0}</td><td>{row.total_unlocks ?? (Number(row.ad_unlocks || 0) + Number(row.shortener_unlocks || 0))}</td></tr>)}
                  </tbody></table></div>
                  <h4 style={{ marginTop: '18px' }}>Visitor Sessions</h4>
                  <p className="admin-analytics-note">🔎 A session stays anonymous until that browser signs in. After sign-in, the known account name is shown here. A visitor who never signs in cannot be identified from this analytics data alone.</p>
                  <div style={{ overflowX: 'auto' }}><table className="admin-table"><thead><tr><th>Session</th><th>Known Account</th><th>Last Activity</th><th>Plays</th><th>Rewarded Ad Unlocks</th><th>Shortener Unlocks</th><th>Total Unlocks</th></tr></thead><tbody>
                    {(analyticsData.anonymous_sessions || []).map((row) => <tr key={row.session_suffix}><td>…{row.session_suffix}</td><td>{row.known_profile || 'Anonymous visitor'}</td><td>{row.last_activity ? new Date(row.last_activity).toLocaleString() : '—'}</td><td>{row.plays}</td><td>{row.unlocks}</td><td>{row.shortener_unlocks ?? 0}</td><td>{row.total_unlocks ?? (Number(row.unlocks || 0) + Number(row.shortener_unlocks || 0))}</td></tr>)}
                  </tbody></table></div>
                </section>
              </>
            )}
          </section>
        )}

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
              <div className="admin-settings-card admin-settings-wide hj-appearance-card">
                <div className="admin-settings-card-head"><div><small>APPEARANCE</small><h3>Typography, Color & Motion</h3></div><span>🎨</span></div>
                <div className="admin-settings-form-grid">
                  {['primary','heading','body','ui','reader'].map((key) => <label key={key}>{key === 'ui' ? 'UI / Button font' : key[0].toUpperCase()+key.slice(1)+' font'}<select value={adminSettings.appearance?.typography?.[key] || DEFAULT_APPEARANCE.typography[key]} onChange={e => {setAdminSettings(cur => ({...cur,appearance:{...cur.appearance,typography:{...cur.appearance.typography,[key]:e.target.value}}}));setSettingsDirty(true)}}>{FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}</select></label>)}
                  {Object.keys(DEFAULT_APPEARANCE.colors).map(key => <label key={key}>{key[0].toUpperCase()+key.slice(1)}<input type="color" value={adminSettings.appearance?.colors?.[key] || DEFAULT_APPEARANCE.colors[key]} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,colors:{...cur.appearance.colors,[key]:e.target.value}}}));setSettingsDirty(true)}}/></label>)}
                  <label>Border radius<input type="number" min="0" max="28" value={adminSettings.appearance?.ui?.radius ?? 12} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,ui:{...cur.appearance.ui,radius:Number(e.target.value)||0}}}));setSettingsDirty(true)}}/></label>
                  <label>Animation intensity<select value={adminSettings.appearance?.ui?.animationIntensity || 'normal'} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,ui:{...cur.appearance.ui,animationIntensity:e.target.value}}}));setSettingsDirty(true)}}>{ANIMATION_INTENSITIES.map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label>
                </div>
                <div className="admin-settings-toggle-list">{Object.keys(DEFAULT_APPEARANCE.motion).map(key=><label className="admin-settings-toggle" key={key}><input type="checkbox" checked={adminSettings.appearance?.motion?.[key] !== false} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,motion:{...cur.appearance.motion,[key]:e.target.checked}}}));setSettingsDirty(true)}}/><span>{key.replace(/([A-Z])/g,' $1')}</span></label>)}</div>
                <div className="admin-settings-form-grid">
                  <label>Animated emoji system<select value={adminSettings.appearance?.emoji?.animationEnabled===false?'off':'on'} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,emoji:{...cur.appearance.emoji,animationEnabled:e.target.value==='on'}}}));setSettingsDirty(true)}}><option value="on">On</option><option value="off">Off</option></select></label>
                  <label>Emoji style<select value={adminSettings.appearance?.emoji?.style || 'native'} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,emoji:{...cur.appearance.emoji,style:e.target.value}}}));setSettingsDirty(true)}}>{EMOJI_STYLES.map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label>
                  {Object.entries(adminSettings.appearance?.emoji?.mapping || DEFAULT_APPEARANCE.emoji.mapping).slice(0,24).map(([emoji,animation])=><label key={emoji}>{emoji}<select value={animation} onChange={e=>{setAdminSettings(cur=>({...cur,appearance:{...cur.appearance,emoji:{...cur.appearance.emoji,mapping:{...cur.appearance.emoji.mapping,[emoji]:e.target.value}}}}));setSettingsDirty(true)}}>{EMOJI_ANIMATIONS.map(x=><option key={x} value={x}>{x}</option>)}</select></label>)}
                </div>
                <small className="admin-settings-note">Only predefined, validated appearance and animation values are saved. No arbitrary CSS/JavaScript is accepted. Reduced-motion preferences are respected by the client.</small>
              </div>
              <AdminNotificationCenter stories={stories} />
              <div className="admin-settings-card">
                <div className="admin-settings-card-head"><div><small>SECURITY MONITORING</small><h3>Daily Security & Health</h3></div><span>🛡</span></div>
                <p className="admin-settings-note">Daily monitoring is detection + analysis + reporting only. It never changes production code, RLS, authentication, payments, unlocks, environment variables or deployment.</p>
                <button type="button" className="admin-submit" onClick={()=>setAdminTab('security')}>Open Security Dashboard</button>
              </div>
              <div className="admin-settings-card admin-settings-wide admin-vip-access-card">
                <div className="admin-settings-card-head">
                  <div><small>USER ENTITLEMENTS</small><h3>⭐ Give VIP Access to a User</h3></div>
                  <span>👑</span>
                </div>
                <p className="admin-settings-note">Select a registered user and grant VIP access without creating a payment purchase. The grant is stored server-side and enforced by the protected media server. Leave expiry empty for lifetime VIP until manually revoked.</p>
                <div className="admin-settings-form-grid">
                  <label className="admin-settings-span-2">
                    Select user
                    <select aria-label="VIP user" value={vipSelectedUserId} onChange={(event) => setVipSelectedUserId(event.target.value)} disabled={vipLoading || vipSaving}>
                      <option value="">Choose a user…</option>
                      {vipUsers.filter((item) => !item.isAdmin).map((item) => (
                        <option key={item.id} value={item.id}>{item.name ? item.name + ' — ' : ''}{item.email || item.id}</option>
                      ))}
                    </select>
                    {vipError && <small className="auth-error" role="alert">{vipError}</small>}
                  </label>
                  <label>
                    Expiry (optional)
                    <input aria-label="VIP expiry" type="datetime-local" value={vipExpiry} onChange={(event) => setVipExpiry(event.target.value)} disabled={vipSaving} />
                  </label>
                  <label>
                    Admin note (optional)
                    <input aria-label="VIP note" value={vipNote} maxLength={500} onChange={(event) => setVipNote(event.target.value)} disabled={vipSaving} placeholder="Reason / reference" />
                  </label>
                </div>
                <div className="admin-settings-actions">
                  <button type="button" className="admin-submit" onClick={saveVipGrant} disabled={!vipSelectedUserId || vipSaving || vipLoading}>
                    {vipSaving ? '⏳ Saving…' : '👑 Grant VIP Access'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => void refreshVipAccess()} disabled={vipLoading || vipSaving}>
                    🔄 Refresh Users
                  </button>
                </div>
                <div className="admin-vip-grants-list" aria-live="polite">
                  <strong>Active VIP grants</strong>
                  {!vipGrants.length && <p className="admin-settings-note">No separate user VIP grants are currently active.</p>}
                  {vipGrants.map((grant) => {
                    const target = vipUsers.find((item) => item.id === grant.user_id)
                    const expired = grant.expires_at && Date.parse(grant.expires_at) <= Date.now()
                    return (
                      <div className="admin-vip-grant-row" key={grant.user_id}>
                        <div>
                          <strong>{target?.email || grant.user_id}</strong>
                          <small>{grant.expires_at ? (expired ? 'Expired' : 'Until ' + new Date(grant.expires_at).toLocaleString()) : 'Lifetime'}{grant.note ? ' · ' + grant.note : ''}</small>
                        </div>
                        <button type="button" className="admin-cancel" onClick={() => void revokeVipGrant(grant.user_id)} disabled={vipSaving}>Revoke</button>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="admin-settings-card admin-settings-wide">
                <div className="admin-settings-card-head">
                  <div><small>CONTENT MANAGEMENT</small><h3>Edit Audio, Books & Videos</h3></div>
                  <span>✏️</span>
                </div>

                <div className="admin-settings-content-grid">
                  <div className="admin-settings-content-block">
                    <div className="admin-settings-content-title"><span>🎧</span><div><strong>Audio Stories</strong><small>{stories.length} stories · {totalEpisodes} episodes</small></div></div>
                    <button type="button" className="admin-submit" onClick={() => setAdminTab('stories')}>Open Audio Manager</button>
                    <div className="admin-settings-item-list">
                      {stories.slice(0, 5).map((story) => (
                        <div key={story.id} className="admin-settings-item">
                          <span>{story.title}</span>
                          <button type="button" onClick={() => { setAdminTab('stories'); startEditStory(story) }}>✏️ Edit</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="admin-settings-content-block">
                    <div className="admin-settings-content-title"><span>📚</span><div><strong>Books</strong><small>{books.length} books</small></div></div>
                    <button type="button" className="admin-submit" onClick={() => setAdminTab('books')}>Open Books Manager</button>
                    <div className="admin-settings-item-list">
                      {books.slice(0, 5).map((book) => (
                        <div key={book.id} className="admin-settings-item">
                          <span>{book.title}</span>
                          <button type="button" onClick={() => { setAdminTab('books'); startEditBook(book) }}>✏️ Edit</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="admin-settings-content-block">
                    <div className="admin-settings-content-title"><span>🎬</span><div><strong>Videos</strong><small>{videoStories.length} video stories</small></div></div>
                    <button type="button" className="admin-submit" onClick={() => setAdminTab('videos')}>Open Video Manager</button>
                    <div className="admin-settings-item-list">
                      {videoStories.slice(0, 5).map((video) => (
                        <div key={video.id} className="admin-settings-item">
                          <span>{video.title}</span>
                          <button type="button" onClick={() => { setAdminTab('videos'); startEditVideo(video) }}>✏️ Edit</button>
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
                  <label>Unlock duration (minutes)<input type="number" min="1" max="1440" value={adminSettings.ads.unlockDurationMinutes} onChange={(e) => updateAdminSetting('ads', 'unlockDurationMinutes', Number(e.target.value) || 360)} /></label>
                  <label className="admin-settings-toggle">
                    <input
                      type="checkbox"
                      checked={adminSettings.shortener?.enabled === true}
                      onChange={(e) => updateAdminSetting('shortener', 'enabled', e.target.checked)}
                    />
                    <span>Enable shortener routing</span>
                  </label>
                  <label>Primary shortener
                    <select
                      value={adminSettings.shortener?.primaryProvider || 'arolinks'}
                      onChange={(e) => updateAdminSetting('shortener', 'primaryProvider', e.target.value)}
                    >
                      <option value="arolinks">AroLinks</option>
                      <option value="earn4link">Earn4Link</option>
                    </select>
                  </label>
                  <label>Fallback shortener
                    <select
                      value={adminSettings.shortener?.fallbackProvider ?? 'earn4link'}
                      onChange={(e) => updateAdminSetting('shortener', 'fallbackProvider', e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="arolinks">AroLinks</option>
                      <option value="earn4link">Earn4Link</option>
                    </select>
                  </label>
                  <small className="admin-settings-note">
                    Primary: <strong>{adminSettings.shortener?.primaryProvider === 'arolinks' ? 'AroLinks' : 'Earn4Link'}</strong>
                    {adminSettings.shortener?.fallbackProvider ? <> → <strong>{adminSettings.shortener.fallbackProvider === 'arolinks' ? 'AroLinks' : 'Earn4Link'}</strong></> : null}.
                    Routing is disabled by default. Use only for provider-approved link flows. The provider redirect is treated only as the completion signal because these providers do not expose a completion webhook to HJ GROUPS.
                  </small>
                </div>

                <div className="admin-ad-unlock-rules">
                  <div className="admin-ad-unlock-rules-head">
                    <div>
                      <strong>Ads Unlock Episode Rules</strong>
                      <small>Rule matching uses the actual episode number where the user starts the Ads unlock.</small>
                    </div>
                    <button type="button" className="admin-settings-inline-button" onClick={addAdUnlockRule}>+ Add Rule</button>
                  </div>

                  <div className="admin-ad-unlock-rule-table">
                    <div className="admin-ad-unlock-rule-row header">
                      <span>Start Episode</span>
                      <span>End Episode</span>
                      <span>Episodes Per Ad</span>
                      <span>Action</span>
                    </div>
                    {adUnlockRules.map((rule, index) => (
                      <div className="admin-ad-unlock-rule-row" key={String(index)}>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rule.startEpisode ?? ''}
                          onChange={(e) => updateAdUnlockRule(index, 'startEpisode', e.target.value)}
                          aria-label={`Rule ${index + 1} start episode`}
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rule.endEpisode ?? ''}
                          onChange={(e) => updateAdUnlockRule(index, 'endEpisode', e.target.value)}
                          placeholder="∞ No upper limit"
                          aria-label={`Rule ${index + 1} end episode`}
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rule.unlockCount ?? ''}
                          onChange={(e) => updateAdUnlockRule(index, 'unlockCount', e.target.value)}
                          aria-label={`Rule ${index + 1} episodes per ad`}
                        />
                        <button
                          type="button"
                          className="admin-delete"
                          onClick={() => deleteAdUnlockRule(index)}
                          aria-label={`Delete Ads unlock rule ${index + 1}`}
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>

                  {!adUnlockRuleValidation.valid && (
                    <div className="admin-ad-unlock-rule-errors" role="alert">
                      {adUnlockRuleValidation.errors.map((error) => <span key={error}>⚠ {error}</span>)}
                    </div>
                  )}

                  <div className="admin-ad-unlock-rule-example">
                    <strong>Example:</strong> 1–1000 → 10 · 1001–1500 → 5 · 1501–∞ → 3.
                    Complete an ad on Episode 14 with a 5-count rule to temporarily unlock 14–18.
                    Only episodes that actually exist in that story are included.
                  </div>
                </div>

                <div className="admin-ad-unlock-rules">
                  <div className="admin-ad-unlock-rules-head">
                    <div>
                      <strong>Shortener Unlock Episode Rules</strong>
                      <small>Rule matching uses the actual starting episode for the Shortener unlock.</small>
                    </div>
                    <button type="button" className="admin-settings-inline-button" onClick={addShortenerUnlockRule}>+ Add Rule</button>
                  </div>
                  <div className="admin-ad-unlock-rule-table">
                    <div className="admin-ad-unlock-rule-row header">
                      <span>Start Episode</span><span>End Episode</span><span>Episodes Per Completion</span><span>Action</span>
                    </div>
                    {shortenerUnlockRules.map((rule, index) => (
                      <div className="admin-ad-unlock-rule-row" key={String(index)}>
                        <input type="number" min="1" step="1" value={rule.startEpisode ?? ''} onChange={(e) => updateShortenerUnlockRule(index, 'startEpisode', e.target.value)} aria-label={`Shortener rule ${index + 1} start episode`} />
                        <input type="number" min="1" step="1" value={rule.endEpisode ?? ''} onChange={(e) => updateShortenerUnlockRule(index, 'endEpisode', e.target.value)} placeholder="∞ No upper limit" aria-label={`Shortener rule ${index + 1} end episode`} />
                        <input type="number" min="1" step="1" value={rule.unlockCount ?? ''} onChange={(e) => updateShortenerUnlockRule(index, 'unlockCount', e.target.value)} aria-label={`Shortener rule ${index + 1} episodes per completion`} />
                        <button type="button" className="admin-delete" onClick={() => deleteShortenerUnlockRule(index)} aria-label={`Delete Shortener unlock rule ${index + 1}`}>🗑</button>
                      </div>
                    ))}
                  </div>
                  {!shortenerRuleValidation.valid && (
                    <div className="admin-ad-unlock-rule-errors" role="alert">
                      {shortenerRuleValidation.errors.map((error) => <span key={error}>⚠ {error}</span>)}
                    </div>
                  )}
                </div>
                <div className="admin-settings-form-grid">
                  <label>Shortener unlock duration (minutes)
                    <input type="number" min="1" max="1440" value={adminSettings.shortener?.unlockDurationMinutes || 360} onChange={(e) => updateAdminSetting('shortener', 'unlockDurationMinutes', Number(e.target.value) || 360)} />
                  </label>
                </div>

                <div className="shortener-health-panel" aria-live="polite">
                  <div className="shortener-health-head">
                    <strong>Shortener server health</strong>
                    <button
                      type="button"
                      className="admin-settings-inline-button"
                      onClick={() => setShortenerHealthRefresh((value) => value + 1)}
                      disabled={shortenerHealthLoading}
                    >
                      {shortenerHealthLoading ? 'Checking…' : 'Refresh'}
                    </button>
                  </div>
                  <div className="shortener-health-grid">
                    <span className={
                      shortenerHealth?.configured?.arolinks === true
                        ? 'configured'
                        : shortenerHealth?.configured?.arolinks === false
                          ? 'not-configured'
                          : 'unknown'
                    }>
                      <i /> AroLinks: {
                        shortenerHealth?.configured?.arolinks === true
                          ? 'Configured'
                          : shortenerHealth?.configured?.arolinks === false
                            ? 'Not configured'
                            : 'Unavailable'
                      }
                    </span>
                    <span className={
                      shortenerHealth?.configured?.earn4link === true
                        ? 'configured'
                        : shortenerHealth?.configured?.earn4link === false
                          ? 'not-configured'
                          : 'unknown'
                    }>
                      <i /> Earn4Link: {
                        shortenerHealth?.configured?.earn4link === true
                          ? 'Configured'
                          : shortenerHealth?.configured?.earn4link === false
                            ? 'Not configured'
                            : 'Unavailable'
                      }
                    </span>
                  </div>
                  {shortenerHealth?.error && (
                    <small className="admin-settings-note">Health check: {shortenerHealth.error}{shortenerHealth?.statusCode ? ' (HTTP ' + shortenerHealth.statusCode + ')' : ''}</small>
                  )}
                  {shortenerHealth?.settingsError && (
                    <small className="admin-settings-note">Cloud settings: {shortenerHealth.settingsError}</small>
                  )}
                  {shortenerHealth?.enabled && !shortenerHealth?.configured?.unlockSecret && (
                    <small className="admin-settings-note">Unlock routing is enabled, but the backend unlock secret is not configured.</small>
                  )}
                </div>
                <small className="admin-settings-note">Provider secret/API credentials stay only in the server environment; the actual tokens are never displayed here.</small>
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
                  <label>Telegram support URL<input type="url" value={adminSettings.website.supportTelegramUrl} onChange={(e) => updateAdminSetting('website', 'supportTelegramUrl', e.target.value)} placeholder="https://t.me/your_support_bot" /></label>
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
                  <AccessTypeField groupName="settings-default-audio" label="Audio Access Types" value={adminSettings.content.defaultAudioAccess} onChange={(value) => updateAdminSetting('content', 'defaultAudioAccess', value)} />
                  <AccessTypeField groupName="settings-default-video" label="Video Access Types" value={adminSettings.content.defaultVideoAccess} onChange={(value) => updateAdminSetting('content', 'defaultVideoAccess', value)} />
                  <AccessTypeField groupName="settings-default-book" label="Book Access Types" value={adminSettings.content.defaultBookAccess} onChange={(value) => updateAdminSetting('content', 'defaultBookAccess', value)} />
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

                <GenreMultiSelect value={storyGenre} onChange={setStoryGenre} />

                <label>
                  Language
                  <select value={storyLanguage} onChange={(e) => setStoryLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Status
                  <select aria-label="Audio story status" value={storyStatus} onChange={(e) => setStoryStatus(e.target.value)}>
                    {CONTENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
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
                  {stories.map((story) => (
                    <option key={story.id} value={story.id}>{story.title}</option>
                  ))}
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

                <button type="button" className="admin-submit" style={{ backgroundColor: '#7C83FF' }} onClick={handleScanTelegram} disabled={bulkLoading || bulkImporting}>
                  {bulkLoading ? '🔄 Scanning...' : bulkImporting ? '⏳ Importing...' : '🔄 Scan Telegram Messages'}
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

                    {bulkImportProgress.status !== 'idle' && (
                      <div
                        role="status"
                        aria-live="polite"
                        style={{
                          marginTop: '16px',
                          padding: '14px',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.34)',
                          border: `1px solid ${bulkImportProgress.status === 'failed' ? 'rgba(244,67,54,0.5)' : 'rgba(124,131,255,0.35)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong style={{ color: '#fff' }}>
                            {bulkImportProgress.status === 'running'
                              ? '⏳ Importing Telegram...'
                              : bulkImportProgress.status === 'completed'
                                ? '✅ Telegram import completed'
                                : '❌ Telegram import failed'}
                          </strong>
                          {bulkImportProgress.total > 0 && (
                            <span style={{ color: '#cfd2ff', fontSize: '13px' }}>
                              {bulkImportProgress.processed} / {bulkImportProgress.total} processed
                            </span>
                          )}
                        </div>

                        {bulkImportProgress.total > 0 ? (
                          <div style={{ marginTop: '10px' }}>
                            <div
                              aria-label="Telegram import progress"
                              role="progressbar"
                              aria-valuemin="0"
                              aria-valuemax={bulkImportProgress.total}
                              aria-valuenow={bulkImportProgress.processed}
                              style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${Math.max(0, Math.min(100, (bulkImportProgress.processed / bulkImportProgress.total) * 100))}%`,
                                  transition: 'width 180ms ease',
                                  background: '#7C83FF',
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: '10px', color: '#bbb', fontSize: '13px' }}>
                            Processing Telegram items… total count is not available.
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginTop: '12px' }}>
                          <span style={{ color: '#ddd', fontSize: '13px' }}>Imported: <b>{bulkImportProgress.imported}</b></span>
                          <span style={{ color: '#ddd', fontSize: '13px' }}>Remaining: <b>{Math.max(0, bulkImportProgress.total - bulkImportProgress.processed)}</b></span>
                          <span style={{ color: '#ddd', fontSize: '13px' }}>Skipped: <b>{bulkImportProgress.skipped}</b></span>
                          <span style={{ color: '#ddd', fontSize: '13px' }}>Duplicates: <b>{bulkImportProgress.duplicates}</b></span>
                          <span style={{ color: '#ddd', fontSize: '13px' }}>Failed: <b>{bulkImportProgress.failed}</b></span>
                        </div>

                        {bulkImportProgress.currentItem && bulkImportProgress.status === 'running' && (
                          <div style={{ marginTop: '10px', color: '#aaa', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Current: {bulkImportProgress.currentItem}
                          </div>
                        )}

                        {bulkImportProgress.error && (
                          <div style={{ marginTop: '10px', color: '#ffb0b0', fontSize: '12px' }}>
                            {bulkImportProgress.error}
                          </div>
                        )}
                      </div>
                    )}

                    <button type="button" className="admin-submit" style={{ marginTop: '20px' }} onClick={handleBulkImport} disabled={bulkSelectedIds.length === 0 || bulkImporting || bulkLoading}>
                      {bulkImporting ? '⏳ Importing...' : '⬆️ Import Selected'}
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
                          <div key={episode.id ?? `${story.id}-episode-${episode.number}`} className="admin-episode-item">
                            <div>
                              <b>{String(episode.number).padStart(2, '0')}</b>
                              <span>{episode.title}</span>
                              <small>
                                {episode.type === 'video' ? '🎬' : '🎧'} {resolveAccessType(episode).join(', ').toUpperCase()}
                                {episode.available === false ? ' · Coming Soon' : ''}
                                {episode.isTelegramDuplicate ? ' · ⚠️ Duplicate Telegram record' : ''}
                              </small>
                            </div>
                            <button className="admin-edit" onClick={() => startEditEpisode(story, episode)}>✏️</button>
                            <button className="admin-delete" onClick={() => handleDeleteEpisode(story.id, episode.id)}>🗑</button>
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

                <label>
                  Status
                  <select aria-label="Book status" value={bookStatus} onChange={(e) => setBookStatus(e.target.value)}>
                    {CONTENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
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
                    <button type="button" className="admin-delete" onClick={() => handleDeleteBook(book)}>🗑 Delete</button>
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

                <label>
                  Status
                  <select aria-label="Video story status" value={videoStatus} onChange={(e) => setVideoStatus(e.target.value)}>
                    {CONTENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
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
                      <button type="button" className="admin-delete" onClick={() => handleDeleteVideo(video)}>🗑 Delete</button>
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
                            <button type="button" className="admin-delete" onClick={() => handleDeleteVideoEpisode(video, episode)}>🗑</button>
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
    </>
  )
}

export default AdminPanel






