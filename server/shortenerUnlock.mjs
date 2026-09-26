import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://yajkfglagnyvenddyvok.supabase.co'
).trim().replace(/\/+$/, '')

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
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
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
  if (!/^Bearer\\s+/i.test(header)) return ''
  return header.replace(/^Bearer\\s+/i, '').trim()
}

async function authenticate(req) {
  const token = extractBearer(req)
  if (!token) throw new Error('Authentication required.')
  const { data, error } = await getServiceClient().auth.getUser(token)
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
  const ads = data?.value?.ads
  return {
    shortenerEnabled: ads?.shortenerEnabled === true,
    primary: String(ads?.primaryShortener || 'arolinks').trim().toLowerCase(),
    fallback: String(ads?.fallbackShortener || 'earn4link').trim().toLowerCase(),
    unlockDurationMinutes: Math.min(
      1440,
      Math.max(1, Number(ads?.unlockDurationMinutes) || 360)
    ),
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

    if (latest?.id) {
      await deactivateExistingShortLink(latest.id)
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
      throw new Error('Ad unlock is temporarily unavailable. Please try again later.')
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
      .select('id, provider, short_url, destination_path, provider_chain')
      .maybeSingle()

    if (inserted.error) {
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
    .from('ad_unlock_intents')
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

  const nowIso = new Date().toISOString()
  const { data: adUnlock, error: unlockError } = await getServiceClient()
    .from('ad_unlocks')
    .select('expires_at')
    .eq('user_id', user.id)
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (unlockError) throw new Error('Unable to verify existing temporary access.')
  if (adUnlock?.expires_at) {
    return { source: 'ad_unlock', expiresAt: adUnlock.expires_at }
  }

  if (await hasActivePurchase(user.id, content)) {
    return { source: 'purchase', expiresAt: null }
  }

  return null
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
    return json(res, 503, { error: 'Ad unlock is currently disabled.' })
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
    return json(res, 503, { error: 'Ad unlock is temporarily unavailable. Please try again later.' })
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
  if (!rawToken) return json(res, 400, { error: 'Unlock completion session is missing.' })

  let tokenHash
  try { tokenHash = hmacToken(rawToken) } catch {
    return json(res, 503, { error: 'Temporary unlock is not configured.' })
  }

  const { data: intent, error } = await getServiceClient()
    .from('ad_unlock_intents')
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
      await getServiceClient().from('ad_unlock_intents').update({ status: 'expired' }).eq('id', intent.id)
      return json(res, 410, { error: 'Unlock session expired.' })
    }
    return json(res, 403, { error: 'Invalid unlock session.' })
  }

  try {
    await loadContent(intent.content_type, intent.content_id)
  } catch {
    return json(res, 403, { error: 'Unlock target is no longer eligible.' })
  }

  const settings = await getAdminSettings()
  const expiresAt = calculateUnlockExpiry(Date.now(), settings.unlockDurationMinutes)

  const { data: existing } = await getServiceClient()
    .from('ad_unlocks')
    .select('expires_at')
    .eq('user_id', user.id)
    .eq('content_type', intent.content_type)
    .eq('content_id', intent.content_id)
    .maybeSingle()

  const finalExpiry = chooseUnlockExpiry(existing?.expires_at, expiresAt)

  const { error: upsertError } = await getServiceClient()
    .from('ad_unlocks')
    .upsert({
      user_id: user.id,
      content_type: intent.content_type,
      content_id: intent.content_id,
      expires_at: finalExpiry,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,content_type,content_id',
    })

  if (upsertError) return json(res, 500, { error: 'Unable to save temporary access.' })

  await getServiceClient()
    .from('ad_unlock_intents')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', intent.id)
    .eq('status', 'pending')

  let storyId = null
  let episodeNumber = null
  if (intent.content_type === 'audio') {
    const { data } = await getServiceClient()
      .from('episodes')
      .select('story_id, episode_number, number')
      .eq('id', intent.content_id)
      .maybeSingle()
    storyId = data?.story_id ?? null
    episodeNumber = data?.number ?? data?.episode_number ?? null
  } else if (intent.content_type === 'video') {
    const { data } = await getServiceClient()
      .from('video_episodes')
      .select('video_story_id, number')
      .eq('id', intent.content_id)
      .maybeSingle()
    storyId = data?.video_story_id ?? null
    episodeNumber = data?.number ?? null
  }

  clearCookie(res, 'hj_unlock_code')
  return json(res, 200, {
    ok: true,
    contentType: intent.content_type,
    contentId: intent.content_id,
    expiresAt: finalExpiry,
    storyId,
    episodeNumber,
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
    .from('ad_unlock_intents')
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
      await getServiceClient().from('ad_unlock_intents').update({ status: 'expired' }).eq('id', intent.id)
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

  const { data: adUnlock, error: unlockError } = await getServiceClient()
    .from('ad_unlocks')
    .select('expires_at')
    .eq('user_id', user.id)
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (unlockError) return json(res, 500, { error: 'Unable to verify temporary access.' })
  if (adUnlock?.expires_at) {
    return json(res, 200, { ok: true, source: 'ad_unlock', expiresAt: adUnlock.expires_at })
  }

  if (await hasActivePurchase(user.id, content)) {
    return json(res, 200, { ok: true, source: 'purchase' })
  }

  return json(res, 403, { error: 'Temporary or paid access required.' })
}

async function listEntitlements(req, res) {
  const user = await authenticate(req)
  const { data, error } = await getServiceClient()
    .from('ad_unlocks')
    .select('content_type, content_id, expires_at')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())

  if (error) return json(res, 500, { error: 'Unable to load temporary access.' })

  const rows = data || []
  const episodeIds = rows.filter((row) => row.content_type === 'audio').map((row) => row.content_id)
  const videoIds = rows.filter((row) => row.content_type === 'video').map((row) => row.content_id)

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

  return json(res, 200, {
    unlocks: rows.map((row) => {
      if (row.content_type === 'audio') {
        const info = episodeMap.get(String(row.content_id))
        return {
          ...row,
          storyId: info?.story_id ?? null,
          episodeNumber: info?.number ?? info?.episode_number ?? null,
        }
      }
      if (row.content_type === 'video') {
        const info = videoMap.get(String(row.content_id))
        return {
          ...row,
          storyId: info?.video_story_id ?? null,
          episodeNumber: info?.number ?? null,
        }
      }
      return row
    }),
  })
}

async function status(req, res) {
  await authenticateAdmin(req)
  const settings = await getAdminSettings()
  const providers = getProviderOrder(settings)
  return json(res, 200, {
    enabled: settings.shortenerEnabled,
    primary: settings.primary,
    fallback: settings.fallback,
    chain: providers,
    configured: {
      arolinks: Boolean(String(process.env.AROLINKS_API_TOKEN || '').trim()),
      earn4link: Boolean(String(process.env.EARN4LINK_API_TOKEN || '').trim()),
      unlockSecret: Boolean(UNLOCK_TOKEN_SECRET),
      supabaseServiceRole: Boolean(SERVICE_ROLE_KEY),
      publicBaseUrl: isValidPublicBaseUrl(),
    },
    unlockDurationMinutes: settings.unlockDurationMinutes,
  })
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

export async function handleShortenerRequest(req, res, url, readBody) {
  try {
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
    const statusCode = /Authentication required|Authentication failed|Admin access required/.test(message) ? 401 : 500
    return json(res, statusCode, {
      error: statusCode === 401 ? message : 'Shortener service error.',
    })
  }
}
