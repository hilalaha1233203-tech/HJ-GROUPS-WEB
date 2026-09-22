import WebSocket from 'ws'
import crypto from 'node:crypto'

const DEFAULT_TAMIL_VOICE = 'ta-IN-PallaviNeural'
const DEFAULT_ENGLISH_VOICE = 'en-IN-NeerjaNeural'
const MAX_CHARS = 6000

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0]
const SEC_MS_GEC_VERSION = '1-' + CHROMIUM_FULL_VERSION
const WSS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
  '?TrustedClientToken=' + TRUSTED_CLIENT_TOKEN

const cache =
  globalThis.__HJ_EDGE_TTS_CACHE ||
  (globalThis.__HJ_EDGE_TTS_CACHE = new Map())

let clockSkewSeconds = 0

const cleanText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value))

export const isTamilText = (text) =>
  /[\u0B80-\u0BFF]/u.test(String(text || ''))

const normalizeVoice = (voice, text) => {
  const fallback = isTamilText(text)
    ? DEFAULT_TAMIL_VOICE
    : DEFAULT_ENGLISH_VOICE
  const value = String(voice || '').trim()
  if (/^(ta-IN|en-IN)-[A-Za-z0-9]+Neural$/i.test(value)) return value
  return fallback
}

const rateToEdge = (rate) => {
  const numeric = clamp(Number(rate) || 1, 0.5, 2)
  return (numeric >= 1 ? '+' : '') + Math.round((numeric - 1) * 100) + '%'
}

const pitchToEdge = (pitch) => {
  const numeric = clamp(Number(pitch) || 0, -50, 50)
  return (numeric >= 0 ? '+' : '') + numeric + 'Hz'
}

const escapeXml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const toServerVoice = (shortName) => {
  const match = /^([a-z]{2})-([A-Z]{2})-(.+Neural)$/i.exec(shortName)
  if (!match) return shortName
  return 'Microsoft Server Speech Text to Speech Voice (' +
    match[1] + '-' + match[2] + ', ' + match[3] + ')'
}

const localeFromVoice = (voice) =>
  /^([a-z]{2}-[A-Z]{2})-/.exec(voice)?.[1] || 'en-US'

const connectId = () => crypto.randomUUID().replace(/-/g, '')

const dateToString = () =>
  new Date(Date.now() + clockSkewSeconds * 1000)
    .toUTCString()
    .replace('GMT', 'GMT+0000 (Coordinated Universal Time)')

const generateMuid = () =>
  crypto.randomBytes(16).toString('hex').toUpperCase()

const generateSecMsGec = () => {
  let ticks = Date.now() / 1000 + clockSkewSeconds
  ticks += 11644473600
  ticks -= ticks % 300
  ticks *= 10000000
  const source = ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN
  return crypto.createHash('sha256').update(source, 'ascii').digest('hex').toUpperCase()
}

const baseHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/' + CHROMIUM_MAJOR_VERSION +
    '.0.0.0 Safari/537.36 Edg/' + CHROMIUM_MAJOR_VERSION + '.0.0.0',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
}

const wsHeaders = {
  ...baseHeaders,
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'Sec-WebSocket-Version': '13',
  Cookie: 'muid=' + generateMuid() + ';',
}

const parseTextFrame = (buffer) => {
  const separator = buffer.indexOf('\\r\\n\\r\\n')
  const headerText = buffer.subarray(0, separator).toString('utf8')
  const body = buffer.subarray(separator + 4)
  const headers = {}
  for (const line of headerText.split('\\r\\n')) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    headers[line.slice(0, index)] = line.slice(index + 1).trim()
  }
  return { headers, body }
}

const parseBinaryFrame = (buffer) => {
  if (buffer.length < 2) throw new Error('Invalid Edge TTS binary frame')
  const headerLength = buffer.readUInt16BE(0)
  if (headerLength + 2 > buffer.length) throw new Error('Invalid Edge TTS binary header')
  const headerText = buffer.subarray(2, headerLength + 2).toString('utf8')
  const data = buffer.subarray(headerLength + 2)
  const headers = {}
  for (const line of headerText.split('\\r\\n')) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    headers[line.slice(0, index)] = line.slice(index + 1).trim()
  }
  return { headers, data }
}

const buildSsml = (voice, rate, pitch, text) => {
  const serverVoice = toServerVoice(voice)
  const locale = localeFromVoice(voice)
  return (
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' " +
    "xml:lang='" + locale + "'>" +
    "<voice name='" + escapeXml(serverVoice) + "'>" +
    "<prosody pitch='" + pitch + "' rate='" + rate + "' volume='+0%'>" +
    escapeXml(text) +
    '</prosody></voice></speak>'
  )
}

const splitText = (text, maxBytes = 4096) => {
  const chunks = []
  let remaining = String(text)
  while (Buffer.byteLength(remaining, 'utf8') > maxBytes) {
    const bytes = Buffer.from(remaining, 'utf8').subarray(0, maxBytes)
    let cut = bytes.lastIndexOf(Buffer.from(' '))
    if (cut <= 0) cut = maxBytes
    while (cut > 0 && bytes.subarray(0, cut).toString('utf8').includes('�')) cut -= 1
    chunks.push(bytes.subarray(0, cut).toString('utf8').trim())
    remaining = remaining.slice(Buffer.byteLength(bytes.subarray(0, cut).toString('utf8'), 'utf8')).trim()
  }
  if (remaining.trim()) chunks.push(remaining.trim())
  return chunks
}

const synthesizeChunk = ({ text, voice, rate, pitch }) =>
  new Promise((resolve, reject) => {
    const connectionId = connectId()
    const url =
      WSS_URL +
      '&ConnectionId=' + connectionId +
      '&Sec-MS-GEC=' + generateSecMsGec() +
      '&Sec-MS-GEC-Version=' + SEC_MS_GEC_VERSION

    const socket = new WebSocket(url, {
      headers: wsHeaders,
      perMessageDeflate: false,
      handshakeTimeout: 15000,
    })

    const audio = []
    let settled = false

    const finish = (error, value) => {
      if (settled) return
      settled = true
      try { socket.close() } catch {}
      error ? reject(error) : resolve(Buffer.concat(value || []))
    }

    socket.on('open', () => {
      socket.send(
        'X-Timestamp:' + dateToString() + '\\r\\n' +
        'Content-Type:application/json; charset=utf-8\\r\\n' +
        'Path:speech.config\\r\\n\\r\\n' +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'true',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
      )

      const requestId = connectId()
      socket.send(
        'X-RequestId:' + requestId + '\\r\\n' +
        'Content-Type:application/ssml+xml\\r\\n' +
        'X-Timestamp:' + dateToString() + 'Z\\r\\n' +
        'Path:ssml\\r\\n\\r\\n' +
        buildSsml(voice, rate, pitch, text)
      )
    })

    socket.on('message', (raw, isBinary) => {
      try {
        const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        if (!isBinary) {
          const frame = parseTextFrame(data)
          if (frame.headers.Path === 'turn.end') {
            if (audio.length) finish(null, audio)
            else finish(new Error('No audio received from Microsoft Edge TTS'))
          }
          return
        }

        const frame = parseBinaryFrame(data)
        if (frame.headers.Path !== 'audio') return
        if (frame.data.length) audio.push(frame.data)
      } catch (error) {
        finish(error)
      }
    })

    socket.on('unexpected-response', (request, response) => {
      const error = new Error('Unexpected server response: ' + response.statusCode)
      error.statusCode = response.statusCode
      error.responseHeaders = response.headers || {}
      try { response.resume() } catch {}
      finish(error)
    })

    socket.on('error', (error) => {
      if (error && typeof error === 'object') {
        error.statusCode = error.statusCode || socket._closeCode
      }
      finish(error)
    })

    socket.on('close', () => {
      if (!settled && audio.length) finish(null, audio)
    })

    const timer = setTimeout(() => {
      finish(new Error('Microsoft Edge TTS connection timed out'))
    }, 60000)

    const originalFinish = finish
    // Clear the timeout after settlement.
    // Reassigning through a wrapper keeps this implementation compatible with ws.
    void originalFinish
  })

const synthesizeWithRetry = async (args) => {
  try {
    return await synthesizeChunk(args)
  } catch (error) {
    const status = Number(error?.statusCode)
    if (status === 403) {
      const headers = error?.responseHeaders || {}
      const serverDate = headers.date || headers.Date
      if (serverDate) {
        const parsed = Date.parse(serverDate)
        if (Number.isFinite(parsed)) {
          clockSkewSeconds += (parsed / 1000) - (Date.now() / 1000)
          return synthesizeChunk(args)
        }
      }
    }
    throw error
  }
}

export async function synthesizeEdgeTts({ text, voice, rate = 1, pitch = 0 }) {
  const normalizedText = cleanText(text)
  if (!normalizedText) throw new Error('text is required')
  if (normalizedText.length > MAX_CHARS) {
    throw new Error('text exceeds ' + MAX_CHARS + ' characters')
  }

  const normalizedVoice = normalizeVoice(voice, normalizedText)
  const normalizedRate = clamp(Number(rate) || 1, 0.5, 2)
  const normalizedPitch = clamp(Number(pitch) || 0, -50, 50)
  const key = JSON.stringify([normalizedText, normalizedVoice, normalizedRate, normalizedPitch])

  if (cache.has(key)) return cache.get(key)

  const promise = (async () => {
    const chunks = splitText(normalizedText)
    const buffers = []
    for (const chunk of chunks) {
      buffers.push(await synthesizeWithRetry({
        text: chunk,
        voice: normalizedVoice,
        rate: rateToEdge(normalizedRate),
        pitch: pitchToEdge(normalizedPitch),
      }))
    }
    return Buffer.concat(buffers)
  })()

  cache.set(key, promise)
  if (cache.size > 32) {
    const oldestKey = cache.keys().next().value
    if (oldestKey && oldestKey !== key) cache.delete(oldestKey)
  }
  try {
    return await promise
  } catch (error) {
    cache.delete(key)
    throw error
  }
}

export {
  DEFAULT_TAMIL_VOICE,
  DEFAULT_ENGLISH_VOICE,
  MAX_CHARS,
  normalizeVoice,
}
