import crypto from 'node:crypto'

const DEFAULT_SPEAKER = 'ishita'
const MAX_CHARS = 3500
const ENDPOINT = 'https://api.sarvam.ai/text-to-speech/stream'

const cache =
  globalThis.__HJ_SARVAM_TTS_CACHE ||
  (globalThis.__HJ_SARVAM_TTS_CACHE = new Map())

const cleanText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value))

export const isTamilText = (text) =>
  /[\u0B80-\u0BFF]/u.test(String(text || ''))

const getApiKey = () =>
  String(
    process.env.SARVAM_API_KEY ||
    process.env.SARVAM_API_SUBSCRIPTION_KEY ||
    process.env.SARVAM_SUBSCRIPTION_KEY ||
    process.env.SARVAM_API_SUBSCRIPTION_KEY ||
    ''
  ).trim()

export const isSarvamConfigured = () => Boolean(getApiKey())

const normalizeSpeaker = (speaker) => {
  const value = String(speaker || DEFAULT_SPEAKER).trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{1,31}$/.test(value) ? value : DEFAULT_SPEAKER
}

const normalizeLanguage = (languageCode, text) => {
  const explicit = String(languageCode || '').trim()
  if (/^ta(?:[-_]IN)?$/i.test(explicit)) return 'ta-IN'
  if (/^en(?:[-_]IN)?$/i.test(explicit)) return 'en-IN'
  return isTamilText(text) ? 'ta-IN' : 'en-IN'
}

const safeJson = async (response) => {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    return {}
  }

  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return { detail: raw.slice(0, 400) }
  }
}

const requestAudio = async ({ text, languageCode, speaker, pace, temperature }) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'api-subscription-key': getApiKey(),
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        model: 'bulbul:v3',
        speaker,
        pace,
        temperature,
        output_audio_codec: 'mp3',
        output_audio_bitrate: '128k',
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const payload = await safeJson(response)
      const detail = String(
        payload?.error?.message ||
        payload?.message ||
        payload?.detail ||
        ''
      ).trim()
      const error = new Error(
        'Sarvam TTS HTTP ' + response.status + (detail ? ': ' + detail.slice(0, 300) : '')
      )
      error.statusCode = response.status
      throw error
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length) throw new Error('Sarvam TTS returned empty audio')
    return buffer
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Sarvam TTS request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function synthesizeSarvamTts({
  text,
  languageCode,
  speaker = DEFAULT_SPEAKER,
  pace = 1,
  temperature = 0.6,
}) {
  const normalizedText = cleanText(text)
  if (!normalizedText) throw new Error('text is required')
  if (!isSarvamConfigured()) throw new Error('Sarvam TTS is not configured')
  if (normalizedText.length > MAX_CHARS) {
    throw new Error('text exceeds ' + MAX_CHARS + ' characters for Sarvam streaming TTS')
  }

  const normalizedLanguage = normalizeLanguage(languageCode, normalizedText)
  const normalizedSpeaker = normalizeSpeaker(speaker)
  const normalizedPace = clamp(Number(pace) || 1, 0.5, 2)
  const normalizedTemperature = clamp(Number(temperature) || 0.6, 0.01, 1)
  const key = crypto
    .createHash('sha256')
    .update(JSON.stringify([
      normalizedText,
      normalizedLanguage,
      normalizedSpeaker,
      normalizedPace,
      normalizedTemperature,
    ]))
    .digest('hex')

  if (cache.has(key)) return cache.get(key)

  const promise = requestAudio({
    text: normalizedText,
    languageCode: normalizedLanguage,
    speaker: normalizedSpeaker,
    pace: normalizedPace,
    temperature: normalizedTemperature,
  })

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

export { DEFAULT_SPEAKER, MAX_CHARS }
