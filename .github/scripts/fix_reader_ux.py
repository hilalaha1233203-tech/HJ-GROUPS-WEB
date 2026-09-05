from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
CSS = ROOT / 'src' / 'App.css'

app = APP.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

# -----------------------------------------------------------------------------
# Tamil Read Aloud: prefer a real Tamil system voice and use shorter, natural
# sentence chunks. Web Speech uses the device/browser voices; selecting ta-IN is
# the most important improvement available without a paid TTS service.
# -----------------------------------------------------------------------------
app = app.replace(
"  const speechRunRef = useRef(0)\n\n  const pendingAutoReadRef = useRef(false)",
"  const speechRunRef = useRef(0)\n  const speechVoiceRef = useRef(null)\n\n  const pendingAutoReadRef = useRef(false)",
1,
)

voice_effect = """  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined

    const chooseVoice = () => {
      const voices = window.speechSynthesis.getVoices() || []
      const tamil = voices.find((voice) => /^ta(?:-|$)/i.test(String(voice.lang || '')))
      const indianEnglish = voices.find((voice) => /^en-IN(?:-|$)/i.test(String(voice.lang || '')))
      speechVoiceRef.current = tamil || indianEnglish || voices[0] || null
    }

    chooseVoice()
    window.speechSynthesis.addEventListener?.('voiceschanged', chooseVoice)

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', chooseVoice)
    }
  }, [])

"""
anchor = "  const sleepTimerRef = useRef(null)\n\n"
if voice_effect not in app and anchor in app:
    app = app.replace(anchor, anchor + voice_effect, 1)

app = app.replace("const chunkTextForSpeech = (text, maxLength = 700) => {", "const chunkTextForSpeech = (text, maxLength = 420) => {", 1)
app = app.replace("          700\n        )", "          420\n        )", 1)

old_utterance = """      const utterance =
        new SpeechSynthesisUtterance(
          chunk
        )

      utterance.rate = speed
      utterance.volume =
        volume
"""
new_utterance = """      const utterance =
        new SpeechSynthesisUtterance(
          chunk
        )

      const hasTamil = /[\\u0B80-\\u0BFF]/u.test(chunk)
      const voices = window.speechSynthesis.getVoices?.() || []
      const voice = hasTamil
        ? voices.find((item) => /^ta(?:-|$)/i.test(String(item.lang || '')))
        : voices.find((item) => /^en-IN(?:-|$)/i.test(String(item.lang || ''))) ||
          voices.find((item) => /^en(?:-|$)/i.test(String(item.lang || '')))

      utterance.lang = hasTamil ? 'ta-IN' : 'en-IN'
      utterance.voice = voice || speechVoiceRef.current || null
      utterance.rate = hasTamil ? Math.min(speed, 1.15) : speed
      utterance.pitch = hasTamil ? 1 : 1
      utterance.volume =
        volume
"""
if old_utterance in app:
    app = app.replace(old_utterance, new_utterance, 1)

# -----------------------------------------------------------------------------
# EPUB: make the rendition fill its real container, force a light reading page,
# inject swipe handling inside the EPUB iframe, and make pagination stable.
# -----------------------------------------------------------------------------
old_render = """          const width =
            Math.max(
              container.clientWidth ||
              1,
              1
            )

          const height =
            Math.max(
              container.clientHeight ||
              1,
              1
            )

          rendition =
            book.renderTo(
              container,
              {
                width,
                height,
                flow:
                  'paginated',
                manager:
                  'default',
              }
            )
"""
new_render = """          const width = Math.max(container.clientWidth || 1, 1)
          const height = Math.max(container.clientHeight || 1, 1)

          rendition =
            book.renderTo(
              container,
              {
                width: '100%',
                height: '100%',
                flow: 'paginated',
                manager: 'default',
                view: 'iframe',
                spread: 'none',
              }
            )
"""
if old_render in app:
    app = app.replace(old_render, new_render, 1)

hook = """          rendition.on(
            'relocated',
"""
content_hook = """          // Keep EPUB pages readable even when the source EPUB ships with
          // dark/transparent body styles. Also make the actual EPUB iframe
          // respond to the same left/right swipe gestures as the PDF reader.
          rendition.hooks.content.register((contents) => {
            const doc = contents?.document
            const root = doc?.documentElement
            const body = doc?.body
            if (!doc || !root) return

            root.style.background = '#ffffff'
            root.style.color = '#111111'
            if (body) {
              body.style.background = '#ffffff'
              body.style.color = '#111111'
              body.style.margin = '0'
              body.style.minHeight = '100%'
            }

            let startX = 0
            let startY = 0

            const onTouchStart = (event) => {
              const touch = event.changedTouches?.[0]
              if (!touch) return
              startX = touch.clientX
              startY = touch.clientY
            }

            const onTouchEnd = (event) => {
              const touch = event.changedTouches?.[0]
              if (!touch) return
              const dx = touch.clientX - startX
              const dy = touch.clientY - startY
              const distance = Math.abs(dx)
              const vertical = Math.abs(dy)
              if (distance < 55 || distance < vertical * 1.25) return
              if (dx < 0) {
                readerNext()
              } else {
                readerPrevious()
              }
            }

            root.addEventListener('touchstart', onTouchStart, { passive: true })
            root.addEventListener('touchend', onTouchEnd, { passive: true })

            contents.__hjCleanupSwipe = () => {
              root.removeEventListener('touchstart', onTouchStart)
              root.removeEventListener('touchend', onTouchEnd)
            }

            try {
              contents.addStylesheetRules({
                'html': { background: '#ffffff !important', color: '#111111 !important' },
                'body': { background: '#ffffff !important', color: '#111111 !important', 'margin': '0 !important' },
                'img': { 'max-width': '100%', 'height': 'auto' },
              })
            } catch { }
          })

          rendition.themes.default({
            body: {
              background: '#ffffff !important',
              color: '#111111 !important',
              margin: '0 !important',
            },
          })

"""
if content_hook not in app and hook in app:
    app = app.replace(hook, content_hook + hook, 1)

# Use more granular, whole-book CFI locations so page jump has useful targets.
app = app.replace("book.locations\n            .generate(1600)", "book.locations\n            .generate(900)", 1)

# -----------------------------------------------------------------------------
# Reader gesture layer for PDF and the surrounding EPUB viewport. EPUB itself
# also receives touch events through the hook above because iframe events do not
# bubble into the parent document.
# -----------------------------------------------------------------------------
gesture_effect = """  useEffect(() => {
    if (!readerOpen || !readerBodyRef.current) return undefined

    const element = readerBodyRef.current
    let startX = 0
    let startY = 0
    let active = false

    const onPointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      active = true
      startX = event.clientX
      startY = event.clientY
    }

    const onPointerUp = (event) => {
      if (!active) return
      active = false
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      const distance = Math.abs(dx)
      const vertical = Math.abs(dy)
      if (distance < 70 || distance < vertical * 1.25) return

      if (dx < 0) {
        readerNext()
      } else {
        readerPrevious()
      }
    }

    element.addEventListener('pointerdown', onPointerDown, { passive: true })
    element.addEventListener('pointerup', onPointerUp, { passive: true })

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointerup', onPointerUp)
    }
  }, [readerOpen, readerType, pdfPage, epubPage, epubReady, pdfPages, epubPages])

"""
anchor2 = "  /* =======================================================\n     EPUB NEXT / PREVIOUS\n  ======================================================= */\n"
if gesture_effect not in app and anchor2 in app:
    app = app.replace(anchor2, gesture_effect + anchor2, 1)

# Reset page input values whenever a new book opens.
app = app.replace("      setPdfPage(1)\n      setPdfPages(0)", "      setPdfPage(1)\n      setPdfInputPage('')\n      setPdfPages(0)", 1)
app = app.replace("      setEpubPage(1)\n      setEpubPages(0)", "      setEpubPage(1)\n      setEpubInputPage('')\n      setEpubPages(0)", 1)

# Remove noisy production debug logs that were left from media debugging.
app = re.sub(r"\n\s*console\.log\(\"SELECTED EPISODE\", currentEpisode\);", "", app)
app = re.sub(r"\n\s*console\.log\(\"FINAL AUDIO SRC\", currentEpisode\?\.src\);", "", app)
app = re.sub(r"\n\s*console\.log\('AUDIO SRC', currentEpisode\?\.src\);", "", app)
app = re.sub(r"\n\s*console\.log\('AUDIO ELEMENT SRC', audioRef\.current\?\.src\);", "", app)
app = re.sub(r"\n\s*console\.log\('FINAL STORIES STATE', stories\);", "", app)
app = re.sub(r"\n\s*console\.log\(\"APP RECEIVED STORIES:\", data\.stories\.length\);", "", app)
app = re.sub(r"\n\s*console\.log\('FETCHED STORIES IN APP:', data\.stories\);", "", app)

APP.write_text(app, encoding='utf-8')

# -----------------------------------------------------------------------------
# Realistic page-turn visual: a restrained 3D curl/shadow rather than a neon
# effect. It applies to both PDF canvas and EPUB iframe container.
# -----------------------------------------------------------------------------
css_add = r'''

/* =========================================================
   REAL BOOK PAGE TURN + SWIPE
========================================================= */

.reader-body-full {
  position: relative;
  perspective: 1400px;
  touch-action: pan-y;
  overscroll-behavior: contain;
  user-select: none;
}

.reader-body-full .react-pdf__Page,
.reader-body-full .epub-reader {
  transform-style: preserve-3d;
  will-change: transform, filter;
  backface-visibility: hidden;
}

.reader-page-turn-next .react-pdf__Page,
.reader-page-turn-next .epub-reader {
  animation: hj-page-turn-next 430ms cubic-bezier(.2,.7,.2,1);
}

.reader-page-turn-prev .react-pdf__Page,
.reader-page-turn-prev .epub-reader {
  animation: hj-page-turn-prev 430ms cubic-bezier(.2,.7,.2,1);
}

@keyframes hj-page-turn-next {
  0% {
    transform: perspective(1400px) rotateY(0deg) translateX(0) scale(1);
    filter: drop-shadow(0 18px 45px rgba(0,0,0,.35));
  }
  38% {
    transform: perspective(1400px) rotateY(-7deg) translateX(-12px) scale(.992);
    filter: drop-shadow(18px 22px 42px rgba(0,0,0,.46));
  }
  100% {
    transform: perspective(1400px) rotateY(0deg) translateX(0) scale(1);
    filter: drop-shadow(0 18px 45px rgba(0,0,0,.35));
  }
}

@keyframes hj-page-turn-prev {
  0% {
    transform: perspective(1400px) rotateY(0deg) translateX(0) scale(1);
    filter: drop-shadow(0 18px 45px rgba(0,0,0,.35));
  }
  38% {
    transform: perspective(1400px) rotateY(7deg) translateX(12px) scale(.992);
    filter: drop-shadow(-18px 22px 42px rgba(0,0,0,.46));
  }
  100% {
    transform: perspective(1400px) rotateY(0deg) translateX(0) scale(1);
    filter: drop-shadow(0 18px 45px rgba(0,0,0,.35));
  }
}

.reader-body-full::before,
.reader-body-full::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 24px;
  pointer-events: none;
  z-index: 5;
}

.reader-body-full::before {
  left: 0;
  background: linear-gradient(90deg, rgba(0,0,0,.18), transparent);
}

.reader-body-full::after {
  right: 0;
  background: linear-gradient(270deg, rgba(0,0,0,.18), transparent);
}

@media (max-width: 700px) {
  .reader-body {
    padding: 10px;
  }

  .epub-reader {
    width: 100%;
    border-radius: 4px;
  }

  .reader-page-turn-next .react-pdf__Page,
  .reader-page-turn-next .epub-reader,
  .reader-page-turn-prev .react-pdf__Page,
  .reader-page-turn-prev .epub-reader {
    animation-duration: 360ms;
  }
}
'''
if 'REAL BOOK PAGE TURN + SWIPE' not in css:
    css += css_add

CSS.write_text(css, encoding='utf-8')
print('reader UX hardening applied')
