import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isTamilText, MAX_CHARS, synthesizeEdgeTts } from './server/edgeTts.mjs'
import { isSarvamConfigured, synthesizeSarvamTts } from './server/sarvamTts.mjs'

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

async function readJson(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 100_000) throw new Error('Request body too large')
  }
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

  if (url.pathname === '/api/tts') return handleTts(req, res, 'auto')
  if (url.pathname === '/api/edge-tts') return handleTts(req, res, 'edge')
  if (url.pathname === '/api/sarvam-tts') return handleTts(req, res, 'sarvam')

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', {
      Allow: 'GET, HEAD, POST, OPTIONS',
    })
  }

  return serveStatic(req, res, url.pathname)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('HJ GROUPS web server listening on port ' + PORT)
})
