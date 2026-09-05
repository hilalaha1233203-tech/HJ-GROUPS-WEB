const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech'
const MAX_CHARS = 2500

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.SARVAM_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'Tamil TTS is not configured' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const text = String(body.text || '').replace(/\s+/g, ' ').trim()
    if (!text) return res.status(400).json({ error: 'text is required' })
    if (text.length > MAX_CHARS) return res.status(413).json({ error: `text exceeds ${MAX_CHARS} characters` })

    const languageCode = 'ta-IN'
    const speaker = String(body.speaker || 'ishita').toLowerCase()
    const pace = Math.max(0.5, Math.min(2, Number(body.pace) || 0.92))
    const temperature = Math.max(0.01, Math.min(1, Number(body.temperature) || 0.72))

    const upstream = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model: 'bulbul:v3',
        language_code: languageCode,
        speaker,
        pace,
        temperature,
        speech_sample_rate: 24000,
      }),
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: 'Sarvam TTS request failed', detail: detail.slice(0, 500) })
    }

    const payload = await upstream.json()
    const encoded = payload?.audios?.[0]
    if (!encoded) return res.status(502).json({ error: 'Sarvam returned no audio' })

    const audio = Buffer.from(encoded, 'base64')
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Content-Length', String(audio.length))
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('X-TTS-Provider', 'sarvam-bulbul-v3')
    return res.status(200).send(audio)
  } catch (error) {
    console.error('Sarvam TTS error:', error)
    return res.status(500).json({ error: 'Tamil TTS service failed' })
  }
}
