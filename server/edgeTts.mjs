const DEFAULT_TAMIL_VOICE = 'ta-IN-PallaviNeural'
const DEFAULT_ENGLISH_VOICE = 'en-IN-NeerjaNeural'
const MAX_CHARS = 6000

const cache = globalThis.__HJ_EDGE_TTS_CACHE || (globalThis.__HJ_EDGE_TTS_CACHE = new Map())

const cleanText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value))

const isTamilText = (text) => /[\u0B80-\u0BFF]/u.test(String(text || ''))

const normalizeVoice = (voice, text) => {
  const fallback = isTamilText(text)
    ? DEFAULT_TAMIL_VOICE
    : DEFAULT_ENGLISH_VOICE

  const value = String(voice || '').trim()
  if (/^(ta-IN|en-IN)-[A-Za-z0-9]+Neural$/i.test(value)) return value
  if (/^ta-IN-/i.test(value) || /^en-IN-/i.test(value)) return value
  return fallback
}

const rateToEdge = (rate) => {
  const numeric = clamp(Number(rate) || 1, 0.5, 2)
  const percent = Math.round((numeric - 1) * 100)
  return (percent >= 0 ? '+' : '') + percent + '%'
}

const pitchToEdge = (pitch) => {
  const numeric = clamp(Number(pitch) || 0, -50, 50)
  return (numeric >= 0 ? '+' : '') + numeric + 'Hz'
}

const cacheGetOrCreate = async (key, factory) => {
  if (cache.has(key)) return cache.get(key)
  const promise = Promise.resolve().then(factory)
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

  return cacheGetOrCreate(key, async () => {
    const { generateSpeech } = await import('@bestcodes/edge-tts/dist/index.mjs')
    const audio = await generateSpeech({
      text: normalizedText,
      voice: normalizedVoice,
      rate: rateToEdge(normalizedRate),
      pitch: pitchToEdge(normalizedPitch),
    })
    if (!audio) throw new Error('Edge TTS returned no audio')
    return Buffer.isBuffer(audio) ? audio : Buffer.from(audio)
  })
}

export { DEFAULT_TAMIL_VOICE, DEFAULT_ENGLISH_VOICE, MAX_CHARS, isTamilText, normalizeVoice }
