import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { resolveAdUnlockPlan, validateAdUnlockRules } from '../src/lib/adUnlockRules.js'

function resolveSupabaseUrl() {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    'https://yajkfglagnyvenddyvok.supabase.co',
  ]

  for (const candidate of candidates) {
    const value = String(candidate || '').trim().replace(/\/+$/, '')
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'https:' && parsed.hostname) return value
    } catch {}
  }

  return ''
}

const SUPABASE_URL = resolveSupabaseUrl()
const SHORTENER_STATUS_VERSION = '2026-10-01-auth-diagnostics-2'

const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const UNLOCK_TOKEN_SECRET = String(process.env.UNLOCK_TOKEN_SECRET || '').trim()
const PUBLIC_BASE_URL = String(
  process.env.HJ_PUBLIC_BASE_URL || ''
).trim().replace(/\/+$/, '')

const ADMIN_EMAIL = 'hilalaha1233203@gmail.com'
const UNLOCK_INTENT_TTL_MINUTES = 20
const UNLOCK_CODE_TTL_MINUTES = 10
const PROVIDER_TIMEOUT_MS = 12_000
const ALLOWED_CONTENT_TYPES = new Set(['audio', 'video', 'book'])

let serviceClient = null

function getServiceClient() {
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
  if (!SUPABASE_URL) throw new Error('Supabase server URL is not configured.')
  if (!serviceClient) {
    try {
      serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      })
    } catch {
      serviceClient = null
      throw new Error('Supabase server client configuration is invalid.')
    }
  }
  return serviceClient
}

function parsePositiveId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function parseAccessTypes(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return ['free']
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {}
  }
  return [text]
}

function isAdsEnabled(content) {
  return parseAccessTypes(content?.access_type ?? content?.accessType).includes('ads')
}

function isValidPublicBaseUrl() {
  try {
    const parsed = new URL(PUBLIC_BASE_URL)
    if (!parsed.hostname) return false
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return false
    return true
  } catch {
    return false
  }
}

function safeReturnPath(value) {
  const raw = String(value || '/').trim()
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return '/'
  return raw || '/'
}

function contentPath(contentType, contentId) {
  return '/unlock/' + contentType + '/' + contentId
}

function extractBearer(req) {
  const header = String(req.headers.authorization || '')
  if (!/^Bearer\s+/i.test(header)) return ''
  return header.replace(/^Bearer\s+/i, '').trim()
}

function isLikelyJwt(token) {
  const value = String(token || '').trim()
  if (!value) return false
  const parts = value.split('.')
  return parts.length === 3 && parts.every((part) => part.length > 0)
}

async function authenticate(req) {
  const token = extractBearer(req)
  if (!token) throw new Error('Authentication required.')
  if (!isLikelyJwt(token)) throw new Error('Authentication failed.')
  let result
  try {
    result = await getServiceClient().auth.getUser(token)
  } catch {
    throw new Error('Supabase auth verification failed.')
  }
  const { data, error } = result
  if (error || !data?.user) throw new Error('Authentication failed.')
  return data.user
}

async function authenticateAdmin(req) {
  const user = await authenticate(req)
  if (String(user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error('Admin access required.')
  }
  return user
}

async function getAdminSettings() {
  const { data, error } = await getServiceClient()
    .from('app_settings')
    .select('value')
    .eq('id', 'hj_admin_settings')
    .maybeSingle()

  if (error) throw new Error('Unable to load shortener settings.')
  const value = data?.value || {}
  const shortener = value.shortener || value.ads || {}
  const ruleValidation = validateAdUnlockRules(
    shortener.episodeUnlockRules || shortener.shortenerEpisodeUnlockRules
  )
  if (!ruleValidation.valid) {
    throw new Error('Shortener episode unlock rules are invalid: ' + ruleValidation.errors.join(' '))
  }

  return {
    shortenerEnabled: shortener.enabled === true || shortener.shortenerEnabled === true,
    primary: String(shortener.primaryProvider || shortener.primaryShortener || 'arolinks').trim().toLowerCase(),
    fallback: String(shortener.fallbackProvider || shortener.fallbackShortener || 'earn4link').trim().toLowerCase(),
    unlockDurationMinutes: Math.min(
      1440,
      Math.max(1, Number(shortener.unlockDurationMinutes || shortener.shortenerUnlockDurationMinutes) || 360)
    ),
    episodeUnlockRules: ruleValidation.normalizedRules,
  }
}

function getProviderOrder(settings) {
  const values = [settings.primary, settings.fallback]
  const valid = values.filter((value) => value === 'arolinks' || value === 'earn4link')
  return [...new Set(valid)]
}

/*
 * Server-only provider registry.
 *
 * Both adapters expose the same internal contract:
 *   createShortLink({ destinationUrl, alias, fetchImpl })
 *
 * The provider request/response contract is isolated here so another provider
 * can be added without changing the unlock/entitlement flow. We intentionally
 * keep the outbound request to the provider's documented-style API parameters
 * already supported by this code path and do not send HJ secrets other than
 * the provider's own API token.
 */
const PROVIDER_ADAPTERS = Object.freeze({
  arolinks: {
    host: 'arolinks.com',
    tokenEnv: 'AROLINKS_API_TOKEN',
    createShortLink: async ({ destinationUrl, fetchImpl = globalThis.fetch }) => {
      const token = String(process.env.AROLINKS_API_TOKEN || '').trim()
      if (!token) throw new Error('arolinks API token is not configured.')
      const endpoint = new URL('https://arolinks.com/api')
      endpoint.searchParams.set('api', token)
      endpoint.searchParams.set('url', destinationUrl)
      return fetchImpl(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
      })
    },
  },
  earn4link: {
    host: 'earn4link.in',
    tokenEnv: 'EARN4LINK_API_TOKEN',
    createShortLink: async ({ destinationUrl, fetchImpl = globalThis.fetch }) => {
      const token = String(process.env.EARN4LINK_API_TOKEN || '').trim()
      if (!token) throw new Error('earn4link API token is not configured.')
      const endpoint = new URL('https://earn4link.in/api')
      endpoint.searchParams.set('api', token)
      endpoint.searchParams.set('url', destinationUrl)
      return fetchImpl(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
      })
    },
  },
})

function getProviderAdapter(provider) {
  return PROVIDER_ADAPTERS[String(provider || '').trim().toLowerCase()] || null
}

function providerHost(provider) {
  return getProviderAdapter(provider)?.host || ''
}

function assertProviderCredentials(provider) {
  const adapter = getProviderAdapter(provider)
  if (!adapter) throw new Error('Unsupported shortener provider.')
  const token = String(process.env[adapter.tokenEnv] || '').trim()
  if (!token) throw new Error(provider + ' API token is not configured.')
  return token
}

function extractProviderUrl(provider, body) {
  const expectedHost = providerHost(provider)
  const candidates = []

  const visit = (value) => {
    if (typeof value === 'string') candidates.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }

  let parsed = null
  try { parsed = JSON.parse(body) } catch {}
  if (parsed) visit(parsed)
  candidates.push(String(body || ''))

  for (const candidate of candidates) {
    const matches = candidate.match(/https?:\/\/[^\s"'<>\\]+/g) || []
    for (const match of matches) {
      try {
        const url = new URL(match)
        if (url.hostname === expectedHost || url.hostname.endsWith('.' + expectedHost)) {
          return url.toString()
        }
      } catch {}
    }
    try {
      const url = new URL(candidate.trim())
      if (url.hostname === expectedHost || url.hostname.endsWith('.' + expectedHost)) {
        return url.toString()
      }
    } catch {}
  }

  return ''
}

async function callProvider(provider, destinationUrl, alias) {
  const adapter = getProviderAdapter(provider)
  if (!adapter) throw new Error('Unsupported shortener provider.')
  assertProviderCredentials(provider)

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)

  try {
    const response = await adapter.createShortLink({
      destinationUrl,
      alias,
      fetchImpl: (endpoint, options = {}) => fetch(endpoint, {
        ...options,
        signal: controller.signal,
      }),
    })

    const body = await response.text()
    const durationMs = Date.now() - startedAt
    if (!response.ok) {
      console.warn('[shortener]', provider, 'failed:', 'HTTP ' + response.status, durationMs + 'ms')
      throw new Error(provider + ' API returned HTTP ' + response.status)
    }

    const shortUrl = extractProviderUrl(provider, body)
    if (!shortUrl) {
      console.warn('[shortener]', provider, 'failed:', 'malformed response', durationMs + 'ms')
      throw new Error(provider + ' API returned no valid shortened URL.')
    }

    console.info('[shortener]', provider, 'success', durationMs + 'ms')
    return shortUrl
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const rawMessage = String(error?.message || '').toLowerCase()
    const failureKind =
      rawMessage.includes('abort') || rawMessage.includes('timeout')
        ? 'timeout'
        : rawMessage.includes('malformed') || rawMessage.includes('no valid')
          ? 'malformed_response'
          : 'request_error'

    // Never log provider response bodies, request URLs, API tokens, or raw
    // network error strings because some HTTP clients may include request
    // metadata in their error messages.
    console.warn('[shortener]', provider, 'failed:', failureKind, durationMs + 'ms')
    throw new Error(provider + ' provider request failed')
  } finally {
    clearTimeout(timeout)
  }
}

async function createShortLinkWithFallback(destinationUrl, alias, providerOrder) {
  if (!providerOrder.length) throw new Error('No shortener provider is configured.')
  const failures = []

  for (const provider of providerOrder) {
    try {
      const shortUrl = await callProvider(provider, destinationUrl, alias)
      return { provider, shortUrl }
    } catch (error) {
      failures.push(provider + ': ' + String(error?.message || 'failed'))
    }
  }

  throw new Error('All shortener providers failed: ' + failures.join(' | '))
}

async function getContentRecord(contentType, contentId) {
  const db = getServiceClient()
  let query

  if (contentType === 'audio') {
    query = db
      .from('episodes')
      .select('id, episode_number, number, story_id, access_type, available, type')
      .eq('id', contentId)
      .maybeSingle()
  } else if (contentType === 'video') {
    query = db
      .from('video_episodes')
      .select('id, number, video_story_id, access_type, available, type')
      .eq('id', contentId)
      .maybeSingle()
  } else {
    query = db
      .from('books')
      .select('id, access_type')
      .eq('id', contentId)
      .maybeSingle()
  }

  const { data, error } = await query
  if (error) throw new Error('Unable to load requested content.')
  if (!data) throw new Error('Requested content was not found.')
  if (data.available === false) throw new Error('This content is currently unavailable.')
  return data
}

async function getEpisodeUnlockContext(contentType, content) {
  if (contentType === 'audio') {
    const episodeNumber = Number(content?.number ?? content?.episode_number)
    const storyId = Number(content?.story_id)
    if (!Number.isInteger(storyId) || storyId < 1 || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
      throw new Error('Ads unlock target is missing a valid story or episode number.')
    }
    return { storyId, episodeNumber }
  }

  if (contentType === 'video') {
    const episodeNumber = Number(content?.number)
    const storyId = Number(content?.video_story_id)
    if (!Number.isInteger(storyId) || storyId < 1 || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
      throw new Error('Ads unlock target is missing a valid story or episode number.')
    }
    return { storyId, episodeNumber }
  }

  return { storyId: null, episodeNumber: null }
}

async function getExistingEpisodeNumbers(contentType, storyId, startEpisode, endEpisode) {
  if (!storyId || !Number.isInteger(startEpisode) || !Number.isInteger(endEpisode)) return []

  const db = getServiceClient()

  if (contentType === 'audio') {
    // Production Telegram imports may have either `number` or the legacy
    // `episode_number` populated. Query both identities and merge them so
    // temporary range unlocks include every real episode in the story.
    const [numberResult, episodeNumberResult] = await Promise.all([
      db
        .from('episodes')
        .select('number, episode_number, available')
        .eq('story_id', storyId)
        .gte('number', startEpisode)
        .lte('number', endEpisode),
      db
        .from('episodes')
        .select('number, episode_number, available')
        .eq('story_id', storyId)
        .gte('episode_number', startEpisode)
        .lte('episode_number', endEpisode),
    ])

    if (numberResult.error || episodeNumberResult.error) {
      throw new Error('Unable to determine the existing episodes for temporary access.')
    }

    return [...new Set(
      [...(numberResult.data || []), ...(episodeNumberResult.data || [])]
        .filter((row) => row?.available !== false)
        .map((row) => Number(row?.number ?? row?.episode_number))
        .filter((number) => Number.isInteger(number) && number >= startEpisode && number <= endEpisode)
    )].sort((a, b) => a - b)
  }

  const { data, error } = await db
    .from('video_episodes')
    .select('number, available')
    .eq('video_story_id', storyId)
    .gte('number', startEpisode)
    .lte('number', endEpisode)

  if (error) throw new Error('Unable to determine the existing episodes for temporary access.')

  return [...new Set(
    (data || [])
      .filter((row) => row?.available !== false)
      .map((row) => Number(row?.number))
      .filter((number) => Number.isInteger(number) && number >= startEpisode && number <= endEpisode)
  )].sort((a, b) => a - b)
}

async function findActiveAdUnlock(userId, contentType, contentId, content) {
  const db = getServiceClient()
  const nowIso = new Date().toISOString()

  const { data: exact, error: exactError } = await db
    .from('shortener_unlocks')
    .select('id, content_id, expires_at, story_id, start_episode_number, end_episode_number')
    .eq('user_id', userId)
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (exactError) throw new Error('Unable to verify existing temporary access.')
  if (exact?.expires_at) {
    if (['audio', 'video'].includes(contentType) && (exact.start_episode_number == null || exact.end_episode_number == null)) {
      const context = await getEpisodeUnlockContext(contentType, content)
      return {
        ...exact,
        story_id: exact.story_id ?? context.storyId,
        start_episode_number: exact.start_episode_number ?? context.episodeNumber,
        end_episode_number: exact.end_episode_number ?? context.episodeNumber,
      }
    }
    return exact
  }

  if (!isAdsEnabled(content) || !['audio', 'video'].includes(contentType)) return null

  const { storyId, episodeNumber } = await getEpisodeUnlockContext(contentType, content)

  const { data: range, error: rangeError } = await db
    .from('shortener_unlocks')
    .select('id, content_id, expires_at, story_id, start_episode_number, end_episode_number')
    .eq('user_id', userId)
    .eq('content_type', contentType)
    .eq('story_id', storyId)
    .lte('start_episode_number', episodeNumber)
    .gte('end_episode_number', episodeNumber)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rangeError) throw new Error('Unable to verify existing temporary access.')
  return range || null
}

async function markIntentCompleted(intentId) {
  const { error } = await getServiceClient()
    .from('shortener_unlock_intents')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', intentId)
    .eq('status', 'pending')

  if (error) throw new Error('Unable to finalize unlock session.')
}

async function loadContentForPreview(contentType, contentId) {
  const content = await getContentRecord(contentType, contentId)
  if (!isAdsEnabled(content)) {
    throw new Error('This content does not have an ad unlock access path.')
  }
  return content
}

async function loadContent(contentType, contentId) {
  const data = await getContentRecord(contentType, contentId)
  if (!isAdsEnabled(data)) throw new Error('This content does not have an ad unlock access path.')
  return data
}

const shortenerCreationLocks = new Map()

async function getOrCreateShortLink(contentType, contentId, order) {
  const chain = order.join('>')
  const key = contentType + ':' + contentId + ':' + chain

  const initial = await getExistingShortLink(contentType, contentId)
  if (isReusableShortLink(initial, chain)) {
    return { link: initial, reused: true }
  }

  const existingLock = shortenerCreationLocks.get(key)
  if (existingLock) return existingLock

  const operation = (async () => {
    const latest = await getExistingShortLink(contentType, contentId)
    if (isReusableShortLink(latest, chain)) {
      return { link: latest, reused: true }
    }

    const destinationPath = contentPath(contentType, contentId)
    const alias = 'hj-' + contentType + '-' + contentId
    let created
    try {
      created = await createShortLinkWithFallback(
        new URL(destinationPath, PUBLIC_BASE_URL).toString(),
        alias,
        order
      )
    } catch {
      // Keep the currently active link intact if regeneration fails. Users
      // should never lose a working permanent link because a replacement
      // provider request timed out or returned an invalid response.
      throw new Error('Shortener unlock is temporarily unavailable. Please try again later.')
    }

    // If a link already exists but its provider chain is stale, replace that
    // row only after the new provider URL has been successfully generated.
    // This avoids a period with no active link during provider regeneration.
    if (latest?.id) {
      const updated = await getServiceClient()
        .from('shortener_links')
        .update({
          provider: created.provider,
          short_url: created.shortUrl,
          destination_path: destinationPath,
          provider_chain: chain,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', latest.id)
        .select('id, provider, short_url, destination_path, provider_chain, active')
        .maybeSingle()

      if (updated.error || !updated.data) {
        throw new Error('Unable to save shortener link.')
      }
      return { link: updated.data, reused: false }
    }

    const inserted = await getServiceClient()
      .from('shortener_links')
      .insert({
        content_type: contentType,
        content_id: contentId,
        provider: created.provider,
        short_url: created.shortUrl,
        destination_path: destinationPath,
        provider_chain: chain,
        active: true,
      })
      .select('id, provider, short_url, destination_path, provider_chain, active')
      .maybeSingle()

    if (inserted.error) {
      // Another server instance may have won the race. Reuse its active link
      // if it matches the current provider chain.
      const existing = await getExistingShortLink(contentType, contentId)
      if (!isReusableShortLink(existing, chain)) {
        throw new Error('Unable to save shortener link.')
      }
      return { link: existing, reused: true }
    }

    return { link: inserted.data, reused: false }
  })()

  shortenerCreationLocks.set(key, operation)
  try {
    return await operation
  } finally {
    shortenerCreationLocks.delete(key)
  }
}

function isReusableShortLink(link, providerChain) {
  return Boolean(
    link?.active === true &&
    String(link?.short_url || '').trim() &&
    String(link?.destination_path || '').startsWith('/unlock/') &&
    link?.provider_chain === providerChain
  )
}

function isEntitlementActive(expiresAt, nowMs = Date.now()) {
  const timestamp = new Date(expiresAt || '').getTime()
  return Number.isFinite(timestamp) && timestamp > nowMs
}

function chooseUnlockExpiry(existingExpiry, newExpiry) {
  const existingMs = new Date(existingExpiry || '').getTime()
  const newMs = new Date(newExpiry || '').getTime()
  if (!Number.isFinite(newMs)) throw new Error('Invalid unlock expiry.')
  return Number.isFinite(existingMs) && existingMs > newMs ? existingExpiry : newExpiry
}

async function getExistingShortLink(contentType, contentId) {
  const { data, error } = await getServiceClient()
    .from('shortener_links')
    .select('id, provider, short_url, destination_path, provider_chain, active')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error('Unable to read shortener link.')
  return data || null
}

async function deactivateExistingShortLink(id) {
  if (!id) return
  await getServiceClient()
    .from('shortener_links')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
}

function hmacToken(token) {
  if (!UNLOCK_TOKEN_SECRET) throw new Error('UNLOCK_TOKEN_SECRET is not configured.')
  return crypto.createHmac('sha256', UNLOCK_TOKEN_SECRET).update(token).digest('hex')
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function calculateUnlockExpiry(nowMs = Date.now(), durationMinutes = 360) {
  const duration = Math.min(1440, Math.max(1, Number(durationMinutes) || 360))
  return new Date(nowMs + duration * 60_000).toISOString()
}

function isIntentUsable(intent, {
  userId,
  contentType,
  contentId,
  nowMs = Date.now(),
} = {}) {
  if (!intent || intent.status !== 'pending') return false
  if (String(intent.user_id) !== String(userId)) return false
  if (String(intent.content_type) !== String(contentType)) return false
  if (Number(intent.content_id) !== Number(contentId)) return false
  return new Date(intent.expires_at).getTime() > nowMs
}

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || '')
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

function cookieHeader(name, value, { maxAge = 600, httpOnly = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return name + '=' + encodeURIComponent(value) +
    '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' +
    (httpOnly ? '; HttpOnly' : '') + secure
}

async function createIntent({ user, contentType, contentId, provider, destinationPath, returnPath }) {
  const rawToken = randomToken()
  const tokenHash = hmacToken(rawToken)
  const expiresAt = new Date(Date.now() + UNLOCK_INTENT_TTL_MINUTES * 60_000).toISOString()

  const { error } = await getServiceClient()
    .from('shortener_unlock_intents')
    .insert({
      token_hash: tokenHash,
      user_id: user.id,
      content_type: contentType,
      content_id: contentId,
      provider,
      destination_path: destinationPath,
      return_path: safeReturnPath(returnPath),
      status: 'pending',
      expires_at: expiresAt,
    })

  if (error) throw new Error('Unable to create unlock session.')
  return { rawToken, expiresAt }
}

async function getExistingAccess(user, contentType, contentId, content) {
  if (String(user?.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return { source: 'admin', expiresAt: null }
  }

  if (isAdsEnabled(content)) {
    const adUnlock = await findActiveAdUnlock(user.id, contentType, contentId, content)
    if (adUnlock?.expires_at) {
      return {
        source: 'shortener_unlock',
        expiresAt: adUnlock.expires_at,
        storyId: adUnlock.story_id ?? null,
        unlockStartEpisode: adUnlock.start_episode_number ?? null,
        unlockEndEpisode: adUnlock.end_episode_number ?? null,
      }
    }
  }

  if (await hasActivePurchase(user.id, content)) {
    return { source: 'purchase', expiresAt: null }
  }

  return null
}

async function previewUnlock(req, res, body) {
  const user = await authenticate(req)
  const contentType = String(body?.contentType || '').trim().toLowerCase()
  const contentId = parsePositiveId(body?.contentId)
  if (!['audio', 'video'].includes(contentType) || !contentId) {
    return json(res, 400, { error: 'Invalid unlock target.' })
  }

  const content = await loadContentForPreview(contentType, contentId)
  const settings = await getAdminSettings()
  const { storyId, episodeNumber } = await getEpisodeUnlockContext(contentType, content)
  const plan = resolveAdUnlockPlan(episodeNumber, settings.episodeUnlockRules)
  const episodeNumbers = await getExistingEpisodeNumbers(
    contentType,
    storyId,
    plan.startEpisode,
    plan.endEpisode
  )
  const existingAccess = await getExistingAccess(user, contentType, contentId, content)

  return json(res, 200, {
    ok: true,
    contentType,
    contentId,
    storyId,
    episodeNumber,
    unlockCount: plan.unlockCount,
    unlockStartEpisode: plan.startEpisode,
    unlockEndEpisode: plan.endEpisode,
    episodeNumbers,
    durationMinutes: settings.unlockDurationMinutes,
    alreadyGranted: Boolean(existingAccess),
    source: existingAccess?.source || null,
    expiresAt: existingAccess?.expiresAt || null,
  })
}

async function startUnlock(req, res, body) {
  const user = await authenticate(req)
  if (!UNLOCK_TOKEN_SECRET || !isValidPublicBaseUrl()) {
    return json(res, 503, { error: 'Temporary unlock is not configured.' })
  }

  const contentType = String(body?.contentType || '').trim().toLowerCase()
  const contentId = parsePositiveId(body?.contentId)
  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId) {
    return json(res, 400, { error: 'Invalid unlock target.' })
  }

  const content = await loadContent(contentType, contentId)

  // The browser may be stale or a caller may invoke this endpoint directly.
  // Re-check paid/temporary/admin access on the server before creating a new
  // shortener intent. This prevents unnecessary provider traffic and ensures
  // the shortener is never used as an alternate path when access already exists.
  const existingAccess = await getExistingAccess(user, contentType, contentId, content)
  if (existingAccess) {
    return json(res, 200, {
      ok: true,
      alreadyGranted: true,
      source: existingAccess.source,
      expiresAt: existingAccess.expiresAt,
    })
  }

  const settings = await getAdminSettings()
  if (!settings.shortenerEnabled) {
    return json(res, 503, { error: 'Shortener unlock is currently disabled.' })
  }

  const order = getProviderOrder(settings)
  if (!order.length) {
    return json(res, 503, { error: 'No shortener provider is configured.' })
  }

  const destinationPath = contentPath(contentType, contentId)
  let linkResult
  try {
    linkResult = await getOrCreateShortLink(contentType, contentId, order)
  } catch {
    return json(res, 503, { error: 'Shortener unlock is temporarily unavailable. Please try again later.' })
  }

  const link = linkResult.link
  const intent = await createIntent({
    user,
    contentType,
    contentId,
    provider: link.provider,
    destinationPath,
    returnPath: body?.returnPath,
  })

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': cookieHeader('hj_unlock_intent', intent.rawToken, {
      maxAge: UNLOCK_INTENT_TTL_MINUTES * 60,
      httpOnly: true,
    }),
  })
  res.end(JSON.stringify({
    shortUrl: link.short_url,
    provider: link.provider,
    reused: Boolean(linkResult.reused),
    expiresAt: intent.expiresAt,
  }))
}

async function completeUnlock(req, res) {
  const user = await authenticate(req)
  const rawToken = cookieValue(req, 'hj_unlock_code')
  if (!rawToken) return json(res, 200, { ok: false, reason: 'no_completion_session' })

  let tokenHash
  try { tokenHash = hmacToken(rawToken) } catch {
    return json(res, 503, { error: 'Temporary unlock is not configured.' })
  }

  const { data: intent, error } = await getServiceClient()
    .from('shortener_unlock_intents')
    .select('id, user_id, content_type, content_id, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) return json(res, 500, { error: 'Unable to verify unlock session.' })
  if (!intent) return json(res, 403, { error: 'Invalid unlock session.' })
  if (intent.user_id !== user.id) return json(res, 403, { error: 'Unlock session does not belong to this account.' })
  if (intent.status !== 'pending') return json(res, 409, { error: 'This unlock session has already been used.' })

  if (!isIntentUsable(intent, {
    userId: user.id,
    contentType: intent.content_type,
    contentId: intent.content_id,
    nowMs: Date.now(),
  })) {
    if (new Date(intent.expires_at).getTime() <= Date.now()) {
      await getServiceClient().from('shortener_unlock_intents').update({ status: 'expired' }).eq('id', intent.id)
      return json(res, 410, { error: 'Unlock session expired.' })
    }
    return json(res, 403, { error: 'Invalid unlock session.' })
  }

  let content
  try {
    content = await loadContent(intent.content_type, intent.content_id)
  } catch {
    return json(res, 403, { error: 'Unlock target is no longer eligible.' })
  }

  const settings = await getAdminSettings()
  const existingAccess = await getExistingAccess(user, intent.content_type, intent.content_id, content)
  if (existingAccess) {
    await markIntentCompleted(intent.id)
    clearCookie(res, 'hj_unlock_code')

    let existingStoryId = existingAccess.storyId ?? null
    let existingEpisodeNumber = existingAccess.episodeNumber ?? null
    let existingStartEpisode = existingAccess.unlockStartEpisode ?? null
    let existingEndEpisode = existingAccess.unlockEndEpisode ?? null
    let existingEpisodeNumbers = []

    if (existingAccess.source === 'shortener_unlock' && ['audio', 'video'].includes(intent.content_type)) {
      const context = await getEpisodeUnlockContext(intent.content_type, content)
      existingStoryId = existingStoryId ?? context.storyId
      existingEpisodeNumber = existingEpisodeNumber ?? context.episodeNumber
      existingStartEpisode = existingStartEpisode ?? context.episodeNumber
      existingEndEpisode = existingEndEpisode ?? context.episodeNumber

      if (existingStoryId != null && existingStartEpisode != null && existingEndEpisode != null) {
        existingEpisodeNumbers = await getExistingEpisodeNumbers(
          intent.content_type,
          existingStoryId,
          existingStartEpisode,
          existingEndEpisode
        )
      }

      if (!existingEpisodeNumbers.length && existingEpisodeNumber != null) {
        existingEpisodeNumbers = [existingEpisodeNumber]
      }
    }

    return json(res, 200, {
      ok: true,
      contentType: intent.content_type,
      contentId: intent.content_id,
      expiresAt: existingAccess.expiresAt,
      storyId: existingStoryId,
      episodeNumber: existingEpisodeNumber,
      unlockStartEpisode: existingStartEpisode,
      unlockEndEpisode: existingEndEpisode,
      unlockCount: existingStartEpisode != null && existingEndEpisode != null
        ? existingEndEpisode - existingStartEpisode + 1
        : 1,
      episodeNumbers: existingEpisodeNumbers,
      alreadyGranted: true,
      source: existingAccess.source,
    })
  }

  const newExpiry = calculateUnlockExpiry(Date.now(), settings.unlockDurationMinutes)
  let storyId = null
  let episodeNumber = null
  let episodeNumbers = []
  let unlockStartEpisode = null
  let unlockEndEpisode = null

  if (intent.content_type === 'audio' || intent.content_type === 'video') {
    const context = await getEpisodeUnlockContext(intent.content_type, content)
    storyId = context.storyId
    episodeNumber = context.episodeNumber

    const plan = resolveAdUnlockPlan(episodeNumber, settings.episodeUnlockRules)
    unlockStartEpisode = plan.startEpisode
    unlockEndEpisode = plan.endEpisode
    episodeNumbers = await getExistingEpisodeNumbers(
      intent.content_type,
      storyId,
      plan.startEpisode,
      plan.endEpisode
    )

    const existingRange = await findActiveAdUnlock(
      user.id,
      intent.content_type,
      intent.content_id,
      content
    )

    if (existingRange) {
      const finalExpiry = chooseUnlockExpiry(existingRange.expires_at, newExpiry)
      const updates = {
        expires_at: finalExpiry,
        updated_at: new Date().toISOString(),
      }

      // A legacy single-episode row can be upgraded in-place to the new
      // range representation without creating a second entitlement row.
      if (!existingRange.start_episode_number || existingRange.content_id === intent.content_id) {
        updates.story_id = storyId
        updates.start_episode_number = unlockStartEpisode
        updates.end_episode_number = unlockEndEpisode
      }

      const { error: updateError } = await getServiceClient()
        .from('shortener_unlocks')
        .update(updates)
        .eq('id', existingRange.id)

      if (updateError) return json(res, 500, { error: 'Unable to update temporary access.' })

      episodeNumbers = existingRange.start_episode_number && existingRange.end_episode_number
        ? await getExistingEpisodeNumbers(
          intent.content_type,
          existingRange.story_id,
          existingRange.start_episode_number,
          existingRange.end_episode_number
        )
        : episodeNumbers

      await markIntentCompleted(intent.id)
      clearCookie(res, 'hj_unlock_code')
      return json(res, 200, {
        ok: true,
        contentType: intent.content_type,
        contentId: existingRange.content_id,
        expiresAt: finalExpiry,
        storyId: existingRange.story_id ?? storyId,
        episodeNumber: existingRange.start_episode_number ?? episodeNumber,
        unlockCount: existingRange.start_episode_number
          ? (existingRange.end_episode_number - existingRange.start_episode_number + 1)
          : plan.unlockCount,
        unlockStartEpisode: existingRange.start_episode_number ?? unlockStartEpisode,
        unlockEndEpisode: existingRange.end_episode_number ?? unlockEndEpisode,
        episodeNumbers,
        reusedExisting: true,
      })
    }

    if (!episodeNumbers.includes(episodeNumber)) {
      episodeNumbers.push(episodeNumber)
      episodeNumbers.sort((a, b) => a - b)
    }

    const { error: insertError } = await getServiceClient()
      .from('shortener_unlocks')
      .upsert({
        user_id: user.id,
        content_type: intent.content_type,
        content_id: intent.content_id,
        expires_at: newExpiry,
        story_id: storyId,
        start_episode_number: unlockStartEpisode,
        end_episode_number: unlockEndEpisode,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,content_type,content_id',
      })

    if (insertError) return json(res, 500, { error: 'Unable to save temporary access.' })

    await markIntentCompleted(intent.id)
    clearCookie(res, 'hj_unlock_code')
    return json(res, 200, {
      ok: true,
      contentType: intent.content_type,
      contentId: intent.content_id,
      expiresAt: newExpiry,
      storyId,
      episodeNumber,
      unlockCount: plan.unlockCount,
      unlockStartEpisode,
      unlockEndEpisode,
      episodeNumbers,
      reusedExisting: false,
    })
  }

  const { data: existingBook } = await getServiceClient()
    .from('shortener_unlocks')
    .select('expires_at')
    .eq('user_id', user.id)
    .eq('content_type', intent.content_type)
    .eq('content_id', intent.content_id)
    .maybeSingle()

  const finalBookExpiry = chooseUnlockExpiry(existingBook?.expires_at, newExpiry)
  const { error: bookUpsertError } = await getServiceClient()
    .from('shortener_unlocks')
    .upsert({
      user_id: user.id,
      content_type: intent.content_type,
      content_id: intent.content_id,
      expires_at: finalBookExpiry,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,content_type,content_id',
    })

  if (bookUpsertError) return json(res, 500, { error: 'Unable to save temporary access.' })

  await markIntentCompleted(intent.id)
  clearCookie(res, 'hj_unlock_code')
  return json(res, 200, {
    ok: true,
    contentType: intent.content_type,
    contentId: intent.content_id,
    expiresAt: finalBookExpiry,
    storyId: null,
    episodeNumber: null,
    episodeNumbers: [],
    unlockCount: 1,
  })
}

async function unlockLanding(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 3) return json(res, 404, { error: 'Unlock route not found.' })

  const contentType = parts[1]
  const contentId = parsePositiveId(parts[2])
  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId) {
    return redirect(res, '/?unlock_error=invalid_target')
  }

  const rawToken = cookieValue(req, 'hj_unlock_intent')
  if (!rawToken) return redirect(res, '/?unlock_error=missing_session')

  let tokenHash
  try { tokenHash = hmacToken(rawToken) } catch {
    return redirect(res, '/?unlock_error=not_configured')
  }

  const { data: intent, error } = await getServiceClient()
    .from('shortener_unlock_intents')
    .select('id, user_id, content_type, content_id, status, expires_at, return_path')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !intent) return redirect(res, '/?unlock_error=invalid_session')
  if (intent.content_type !== contentType || intent.content_id !== contentId) {
    return redirect(res, '/?unlock_error=target_mismatch')
  }
  if (intent.status !== 'pending') return redirect(res, '/?unlock_error=already_used')

  if (!isIntentUsable(intent, {
    contentType,
    contentId,
    nowMs: Date.now(),
    userId: intent.user_id,
  })) {
    if (new Date(intent.expires_at).getTime() <= Date.now()) {
      await getServiceClient().from('shortener_unlock_intents').update({ status: 'expired' }).eq('id', intent.id)
      return redirect(res, '/?unlock_error=expired')
    }
    return redirect(res, '/?unlock_error=invalid_session')
  }

  const returnUrl = new URL(safeReturnPath(intent.return_path), PUBLIC_BASE_URL)
  returnUrl.pathname = returnUrl.pathname || '/'
  res.writeHead(303, {
    'Location': returnUrl.pathname + returnUrl.search + returnUrl.hash,
    'Cache-Control': 'no-store',
    'Set-Cookie': [
      cookieHeader('hj_unlock_intent', '', { maxAge: 0, httpOnly: true }),
      cookieHeader('hj_unlock_code', rawToken, {
        maxAge: UNLOCK_CODE_TTL_MINUTES * 60,
        httpOnly: true,
      }),
    ],
  })
  res.end()
}

async function hasActivePurchase(userId, content) {
  const storyCandidates = []

  if (content?.story_id != null) storyCandidates.push(content.story_id)
  if (content?.video_story_id != null) storyCandidates.push(content.video_story_id)
  if (content?.id != null) storyCandidates.push(content.id)

  const candidates = [...new Set(
    storyCandidates
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )]

  if (!candidates.length) return false

  const now = new Date().toISOString()
  const { data, error } = await getServiceClient()
    .from('purchases')
    .select('id, story_id, expires_at')
    .eq('user_id', userId)
    .in('story_id', candidates)

  if (error) throw new Error('Unable to verify paid access.')

  return (data || []).some((purchase) => (
    !purchase.expires_at || new Date(purchase.expires_at).getTime() > new Date(now).getTime()
  ))
}

async function checkAccess(req, res, body) {
  const user = await authenticate(req)
  const contentType = String(body?.contentType || '').trim().toLowerCase()
  const contentId = parsePositiveId(body?.contentId)
  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId) {
    return json(res, 400, { error: 'Invalid content target.' })
  }

  const content = await getContentRecord(contentType, contentId)

  if (String(user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return json(res, 200, { ok: true, source: 'admin' })
  }

  if (isAdsEnabled(content)) {
    const adUnlock = await findActiveAdUnlock(user.id, contentType, contentId, content)
    if (adUnlock?.expires_at) {
      return json(res, 200, {
        ok: true,
        source: 'shortener_unlock',
        expiresAt: adUnlock.expires_at,
        unlockStartEpisode: adUnlock.start_episode_number ?? null,
        unlockEndEpisode: adUnlock.end_episode_number ?? null,
      })
    }
  }

  if (await hasActivePurchase(user.id, content)) {
    return json(res, 200, { ok: true, source: 'purchase' })
  }

  return json(res, 403, { error: 'Temporary or paid access required.' })
}

async function listEntitlements(req, res) {
  const user = await authenticate(req)
  const { data, error } = await getServiceClient()
    .from('shortener_unlocks')
    .select('id, content_type, content_id, expires_at, story_id, start_episode_number, end_episode_number')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())

  if (error) return json(res, 500, { error: 'Unable to load temporary access.' })

  const rows = data || []
  const episodeIds = rows.filter((row) => row.content_type === 'audio' && row.start_episode_number == null).map((row) => row.content_id)
  const videoIds = rows.filter((row) => row.content_type === 'video' && row.start_episode_number == null).map((row) => row.content_id)

  const [episodes, videos] = await Promise.all([
    episodeIds.length
      ? getServiceClient().from('episodes').select('id, story_id, episode_number, number').in('id', episodeIds)
      : Promise.resolve({ data: [] }),
    videoIds.length
      ? getServiceClient().from('video_episodes').select('id, video_story_id, number').in('id', videoIds)
      : Promise.resolve({ data: [] }),
  ])

  const episodeMap = new Map((episodes.data || []).map((row) => [String(row.id), row]))
  const videoMap = new Map((videos.data || []).map((row) => [String(row.id), row]))

  const unlocks = await Promise.all(rows.map(async (row) => {
    if (row.content_type === 'audio') {
      const info = episodeMap.get(String(row.content_id))
      const storyId = row.story_id ?? info?.story_id ?? null
      const episodeNumber = row.start_episode_number ?? info?.number ?? info?.episode_number ?? null
      const episodeNumbers = row.start_episode_number != null && row.end_episode_number != null && storyId != null
        ? await getExistingEpisodeNumbers('audio', storyId, row.start_episode_number, row.end_episode_number)
        : (episodeNumber != null ? [episodeNumber] : [])
      return {
        ...row,
        storyId,
        episodeNumber,
        unlockStartEpisode: row.start_episode_number ?? episodeNumber,
        unlockEndEpisode: row.end_episode_number ?? episodeNumber,
        unlockCount: row.start_episode_number != null && row.end_episode_number != null
          ? row.end_episode_number - row.start_episode_number + 1
          : 1,
        episodeNumbers,
      }
    }
    if (row.content_type === 'video') {
      const info = videoMap.get(String(row.content_id))
      const storyId = row.story_id ?? info?.video_story_id ?? null
      const episodeNumber = row.start_episode_number ?? info?.number ?? null
      const episodeNumbers = row.start_episode_number != null && row.end_episode_number != null && storyId != null
        ? await getExistingEpisodeNumbers('video', storyId, row.start_episode_number, row.end_episode_number)
        : (episodeNumber != null ? [episodeNumber] : [])
      return {
        ...row,
        storyId,
        episodeNumber,
        unlockStartEpisode: row.start_episode_number ?? episodeNumber,
        unlockEndEpisode: row.end_episode_number ?? episodeNumber,
        unlockCount: row.start_episode_number != null && row.end_episode_number != null
          ? row.end_episode_number - row.start_episode_number + 1
          : 1,
        episodeNumbers,
      }
    }
    return { ...row, episodeNumbers: [] }
  }))

  return json(res, 200, { unlocks })
}

async function status(req, res) {
  await authenticateAdmin(req)

  const configured = {
    arolinks: Boolean(String(process.env.AROLINKS_API_TOKEN || '').trim()),
    earn4link: Boolean(String(process.env.EARN4LINK_API_TOKEN || '').trim()),
    unlockSecret: Boolean(UNLOCK_TOKEN_SECRET),
    supabaseServiceRole: Boolean(SERVICE_ROLE_KEY),
    publicBaseUrl: isValidPublicBaseUrl(),
  }

  // Health must report provider/runtime configuration even when the optional
  // cloud settings row is unavailable. Otherwise every provider is incorrectly
  // shown as "Not configured" for an unrelated database/configuration failure.
  let settings = {
    shortenerEnabled: false,
    primary: 'arolinks',
    fallback: 'earn4link',
    unlockDurationMinutes: 360,
  }
  let settingsError = ''

  try {
    settings = await getAdminSettings()
  } catch (error) {
    settingsError = String(error?.message || 'Unable to load shortener settings.')
  }

  const providers = getProviderOrder(settings)
  return json(res, 200, {
    ok: !settingsError && configured.supabaseServiceRole && configured.publicBaseUrl,
    supabaseUrl: Boolean(SUPABASE_URL),
    diagnosticVersion: SHORTENER_STATUS_VERSION,
    enabled: settings.shortenerEnabled,
    primary: settings.primary,
    fallback: settings.fallback,
    chain: providers,
    configured,
    unlockDurationMinutes: settings.unlockDurationMinutes,
    settingsError: settingsError || null,
  }, corsHeaders(req))
}

function clearCookie(res, name) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', name + '=; Path=/; Max-Age=0; SameSite=Lax' + secure)
}

function redirect(res, location) {
  res.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  })
  res.end()
}

function json(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

export {
  extractBearer,
  isLikelyJwt,
  getProviderOrder,
  extractProviderUrl,
  callProvider,
  createShortLinkWithFallback,
  hmacToken,
  randomToken,
  safeReturnPath,
  calculateUnlockExpiry,
  isIntentUsable,
  contentPath,
  isReusableShortLink,
  isEntitlementActive,
  chooseUnlockExpiry,
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

export async function handleShortenerRequest(req, res, url, readBody) {
  try {
    if (url.pathname === '/api/shortener/preview' && req.method === 'POST') {
      return previewUnlock(req, res, await readBody())
    }

    if (url.pathname === '/api/shortener/start' && req.method === 'POST') {
      return startUnlock(req, res, await readBody())
    }

    if (url.pathname === '/api/shortener/complete' && req.method === 'POST') {
      return completeUnlock(req, res)
    }

    if (url.pathname === '/api/shortener/access' && req.method === 'POST') {
      return checkAccess(req, res, await readBody())
    }

    if (url.pathname === '/api/shortener/entitlements' && req.method === 'GET') {
      return listEntitlements(req, res)
    }

    if (url.pathname === '/api/shortener/status' && req.method === 'OPTIONS') {
      return json(res, 204, {}, { ...corsHeaders(req) })
    }

    if (url.pathname === '/api/shortener/status' && req.method === 'GET') {
      return status(req, res)
    }

    if (url.pathname.startsWith('/unlock/') && req.method === 'GET') {
      return unlockLanding(req, res, url)
    }

    return false
  } catch (error) {
    const message = String(error?.message || 'Shortener request failed')
    console.error('[shortener] request failed:', message)
    const statusCode = /Authentication required|Authentication failed|Admin access required/.test(message)
      ? 401
      : /SUPABASE_SERVICE_ROLE_KEY is not configured|Supabase server URL|Supabase server client configuration|not configured/i.test(message)
        ? 503
        : /Supabase auth verification failed/i.test(message)
          ? 502
          : /Shortener episode unlock rules are invalid/i.test(message)
            ? 503
            : 500
    return json(res, statusCode, {
      error: statusCode === 401 ? message : 'Shortener service error.',
      code: statusCode === 503 ? 'SHORTENER_CONFIGURATION_ERROR' : statusCode === 502 ? 'SUPABASE_AUTH_ERROR' : 'SHORTENER_INTERNAL_ERROR',
    }, corsHeaders(req))
  }
}
