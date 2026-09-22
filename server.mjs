import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 4173)
const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech'
const MAX_CHARS = 2500

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

async function handleSarvam(req, res) {
  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    })
  }

  if (req.method !== 'POST') {
    return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), {
      Allow: 'POST, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
    })
  }

  const apiKey = process.env.SARVAM_API_KEY
  if (!apiKey) {
    return send(res, 503, JSON.stringify({ error: 'Tamil TTS is not configured on this service' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }

  try {
    const body = await readJson(req)
    const text = String(body.text || '').replace(/\s+/g, ' ').trim()

    if (!text) {
      return send(res, 400, JSON.stringify({ error: 'text is required' }), {
        'Content-Type': 'application/json; charset=utf-8',
      })
    }

    if (text.length > MAX_CHARS) {
      return send(res, 413, JSON.stringify({ error: `text exceeds ${MAX_CHARS} characters` }), {
        'Content-Type': 'application/json; charset=utf-8',
      })
    }

    const speaker = String(body.speaker || 'priya').toLowerCase()
    const pace = Math.max(0.5, Math.min(2, Number(body.pace) || 0.88))
    const temperature = Math.max(0.01, Math.min(2, Number(body.temperature) || 0.6))

    const upstream = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model: 'bulbul:v3',
        language_code: 'ta-IN',
        speaker,
        pace,
        temperature,
        speech_sample_rate: 24000,
      }),
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return send(res, upstream.status, JSON.stringify({
        error: 'Sarvam TTS request failed',
        detail: detail.slice(0, 500),
      }), {
        'Content-Type': 'application/json; charset=utf-8',
      })
    }

    const payload = await upstream.json()
    const encoded = payload?.audios?.[0]

    if (!encoded) {
      return send(res, 502, JSON.stringify({ error: 'Sarvam returned no audio' }), {
        'Content-Type': 'application/json; charset=utf-8',
      })
    }

    const audio = Buffer.from(encoded, 'base64')
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': String(audio.length),
      'Cache-Control': 'private, max-age=3600',
      'X-TTS-Provider': 'sarvam-bulbul-v3',
    })
    res.end(audio)
  } catch (error) {
    console.error('Sarvam TTS error:', error)
    send(res, 500, JSON.stringify({ error: 'Tamil TTS service failed' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }
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
  } catch { }

  // SPA fallback
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
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({
      ok: true,
      service: 'hj-groups-web',
      ttsConfigured: Boolean(process.env.SARVAM_API_KEY),
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }

  if (url.pathname === '/api/sarvam-tts') {
    return handleSarvam(req, res)
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', {
      Allow: 'GET, HEAD, POST, OPTIONS',
    })
  }

  return serveStatic(req, res, url.pathname)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HJ GROUPS web server listening on port ${PORT}`)
})
