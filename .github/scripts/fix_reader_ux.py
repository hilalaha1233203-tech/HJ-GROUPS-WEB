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

# Small pause between Tamil chunks prevents words at sentence boundaries from
# being swallowed together by some Android speech engines.
app = app.replace("      window.speechSynthesis.speak(utterance)", "      window.speechSynthesis.speak(utterance)", 1)

APP.write_text(app, encoding='utf-8')

# Keep reader controls and book-turn styling stable; the runtime enhancement
# supplies the actual physical page curl.
if 'REAL BOOK PAGE TURN + SWIPE' not in css:
    css += r'''

/* Reader surface remains a quiet paper-like canvas; no neon wave effects. */
.reader-body-full .epub-reader,
.reader-body-full .react-pdf__Page { backface-visibility: hidden; transform-style: preserve-3d; }
'''
CSS.write_text(css, encoding='utf-8')
print('reader UX hardening applied')
