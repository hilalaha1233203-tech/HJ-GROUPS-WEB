from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
CSS = ROOT / 'src' / 'App.css'

app = APP.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

# Normalize the EPUB render configuration regardless of earlier reader patches.
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

# Replace the page input fallback with a real editable field. The current page
# is shown as a placeholder, so Backspace can remove every digit.
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

# Remove a previous copy of this block so the build patch is idempotent.
app = re.sub(
    r"\n\s*/\* HJ EPUB UX3 START \*/.*?/\* HJ EPUB UX3 END \*/\n",
    "\n",
    app,
    flags=re.S,
)

ux3 = """
          /* HJ EPUB UX3 START */
          const forceEpubDocument = (doc) => {
            if (!doc) return
            try {
              const root = doc.documentElement
              const body = doc.body
              root?.style.setProperty('background-color', '#ffffff', 'important')
              root?.style.setProperty('color', '#111111', 'important')
              body?.style.setProperty('background-color', '#ffffff', 'important')
              body?.style.setProperty('color', '#111111', 'important')
              body?.style.setProperty('margin', '0', 'important')
              body?.style.setProperty('min-height', '100%', 'important')
              body?.style.setProperty('overflow-x', 'hidden', 'important')

              let style = doc.getElementById('hj-epub-force-light')
              if (!style) {
                style = doc.createElement('style')
                style.id = 'hj-epub-force-light'
                style.textContent = `
                  html, html body { background:#fff !important; color:#111 !important; }
                  body { margin:0 !important; min-height:100% !important; overflow-x:hidden !important; }
                  body * { background-color:transparent; }
                  img, svg, video { max-width:100% !important; }
                `
                ;(doc.head || doc.documentElement).appendChild(style)
              }
            } catch { }
          }

          const attachEpubTouchSwipe = (doc) => {
            if (!doc || doc.__hjReaderSwipe) return
            doc.__hjReaderSwipe = true
            let startX = 0
            let startY = 0
            let active = false

            const onStart = (event) => {
              const touch = event.changedTouches?.[0]
              if (!touch) return
              startX = touch.clientX
              startY = touch.clientY
              active = true
            }

            const onEnd = (event) => {
              if (!active) return
              active = false
              const touch = event.changedTouches?.[0]
              if (!touch) return
              const dx = touch.clientX - startX
              const dy = touch.clientY - startY
              const horizontal = Math.abs(dx)
              const vertical = Math.abs(dy)
              if (horizontal < 45 || horizontal < vertical * 1.2) return
              if (dx < 0) readerNext()
              else readerPrevious()
            }

            doc.addEventListener('touchstart', onStart, { passive: true })
            doc.addEventListener('touchend', onEnd, { passive: true })
          }

          const fixRenderedEpubView = (view) => {
            const doc = view?.document || view?.iframe?.contentDocument
            if (!doc) return
            forceEpubDocument(doc)
            attachEpubTouchSwipe(doc)
          }

          rendition.on('rendered', (_section, view) => {
            fixRenderedEpubView(view)
          })

          rendition.on('displayed', () => {
            const iframe = container.querySelector('iframe')
            fixRenderedEpubView(iframe?.contentDocument)
          })
          /* HJ EPUB UX3 END */
"""

anchor = "          epubRenditionRef.current =\n            rendition\n"
if anchor in app:
    app = app.replace(anchor, anchor + ux3, 1)

# Whole-book locations are used by the Page N jump control.
app = app.replace("book.locations\n            .generate(1600)", "book.locations\n            .generate(900)", 1)

APP.write_text(app, encoding='utf-8')

css = re.sub(
    r"\n/\* HJ EPUB UX3 CSS START \*/.*?/\* HJ EPUB UX3 CSS END \*/\n",
    "\n",
    css,
    flags=re.S,
)

css += """

/* HJ EPUB UX3 CSS START */
.reader-body-full {
  position: relative;
  perspective: 1800px;
  perspective-origin: center center;
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
  animation: hj-real-book-next 720ms cubic-bezier(.18,.72,.16,1) both;
}

.reader-page-turn-prev .epub-reader,
.reader-page-turn-prev .react-pdf__Page {
  animation: hj-real-book-prev 720ms cubic-bezier(.18,.72,.16,1) both;
}

.reader-page-turn-next::before,
.reader-page-turn-prev::before {
  content: '';
  position: absolute;
  top: 1%;
  bottom: 1%;
  width: 58%;
  z-index: 15;
  pointer-events: none;
  opacity: 0;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.78) 45%, rgba(0,0,0,.22) 50%, rgba(255,255,255,0) 72%);
}

.reader-page-turn-next::before {
  right: -5%;
  transform-origin: right center;
  animation: hj-curl-next 720ms ease both;
}

.reader-page-turn-prev::before {
  left: -5%;
  transform-origin: left center;
  animation: hj-curl-prev 720ms ease both;
}

@keyframes hj-real-book-next {
  0% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
  25% { transform: rotateY(-10deg) translateX(-8px) scale(.997); box-shadow: 20px 20px 48px rgba(0,0,0,.48); }
  55% { transform: rotateY(-17deg) translateX(-20px) scale(.982); box-shadow: 38px 22px 58px rgba(0,0,0,.56); }
  80% { transform: rotateY(-5deg) translateX(-7px) scale(.997); box-shadow: 15px 20px 43px rgba(0,0,0,.43); }
  100% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
}

@keyframes hj-real-book-prev {
  0% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
  25% { transform: rotateY(10deg) translateX(8px) scale(.997); box-shadow: -20px 20px 48px rgba(0,0,0,.48); }
  55% { transform: rotateY(17deg) translateX(20px) scale(.982); box-shadow: -38px 22px 58px rgba(0,0,0,.56); }
  80% { transform: rotateY(5deg) translateX(7px) scale(.997); box-shadow: -15px 20px 43px rgba(0,0,0,.43); }
  100% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
}

@keyframes hj-curl-next {
  0% { opacity:0; transform: translateX(24%) rotateY(0); }
  22% { opacity:.8; transform: translateX(0) rotateY(-18deg); }
  55% { opacity:.38; transform: translateX(-22%) rotateY(-46deg); }
  100% { opacity:0; transform: translateX(-48%) rotateY(-68deg); }
}

@keyframes hj-curl-prev {
  0% { opacity:0; transform: translateX(-24%) rotateY(0); }
  22% { opacity:.8; transform: translateX(0) rotateY(18deg); }
  55% { opacity:.38; transform: translateX(22%) rotateY(46deg); }
  100% { opacity:0; transform: translateX(48%) rotateY(68deg); }
}

.epub-reader,
.epub-reader iframe {
  background: #fff !important;
}

.reader-page-input::placeholder {
  color: #777c96;
  opacity: 1;
}

@media (max-width: 700px) {
  .reader-page-turn-next .epub-reader,
  .reader-page-turn-next .react-pdf__Page,
  .reader-page-turn-prev .epub-reader,
  .reader-page-turn-prev .react-pdf__Page {
    animation-duration: 560ms;
  }
}
/* HJ EPUB UX3 CSS END */
"""

CSS.write_text(css, encoding='utf-8')
print('EPUB UX3 applied')
