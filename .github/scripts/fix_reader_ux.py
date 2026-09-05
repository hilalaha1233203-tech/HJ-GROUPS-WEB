from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
CSS = ROOT / 'src' / 'App.css'
app = APP.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

# Tamil Read Aloud: prefer a real Tamil voice, split into shorter natural
# phrases, and use a calmer rate. Browser Web Speech quality ultimately depends
# on the Tamil voice installed by the device/browser.
app = app.replace(
"  const speechRunRef = useRef(0)\n\n  const pendingAutoReadRef = useRef(false)",
"  const speechRunRef = useRef(0)\n  const speechVoiceRef = useRef(null)\n\n  const pendingAutoReadRef = useRef(false)",1)

voice_effect = """  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined

    const chooseVoice = () => {
      const voices = window.speechSynthesis.getVoices() || []
      const tamilVoices = voices.filter((voice) => /^(ta)(?:[-_]|$)/i.test(String(voice.lang || '')))
      const tamilIndia = tamilVoices.find((voice) => /^(ta)(?:[-_]IN)/i.test(String(voice.lang || '')))
      speechVoiceRef.current = tamilIndia || tamilVoices.find((voice) => voice.localService) || tamilVoices[0] || null
    }

    chooseVoice()
    window.speechSynthesis.addEventListener?.('voiceschanged', chooseVoice)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', chooseVoice)
  }, [])

"""
anchor = "  const sleepTimerRef = useRef(null)\n\n"
if voice_effect not in app and anchor in app:
    app = app.replace(anchor, anchor + voice_effect, 1)

# Sarvam Bulbul v3 is used for Tamil narration when the secure Vercel proxy is
# configured. The Web Speech API remains the fallback for devices without the
# server-side TTS key. This keeps the API key out of the browser bundle.
sarvam_bridge = r'''const installSarvamTamilSpeechBridge = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis || window.__hjSarvamSpeechBridge) return () => {}

  const synthesis = window.speechSynthesis
  const originalSpeak = synthesis.speak.bind(synthesis)
  const originalCancel = synthesis.cancel.bind(synthesis)
  const originalPause = synthesis.pause?.bind(synthesis)
  const originalResume = synthesis.resume?.bind(synthesis)
  let activeAudio = null
  let run = 0
  const cache = new Map()

  const isTamil = (text) => /[\u0B80-\u0BFF]/u.test(String(text || ''))

  const getAudio = async (text, token) => {
    const key = text.trim()
    if (cache.has(key)) return cache.get(key)
    const promise = fetch('/api/sarvam-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: key,
        language_code: 'ta-IN',
        model: 'bulbul:v3',
        speaker: 'ishita',
        pace: 0.92,
      }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Sarvam TTS ${response.status}`)
      return response.blob()
    })
    cache.set(key, promise)
    try { return await promise } catch (error) { cache.delete(key); throw error }
  }

  const stopAudio = () => {
    run += 1
    if (activeAudio) {
      try { activeAudio.pause() } catch {}
      try { activeAudio.currentTime = 0 } catch {}
      activeAudio = null
    }
  }

  synthesis.speak = (utterance) => {
    const text = String(utterance?.text || '').trim()
    if (!text || !isTamil(text)) {
      originalSpeak(utterance)
      return
    }

    const token = ++run
    try { utterance.onstart?.(new Event('start')) } catch {}

    getAudio(text, token).then((blob) => {
      if (token !== run) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      activeAudio = audio
      audio.volume = Number.isFinite(utterance.volume) ? utterance.volume : 1
      audio.playbackRate = Math.max(0.75, Math.min(1.15, Number(utterance.rate) || 1))
      audio.onended = () => {
        if (token !== run) return
        activeAudio = null
        URL.revokeObjectURL(url)
        try { utterance.onend?.(new Event('end')) } catch {}
      }
      audio.onerror = () => {
        if (token !== run) return
        activeAudio = null
        URL.revokeObjectURL(url)
        try { utterance.onerror?.(new Event('error')) } catch {}
      }
      return audio.play()
    }).catch(() => {
      if (token !== run) return
      try { utterance.onerror?.(new Event('error')) } catch {}
    })
  }

  synthesis.cancel = () => {
    stopAudio()
    try { originalCancel() } catch {}
  }
  synthesis.pause = () => {
    if (activeAudio) { try { activeAudio.pause() } catch {} }
    try { originalPause?.() } catch {}
  }
  synthesis.resume = () => {
    if (activeAudio) { try { activeAudio.play() } catch {} }
    try { originalResume?.() } catch {}
  }

  window.__hjSarvamSpeechBridge = true
  return () => {
    stopAudio()
    synthesis.speak = originalSpeak
    synthesis.cancel = originalCancel
    if (originalPause) synthesis.pause = originalPause
    if (originalResume) synthesis.resume = originalResume
    for (const promise of cache.values()) promise.then(() => {}).catch(() => {})
    cache.clear()
    delete window.__hjSarvamSpeechBridge
  }
}
'''
if 'installSarvamTamilSpeechBridge' not in app:
    app = app.replace('function App() {', sarvam_bridge + '\nfunction App() {', 1)

bridge_effect = """  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    return installSarvamTamilSpeechBridge()
  }, [])

"""
if bridge_effect not in app and voice_effect and anchor in app:
    app = app.replace(anchor + voice_effect, anchor + bridge_effect + voice_effect, 1)

app = app.replace("const chunkTextForSpeech = (text, maxLength = 700) => {", "const chunkTextForSpeech = (text, maxLength = 240) => {", 1)
app = app.replace("          700\n        )", "          240\n        )", 1)
app = app.replace(
"cleaned.match(/[^.!?。！？]+[.!?。！？]?/g)",
"cleaned.match(/[^.!?。！？;:，,]+[.!?。！？;:，,]?/gu)",
1,
)

old = """      const utterance =\n        new SpeechSynthesisUtterance(\n          chunk\n        )\n\n      utterance.rate = speed\n      utterance.volume =\n        volume\n"""
new = """      const utterance =\n        new SpeechSynthesisUtterance(\n          chunk\n        )\n\n      const hasTamil = /[\\u0B80-\\u0BFF]/u.test(chunk)\n      const voices = window.speechSynthesis.getVoices?.() || []\n      const tamilVoice = voices.find((item) => /^(ta)(?:[-_]|$)/i.test(String(item.lang || '')))\n      const indianEnglish = voices.find((item) => /^en[-_]IN(?:[-_]|$)/i.test(String(item.lang || '')))\n      utterance.lang = hasTamil ? 'ta-IN' : 'en-IN'\n      utterance.voice = hasTamil ? (tamilVoice || speechVoiceRef.current || null) : (indianEnglish || speechVoiceRef.current || null)\n      utterance.rate = hasTamil ? Math.min(Math.max(speed, 0.75), 0.98) : Math.min(Math.max(speed, 0.8), 1.1)\n      utterance.pitch = 1\n      utterance.volume =\n        volume\n"""
if old in app:
    app = app.replace(old, new, 1)

APP.write_text(app, encoding='utf-8')

# Keep reader controls and book-turn styling stable; the runtime enhancement
# supplies the actual physical page curl.
if 'REAL BOOK PAGE TURN + SWIPE' not in css:
    css += r'''

/* Reader surface remains a quiet paper-like canvas; no neon wave effects. */
.reader-body-full .epub-reader,
.reader-body-full .react-pdf__Page { backface-visibility: visible; transform-style: preserve-3d; }
'''
CSS.write_text(css, encoding='utf-8')
print('reader UX hardening applied')
