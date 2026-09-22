import {
  DEFAULT_TAMIL_VOICE,
  DEFAULT_ENGLISH_VOICE,
  MAX_CHARS,
  isTamilText,
  synthesizeEdgeTts,
} from '../server/edgeTts.mjs'

const requestCounts = globalThis.__HJ_EDGE_TTS_REQUESTS || (globalThis.__HJ_EDGE_TTS_REQUESTS = new Map())
const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 600

function sendJson(res, status, body) {
  res.status(status).json(body)
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || String(req.headers['x-real-ip'] || 'unknown')
}

function allowed(req) {
  const now = Date.now()

  for (const [key, value] of requestCounts) {
    if (now - value.startedAt >= WINDOW_MS) requestCounts.delete(key)
  }

  const key = clientKey(req)
  const previous = requestCounts.get(key)

  if (!previous || now - previous.startedAt >= WINDOW_MS) {
    requestCounts.set(key, { startedAt: now, count: 1 })
    return true
  }

  if (previous.count >= MAX_REQUESTS_PER_WINDOW) return false
  previous.count += 1
  return true
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  if (!allowed(req)) {
    return sendJson(res, 429, { error: 'Too many TTS requests. Please try again shortly.' })
  }

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {})

    const text = String(body.text || '').replace(/\s+/g, ' ').trim()

    if (!text) return sendJson(res, 400, { error: 'text is required' })

    if (text.length > MAX_CHARS) {
      return sendJson(res, 413, { error: 'text exceeds ' + MAX_CHARS + ' characters' })
    }

    const tamil = isTamilText(text)
    const voice = String(
      body.voice || (tamil ? DEFAULT_TAMIL_VOICE : DEFAULT_ENGLISH_VOICE)
    ).trim()

    const audio = await synthesizeEdgeTts({
      text,
      voice,
      rate: body.rate,
      pitch: body.pitch,
    })

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', String(audio.length))
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    res.setHeader('X-TTS-Provider', 'microsoft-edge-neural')
    return res.end(audio)
  } catch (error) {
    console.error('Edge TTS error:', error)
    const message = String(error?.message || 'Edge TTS request failed')
    const status =
      /text is required/i.test(message) ? 400 :
      /text exceeds/i.test(message) ? 413 :
      502
    return sendJson(res, status, {
      error: 'Microsoft Edge Neural TTS request failed',
      detail: message.slice(0, 300),
    })
  }
}
