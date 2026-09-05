from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
CSS = ROOT / 'src' / 'App.css'

app = APP.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

# EPUB rendering: always size to the real reader container and use a single
# paginated iframe. Avoid stale measured dimensions during fullscreen/mobile.
app = re.sub(
    r"rendition\s*=\s*book\.renderTo\(\s*container,\s*\{.*?\}\s*\)",
    """rendition = book.renderTo(container, {
              width: '100%',
              height: '100%',
              flow: 'paginated',
              manager: 'default',
              view: 'iframe',
              spread: 'none',
            })""",
    app,
    count=1,
    flags=re.S,
)

# Remove any old UX2 block before re-inserting it so repeated Vercel builds stay idempotent.
app = re.sub(r"\n\s*/\* HJ EPUB UX2 START \*/.*?/\* HJ EPUB UX2 END \*/\n", "\n", app, flags=re.S)

ux2 = r'''\n          /* HJ EPUB UX2 START */
          const forceEpubPageStyles = (doc) => {
            if (!doc) return
            try {
              const root = doc.documentElement
              const body = doc.body
              root?.style.setProperty('background', '#ffffff', 'important')
              root?.style.setProperty('color', '#111111', 'important')
              body?.style.setProperty('background', '#ffffff', 'important')
              body?.style.setProperty('color', '#111111', 'important')
              body?.style.setProperty('margin', '0', 'important')
              body?.style.setProperty('min-height', '100%', 'important')
              body?.style.setProperty('overflow-x', 'hidden', 'important')

              let style = doc.getElementById('hj-epub-reader-override')
              if (!style) {
                style = doc.createElement('style')
                style.id = 'hj-epub-reader-override'
                style.textContent = `
                  html, html body { background:#fff !important; color:#111 !important; }
                  body { margin:0 !important; min-height:100% !important; overflow-x:hidden !important; }
                  img, svg, video { max-width:100% !important; }
                  a, a:visited { color:inherit; }
                `
                ;(doc.head || doc.documentElement).appendChild(style)
              }
            } catch { }
          }

          const attachEpubSwipe = (doc) => {
            if (!doc || doc.__hjSwipeAttached) return
            doc.__hjSwipeAttached = true
            let startX = 0
            let startY = 0
            let tracking = false

            const start = (event) => {
              const touch = event.changedTouches?.[0]
              if (!touch) return
              startX = touch.clientX
              startY = touch.clientY
              tracking = true
            }

            const end = (event) => {
              if (!tracking) return
              tracking = false
              const touch = event.changedTouches?.[0]
              if (!touch) return
              const dx = touch.clientX - startX
              const dy = touch.clientY - startY
              const ax = Math.abs(dx)
              const ay = Math.abs(dy)
              if (ax < 45 || ax < ay * 1.2) return

              if (dx < 0) {
                readerNext()
              } else {
                readerPrevious()
              }
            }

            doc.addEventListener('touchstart', start, { passive: true })
            doc.addEventListener('touchend', end, { passive: true })
            doc.addEventListener('pointerup', (event) => {
              if (event.pointerType !== 'mouse') end({ changedTouches: [{ clientX: event.clientX, clientY: event.clientY }] })
            }, { passive: true })
          }

          const applyEpubViewFix = (view) => {
            const doc = view?.document || view?.iframe?.contentDocument
            if (!doc) return
            forceEpubPageStyles(doc)
            attachEpubSwipe(doc)
          }

          rendition.on('rendered', (_section, view) => {
            applyEpubViewFix(view)
          })

          rendition.on('displayed', () => {
            const iframe = container.querySelector('iframe')
            applyEpubViewFix(iframe?.contentDocument)
          })
          /* HJ EPUB UX2 END */
'''

anchor = "          epubRenditionRef.current =\n            rendition\n"
if anchor in app:
    app = app.replace(anchor, anchor + ux2, 1)

# Use a more granular whole-book location density for reliable page jumps.
app = app.replace("book.locations\n            .generate(1600)", "book.locations\n            .generate(900)", 1)

# Page input must be truly editable. The current page is a placeholder, not a
# controlled fallback value, so Backspace can clear every digit.
app = app.replace(
    "value={\n                        pdfInputPage !== '' ? pdfInputPage : pdfPage\n                      }",
    "value={pdfInputPage}\n                      placeholder={String(pdfPage)}",
    1,
)
app = app.replace(
    "value={\n                        epubInputPage !== '' ? epubInputPage : epubPage\n                      }",
    "value={epubInputPage}\n                      placeholder={String(epubPage)}",
    1,
)

APP.write_text(app, encoding='utf-8')

# Strong, book-like page turn. The overlay represents the curling page edge while
# the content rotates slightly in 3D. It deliberately avoids the excluded neon wave.
css = re.sub(r"\n/\* HJ EPUB UX2 CSS START \*/.*?/\* HJ EPUB UX2 CSS END \*/\n", "\n", css, flags=re.S)
css += r'''

/* HJ EPUB UX2 CSS START */
.reader-body-full {
  position: relative;
  perspective: 1800px;
  perspective-origin: 50% 50%;
  overflow: auto;
  touch-action: pan-y;
  overscroll-behavior: contain;
}

.reader-body-full .epub-reader,
.reader-body-full .react-pdf__Page {
  position: relative;
  transform-style: preserve-3d;
  transform-origin: center center;
  backface-visibility: hidden;
  will-change: transform, box-shadow, filter;
}

.reader-page-turn-next .epub-reader,
.reader-page-turn-next .react-pdf__Page {
  animation: hj-real-page-next 720ms cubic-bezier(.18,.72,.16,1) both;
}

.reader-page-turn-prev .epub-reader,
.reader-page-turn-prev .react-pdf__Page {
  animation: hj-real-page-prev 720ms cubic-bezier(.18,.72,.16,1) both;
}

.reader-page-turn-next::before,
.reader-page-turn-prev::before {
  content: '';
  position: absolute;
  top: 1%;
  bottom: 1%;
  width: 54%;
  z-index: 12;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(90deg,
    rgba(255,255,255,0),
    rgba(255,255,255,.62) 48%,
    rgba(0,0,0,.20) 50%,
    rgba(255,255,255,0) 72%);
  filter: blur(.2px);
}

.reader-page-turn-next::before {
  right: -4%;
  transform-origin: right center;
  animation: hj-page-shadow-next 720ms ease both;
}

.reader-page-turn-prev::before {
  left: -4%;
  transform-origin: left center;
  animation: hj-page-shadow-prev 720ms ease both;
}

@keyframes hj-real-page-next {
  0% { transform: rotateY(0deg) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
  22% { transform: rotateY(-9deg) translateX(-7px) scale(.997); box-shadow: 20px 20px 45px rgba(0,0,0,.48); }
  52% { transform: rotateY(-15deg) translateX(-17px) scale(.985); box-shadow: 34px 22px 52px rgba(0,0,0,.55); }
  78% { transform: rotateY(-5deg) translateX(-6px) scale(.997); box-shadow: 16px 20px 42px rgba(0,0,0,.43); }
  100% { transform: rotateY(0deg) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
}

@keyframes hj-real-page-prev {
  0% { transform: rotateY(0deg) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
  22% { transform: rotateY(9deg) translateX(7px) scale(.997); box-shadow: -20px 20px 45px rgba(0,0,0,.48); }
  52% { transform: rotateY(15deg) translateX(17px) scale(.985); box-shadow: -34px 22px 52px rgba(0,0,0,.55); }
  78% { transform: rotateY(5deg) translateX(6px) scale(.997); box-shadow: -16px 20px 42px rgba(0,0,0,.43); }
  100% { transform: rotateY(0deg) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
}

@keyframes hj-page-shadow-next {
  0% { opacity:0; transform: translateX(20%) rotateY(0deg); }
  25% { opacity:.72; transform: translateX(0) rotateY(-18deg); }
  55% { opacity:.35; transform: translateX(-18%) rotateY(-42deg); }
  100% { opacity:0; transform: translateX(-45%) rotateY(-62deg); }
}

@keyframes hj-page-shadow-prev {
  0% { opacity:0; transform: translateX(-20%) rotateY(0deg); }
  25% { opacity:.72; transform: translateX(0) rotateY(18deg); }
  55% { opacity:.35; transform: translateX(18%) rotateY(42deg); }
  100% { opacity:0; transform: translateX(45%) rotateY(62deg); }
}

.reader-page-input::placeholder {
  color: #777c96;
  opacity: 1;
}

.epub-reader,
.epub-reader iframe {
  background: #fff !important;
}

@media (max-width: 700px) {
  .reader-page-turn-next .epub-reader,
  .reader-page-turn-next .react-pdf__Page,
  .reader-page-turn-prev .epub-reader,
  .reader-page-turn-prev .react-pdf__Page {
    animation-duration: 560ms;
  }
}
/* HJ EPUB UX2 CSS END */
'''
CSS.write_text(css, encoding='utf-8')
print('EPUB UX2 applied')
