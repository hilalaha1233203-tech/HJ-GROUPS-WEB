import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isTamilText, MAX_CHARS, synthesizeEdgeTts } from './server/edgeTts.mjs'
import { isSarvamConfigured, synthesizeSarvamTts } from './server/sarvamTts.mjs'
import { handleShortenerRequest } from './server/shortenerUnlock.mjs'
import { handleRewardedAdRequest } from './server/rewardedAdUnlock.mjs'
import { handlePaymentRequest } from './server/payment.mjs'
import { handleAdminUserExport } from './server/adminUserExport.mjs'
import { isHjAdminUser } from './server/adminAuth.mjs'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
  res.end(body)
}

async function readRawBody(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 200_000) throw new Error('Request body too large')
  }
  return body
}

async function readJson(req) {
  const body = await readRawBody(req)
  return JSON.parse(body || '{}')
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

// PDF/EPUB extraction can split Tamil glyphs with spaces (for example
// "வ ண க் க ம்"). Joining only long glyph-separated runs restores the word
// without removing normal spaces between Tamil words.
function normalizeSpeechText(value) {
  let text = String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim()

  text = text.replace(/(?:[\u0B80-\u0BFF](?:\s+|$)){3,}/gu, (run) =>
    run.replace(/\s+/gu, '')
  )

  return text
}

const jsonHeaders = (req) => ({
  'Content-Type': 'application/json; charset=utf-8',
  ...corsHeaders(req),
})

const PUBLIC_SETTINGS_SUPABASE_URL = String(process.env.VITE_SUPABASE_URL || 'https://yajkfglagnyvenddyvok.supabase.co').trim()
const PUBLIC_SETTINGS_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

async function handleAdminAnalytics(req, res) {
  if (req.method !== 'GET') {
    return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: 'GET',
    })
  }

  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || 'https://yajkfglagnyvenddyvok.supabase.co').trim()
  const authorization = String(req.headers.authorization || '')
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

  if (!serviceKey || !accessToken) {
    return send(res, 401, JSON.stringify({ error: 'Unauthorized' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken)
    if (userError || !isHjAdminUser(userData?.user)) {
      return send(res, 403, JSON.stringify({ error: 'Forbidden' }), {
        'Content-Type': 'application/json; charset=utf-8',
      })
    }

    const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
    const range = url.searchParams.get('range') || '7d'
    const requestedStart = url.searchParams.get('start')
    const requestedEnd = url.searchParams.get('end')
    let start = null
    let end = null
    if (requestedStart && requestedEnd) {
      const startDate = new Date(requestedStart)
      const endDate = new Date(requestedEnd)
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
        return send(res, 400, JSON.stringify({ error: 'Invalid analytics date range' }), {
          'Content-Type': 'application/json; charset=utf-8',
        })
      }
      start = startDate.toISOString()
      end = endDate.toISOString()
    } else if (range !== 'all') {
      const now = new Date()
      const startDate = new Date(now)
      if (range === 'today') startDate.setHours(0, 0, 0, 0)
      else if (range === '30d') startDate.setDate(startDate.getDate() - 30)
      else startDate.setDate(startDate.getDate() - 7)
      start = startDate.toISOString()
      end = now.toISOString()
    }

    const { data, error } = await adminClient.rpc('get_hj_admin_analytics', {
      p_start_at: start,
      p_end_at: end,
    })
    if (error) throw error

    return send(res, 200, JSON.stringify(data || {}), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  } catch (error) {
    console.warn('[admin-analytics] load failed:', String(error?.message || error).slice(0, 300))
    return send(res, 500, JSON.stringify({ error: 'Analytics unavailable' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }
}

async function handlePublicSettings(req, res) {
  if (req.method !== 'GET') {
    return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: 'GET',
    })
  }

  if (!PUBLIC_SETTINGS_SERVICE_KEY) {
    return send(res, 503, JSON.stringify({ error: 'Public settings service is not configured' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }

  try {
    const client = createClient(PUBLIC_SETTINGS_SUPABASE_URL, PUBLIC_SETTINGS_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client
      .from('app_settings')
      .select('value')
      .eq('id', 'hj_admin_settings')
      .maybeSingle()

    if (error) throw error

    const website = data?.value?.website
    const rawSupportUrl = String(website?.supportTelegramUrl || '').trim()
    let supportTelegramUrl = ''
    if (rawSupportUrl) {
      try {
        const parsed = new URL(rawSupportUrl)
        if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 't.me') {
          supportTelegramUrl = parsed.toString()
        }
      } catch {}
    }

    return send(res, 200, JSON.stringify({
      ok: true,
      website: { supportTelegramUrl },
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  } catch (error) {
    console.warn('[public-settings] load failed:', String(error?.message || error).slice(0, 300))
    return send(res, 503, JSON.stringify({ error: 'Public settings unavailable' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }
}

async function handleTts(req, res, forcedProvider = 'auto') {
  if (req.method === 'OPTIONS') {
    return send(res, 204, '', corsHeaders(req))
  }

  if (req.method !== 'POST') {
    return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), {
      ...jsonHeaders(req),
      Allow: 'POST, OPTIONS',
    })
  }

  let body
  try {
    body = await readJson(req)
  } catch (error) {
    return send(res, 400, JSON.stringify({
      error: 'Invalid JSON request',
      detail: String(error?.message || 'Malformed JSON').slice(0, 200),
    }), jsonHeaders(req))
  }

  const text = normalizeSpeechText(body.text)

  if (!text) {
    return send(res, 400, JSON.stringify({ error: 'text is required' }), jsonHeaders(req))
  }

  if (text.length > MAX_CHARS) {
    return send(res, 413, JSON.stringify({
      error: 'text exceeds ' + MAX_CHARS + ' characters',
    }), jsonHeaders(req))
  }

  const requestedProvider = String(
    forcedProvider === 'auto' ? body.provider || 'auto' : forcedProvider
  ).trim().toLowerCase()

  const tamil = isTamilText(text)
  let providers
  if (requestedProvider === 'edge') {
    providers = ['edge']
  } else if (requestedProvider === 'sarvam') {
    providers = ['sarvam']
  } else if (requestedProvider === 'auto') {
    // Sarvam is preferred for Tamil because it is the dedicated Indian
    // language model path; Microsoft Edge remains the reliable fallback.
    providers = tamil ? ['sarvam', 'edge'] : ['edge', 'sarvam']
    if (!isSarvamConfigured()) providers = providers.filter((provider) => provider !== 'sarvam')
  } else {
    return send(res, 400, JSON.stringify({
      error: 'Unsupported TTS provider',
      detail: 'provider must be auto, edge, or sarvam',
    }), jsonHeaders(req))
  }

  const errors = []

  for (const provider of providers) {
    try {
      const audio = provider === 'sarvam'
        ? await synthesizeSarvamTts({
            text,
            languageCode: body.language_code,
            speaker: body.speaker,
            pace: body.pace ?? body.rate,
            temperature: body.temperature,
          })
        : await synthesizeEdgeTts({
            text,
            voice: body.voice,
            rate: body.rate,
            pitch: body.pitch,
          })

      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'private, max-age=3600',
        'X-TTS-Provider': provider,
        ...corsHeaders(req),
      })
      res.end(audio)
      return
    } catch (error) {
      const message = String(error?.message || provider + ' TTS request failed').slice(0, 300)
      errors.push(provider + ': ' + message)
      console.warn('TTS provider failed:', provider, message)
    }
  }

  const allUnconfigured =
    providers.length === 0 ||
    providers.every((provider) => provider === 'sarvam' && !isSarvamConfigured())

  send(res, allUnconfigured ? 503 : 502, JSON.stringify({
    error: 'Text-to-speech service unavailable',
    detail: errors.join(' | ').slice(0, 700),
  }), jsonHeaders(req))
}

async function serveStatic(req, res, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return send(res, 400, 'Bad request')
  }

  let relative = decoded.replace(/^\/+/, '')
  if (!relative) relative = 'index.html'

  const candidate = path.resolve(DIST, relative)
  if (!candidate.startsWith(DIST + path.sep) && candidate !== DIST) {
    return send(res, 403, 'Forbidden')
  }

  try {
    const stat = await fs.stat(candidate)
    if (stat.isFile()) {
      const ext = path.extname(candidate).toLowerCase()
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      })
      const file = await fs.readFile(candidate)
      res.end(file)
      return
    }
  } catch {}

  try {
    const index = await fs.readFile(path.join(DIST, 'index.html'))
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(index)
  } catch {
    send(res, 503, 'Frontend build not found')
  }
}

const server = createServer(async (req, res) => {
  try {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({
      ok: true,
      service: 'hj-groups-web',
      ttsConfigured: true,
      ttsProvider: 'auto',
      ttsRequiresApiKey: false,
      ttsProviders: {
        edge: { configured: true },
        sarvam: { configured: isSarvamConfigured() },
      },
      ttsStrategy: 'Tamil: Sarvam Bulbul v3 → Microsoft Edge Neural fallback; other text: Edge → Sarvam fallback',
    }), {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(req),
    })
  }

  if (url.pathname === '/api/public-settings') return handlePublicSettings(req, res)
  if (url.pathname === '/api/admin/analytics') return handleAdminAnalytics(req, res)
  if (url.pathname === '/api/admin/user-export.xlsx') return handleAdminUserExport(req, res)

  if (url.pathname === '/api/tts') return handleTts(req, res, 'auto')
  if (url.pathname === '/api/edge-tts') return handleTts(req, res, 'edge')
  if (url.pathname === '/api/sarvam-tts') return handleTts(req, res, 'sarvam')

  if (url.pathname.startsWith('/api/ads/')) {
    const handled = await handleRewardedAdRequest(req, res, url, () => readJson(req))
    if (handled !== false) return
  }

  if (url.pathname.startsWith('/api/payments/')) {
    const handled = await handlePaymentRequest(req, res, url, () => readJson(req), () => readRawBody(req))
    if (handled !== false) return
  }

  if (url.pathname.startsWith('/api/shortener/') || url.pathname.startsWith('/unlock/')) {
    const handled = await handleShortenerRequest(req, res, url, () => readJson(req))
    if (handled !== false) return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', {
      Allow: 'GET, HEAD, POST, OPTIONS',
    })
  }

    return serveStatic(req, res, url.pathname)
  } catch (error) {
    const message = String(error?.message || 'Unhandled server request error').slice(0, 300)
    console.error('[server] unhandled request error:', message)
    if (!res.headersSent) {
      return send(res, 500, JSON.stringify({ error: 'Internal server error' }), {
        'Content-Type': 'application/json; charset=utf-8',
      })
    }
    res.destroy()
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('HJ GROUPS web server listening on port ' + PORT)
})
