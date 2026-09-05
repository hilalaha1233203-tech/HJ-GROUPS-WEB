const STYLE_ID = 'hj-reader-runtime-enhancements'

function injectReaderStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .reader-body-full {
      perspective: 1800px !important;
      perspective-origin: center center !important;
      touch-action: pan-y !important;
      overscroll-behavior: contain !important;
    }

    .reader-body-full .epub-reader,
    .reader-body-full .react-pdf__Page {
      transform-style: preserve-3d !important;
      transform-origin: center center !important;
      backface-visibility: hidden !important;
      will-change: transform, box-shadow, filter !important;
    }

    .reader-page-turn-next .epub-reader,
    .reader-page-turn-next .react-pdf__Page {
      animation: hjRuntimePageNext 720ms cubic-bezier(.18,.72,.16,1) both !important;
    }

    .reader-page-turn-prev .epub-reader,
    .reader-page-turn-prev .react-pdf__Page {
      animation: hjRuntimePagePrev 720ms cubic-bezier(.18,.72,.16,1) both !important;
    }

    .reader-page-turn-next::before,
    .reader-page-turn-prev::before {
      content: '' !important;
      position: absolute !important;
      top: 1% !important;
      bottom: 1% !important;
      width: 58% !important;
      z-index: 15 !important;
      pointer-events: none !important;
      opacity: 0 !important;
      border-radius: 2px !important;
      background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.78) 45%, rgba(0,0,0,.22) 50%, rgba(255,255,255,0) 72%) !important;
    }

    .reader-page-turn-next::before {
      right: -5% !important;
      transform-origin: right center !important;
      animation: hjRuntimeCurlNext 720ms ease both !important;
    }

    .reader-page-turn-prev::before {
      left: -5% !important;
      transform-origin: left center !important;
      animation: hjRuntimeCurlPrev 720ms ease both !important;
    }

    .reader-page-input::placeholder {
      color: #777c96 !important;
      opacity: 1 !important;
    }

    @keyframes hjRuntimePageNext {
      0% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
      25% { transform: rotateY(-10deg) translateX(-8px) scale(.997); box-shadow: 20px 20px 48px rgba(0,0,0,.48); }
      55% { transform: rotateY(-17deg) translateX(-20px) scale(.982); box-shadow: 38px 22px 58px rgba(0,0,0,.56); }
      80% { transform: rotateY(-5deg) translateX(-7px) scale(.997); box-shadow: 15px 20px 43px rgba(0,0,0,.43); }
      100% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
    }

    @keyframes hjRuntimePagePrev {
      0% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
      25% { transform: rotateY(10deg) translateX(8px) scale(.997); box-shadow: -20px 20px 48px rgba(0,0,0,.48); }
      55% { transform: rotateY(17deg) translateX(20px) scale(.982); box-shadow: -38px 22px 58px rgba(0,0,0,.56); }
      80% { transform: rotateY(5deg) translateX(7px) scale(.997); box-shadow: -15px 20px 43px rgba(0,0,0,.43); }
      100% { transform: rotateY(0) translateX(0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.38); }
    }

    @keyframes hjRuntimeCurlNext {
      0% { opacity:0; transform: translateX(24%) rotateY(0); }
      22% { opacity:.8; transform: translateX(0) rotateY(-18deg); }
      55% { opacity:.38; transform: translateX(-22%) rotateY(-46deg); }
      100% { opacity:0; transform: translateX(-48%) rotateY(-68deg); }
    }

    @keyframes hjRuntimeCurlPrev {
      0% { opacity:0; transform: translateX(-24%) rotateY(0); }
      22% { opacity:.8; transform: translateX(0) rotateY(18deg); }
      55% { opacity:.38; transform: translateX(22%) rotateY(46deg); }
      100% { opacity:0; transform: translateX(48%) rotateY(68deg); }
    }

    .epub-reader,
    .epub-reader iframe {
      background: #fff !important;
    }
  `
  document.head.appendChild(style)
}

function forceEpubDocument(doc) {
  if (!doc) return

  try {
    doc.documentElement?.style.setProperty('background-color', '#ffffff', 'important')
    doc.documentElement?.style.setProperty('color', '#111111', 'important')
    doc.body?.style.setProperty('background-color', '#ffffff', 'important')
    doc.body?.style.setProperty('color', '#111111', 'important')
    doc.body?.style.setProperty('margin', '0', 'important')
    doc.body?.style.setProperty('min-height', '100%', 'important')
    doc.body?.style.setProperty('overflow-x', 'hidden', 'important')

    let style = doc.getElementById('hj-epub-force-light-runtime')
    if (!style) {
      style = doc.createElement('style')
      style.id = 'hj-epub-force-light-runtime'
      style.textContent = `
        html, html body { background:#fff !important; color:#111 !important; }
        body { margin:0 !important; min-height:100% !important; overflow-x:hidden !important; }
        img, svg, video { max-width:100% !important; }
      `
      ;(doc.head || doc.documentElement).appendChild(style)
    }
  } catch { }
}

function clickReaderNavigation(direction) {
  const navigation = document.querySelector('.reader-navigation')
  if (!navigation) return
  const buttons = navigation.querySelectorAll(':scope > button')
  if (direction === 'next') buttons[buttons.length - 1]?.click()
  else buttons[0]?.click()
}

function attachSwipe(doc) {
  if (!doc || doc.__hjRuntimeSwipeAttached) return
  doc.__hjRuntimeSwipeAttached = true

  let startX = 0
  let startY = 0
  let active = false

  doc.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches?.[0]
    if (!touch) return
    startX = touch.clientX
    startY = touch.clientY
    active = true
  }, { passive: true })

  doc.addEventListener('touchend', (event) => {
    if (!active) return
    active = false
    const touch = event.changedTouches?.[0]
    if (!touch) return
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    const horizontal = Math.abs(dx)
    const vertical = Math.abs(dy)
    if (horizontal < 45 || horizontal < vertical * 1.2) return
    clickReaderNavigation(dx < 0 ? 'next' : 'prev')
  }, { passive: true })
}

function fixEpubIframes() {
  document.querySelectorAll('.epub-reader iframe').forEach((iframe) => {
    const apply = () => {
      try {
        const doc = iframe.contentDocument
        forceEpubDocument(doc)
        attachSwipe(doc)
      } catch { }
    }
    apply()
    iframe.addEventListener('load', apply, { passive: true })
  })
}

function fixPageInputs() {
  document.querySelectorAll('.reader-page-input').forEach((input) => {
    if (input.__hjInputFix) return
    input.__hjInputFix = true
    input.addEventListener('focus', () => {
      if (input.value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
  })
}

function initReaderEnhancements() {
  injectReaderStyles()
  fixEpubIframes()
  fixPageInputs()

  const observer = new MutationObserver(() => {
    fixEpubIframes()
    fixPageInputs()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReaderEnhancements, { once: true })
  } else {
    initReaderEnhancements()
  }
}
