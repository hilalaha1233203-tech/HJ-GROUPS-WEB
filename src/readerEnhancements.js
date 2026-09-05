const STYLE_ID = 'hj-reader-runtime-enhancements'

function injectReaderStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .reader-body-full {
      perspective: 2200px !important;
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

    /* Slow, pronounced 3D turn. The runtime class is independent of the app's short animation class. */
    .reader-body-full.hj-runtime-page-flip-next .epub-reader,
    .reader-body-full.hj-runtime-page-flip-next .react-pdf__Page {
      animation: hjRealBookNext 900ms cubic-bezier(.22,.61,.36,1) both !important;
    }

    .reader-body-full.hj-runtime-page-flip-prev .epub-reader,
    .reader-body-full.hj-runtime-page-flip-prev .react-pdf__Page {
      animation: hjRealBookPrev 900ms cubic-bezier(.22,.61,.36,1) both !important;
    }

    .reader-body-full.hj-runtime-page-flip-next::after,
    .reader-body-full.hj-runtime-page-flip-prev::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      bottom: 0 !important;
      width: 50% !important;
      z-index: 30 !important;
      pointer-events: none !important;
      opacity: 0 !important;
      background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.68) 48%, rgba(0,0,0,.28) 52%, rgba(255,255,255,0) 100%) !important;
      filter: blur(.2px) !important;
    }

    .reader-body-full.hj-runtime-page-flip-next::after {
      right: 0 !important;
      transform-origin: right center !important;
      animation: hjRealCurlNext 900ms cubic-bezier(.22,.61,.36,1) both !important;
    }

    .reader-body-full.hj-runtime-page-flip-prev::after {
      left: 0 !important;
      transform-origin: left center !important;
      animation: hjRealCurlPrev 900ms cubic-bezier(.22,.61,.36,1) both !important;
    }

    /* Keep the existing app animation from making the turn feel like a quick card flip. */
    .reader-page-turn-next .epub-reader,
    .reader-page-turn-next .react-pdf__Page {
      animation: hjRuntimePageNext 900ms cubic-bezier(.22,.61,.36,1) both !important;
    }

    .reader-page-turn-prev .epub-reader,
    .reader-page-turn-prev .react-pdf__Page {
      animation: hjRuntimePagePrev 900ms cubic-bezier(.22,.61,.36,1) both !important;
    }

    .reader-page-input::placeholder {
      color: #777c96 !important;
      opacity: 1 !important;
    }

    @keyframes hjRealBookNext {
      0% { transform: rotateY(0deg) translate3d(0,0,0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.28); filter: brightness(1); }
      16% { transform: rotateY(-8deg) translate3d(-3px,0,0) scale(.999); box-shadow: 12px 20px 48px rgba(0,0,0,.36); }
      42% { transform: rotateY(-42deg) translate3d(-18px,0,0) scale(.992); box-shadow: 42px 24px 65px rgba(0,0,0,.52); filter: brightness(.93); }
      62% { transform: rotateY(-72deg) translate3d(-31px,0,0) scale(.982); box-shadow: 62px 26px 75px rgba(0,0,0,.58); filter: brightness(.84); }
      78% { transform: rotateY(-24deg) translate3d(-10px,0,0) scale(.996); box-shadow: 26px 21px 55px rgba(0,0,0,.42); filter: brightness(.98); }
      92% { transform: rotateY(3deg) translate3d(2px,0,0) scale(1.001); box-shadow: -5px 18px 48px rgba(0,0,0,.30); filter: brightness(1.01); }
      100% { transform: rotateY(0deg) translate3d(0,0,0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.28); filter: brightness(1); }
    }

    @keyframes hjRealBookPrev {
      0% { transform: rotateY(0deg) translate3d(0,0,0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.28); filter: brightness(1); }
      16% { transform: rotateY(8deg) translate3d(3px,0,0) scale(.999); box-shadow: -12px 20px 48px rgba(0,0,0,.36); }
      42% { transform: rotateY(42deg) translate3d(18px,0,0) scale(.992); box-shadow: -42px 24px 65px rgba(0,0,0,.52); filter: brightness(.93); }
      62% { transform: rotateY(72deg) translate3d(31px,0,0) scale(.982); box-shadow: -62px 26px 75px rgba(0,0,0,.58); filter: brightness(.84); }
      78% { transform: rotateY(24deg) translate3d(10px,0,0) scale(.996); box-shadow: -26px 21px 55px rgba(0,0,0,.42); filter: brightness(.98); }
      92% { transform: rotateY(-3deg) translate3d(-2px,0,0) scale(1.001); box-shadow: 5px 18px 48px rgba(0,0,0,.30); filter: brightness(1.01); }
      100% { transform: rotateY(0deg) translate3d(0,0,0) scale(1); box-shadow: 0 18px 50px rgba(0,0,0,.28); filter: brightness(1); }
    }

    @keyframes hjRealCurlNext {
      0% { opacity:0; transform: rotateY(0deg) translateX(0); }
      15% { opacity:.15; transform: rotateY(-12deg) translateX(0); }
      40% { opacity:.72; transform: rotateY(-48deg) translateX(-12%); }
      62% { opacity:.48; transform: rotateY(-78deg) translateX(-28%); }
      82% { opacity:.12; transform: rotateY(-105deg) translateX(-46%); }
      100% { opacity:0; transform: rotateY(-118deg) translateX(-58%); }
    }

    @keyframes hjRealCurlPrev {
      0% { opacity:0; transform: rotateY(0deg) translateX(0); }
      15% { opacity:.15; transform: rotateY(12deg) translateX(0); }
      40% { opacity:.72; transform: rotateY(48deg) translateX(12%); }
      62% { opacity:.48; transform: rotateY(78deg) translateX(28%); }
      82% { opacity:.12; transform: rotateY(105deg) translateX(46%); }
      100% { opacity:0; transform: rotateY(118deg) translateX(58%); }
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
        body, body * { color:#111 !important; }
        body * { background-color:transparent !important; }
        img, svg, video { max-width:100% !important; background-color:transparent !important; }
      `
      ;(doc.head || doc.documentElement).appendChild(style)
    }
  } catch { }
}

function animateReaderTurn(direction) {
  const reader = document.querySelector('.reader-body-full')
  if (!reader) return

  reader.classList.remove('hj-runtime-page-flip-next', 'hj-runtime-page-flip-prev')
  void reader.offsetWidth
  reader.classList.add(direction === 'next' ? 'hj-runtime-page-flip-next' : 'hj-runtime-page-flip-prev')

  window.clearTimeout(reader.__hjTurnTimer)
  reader.__hjTurnTimer = window.setTimeout(() => {
    reader.classList.remove('hj-runtime-page-flip-next', 'hj-runtime-page-flip-prev')
  }, 940)
}

function clickReaderNavigation(direction) {
  animateReaderTurn(direction)
  const navigation = document.querySelector('.reader-navigation')
  if (!navigation) return
  const buttons = navigation.querySelectorAll(':scope > button')
  if (direction === 'next') buttons[buttons.length - 1]?.click()
  else buttons[0]?.click()
}

function attachNavigationAnimation() {
  const reader = document.querySelector('.reader-body-full')
  if (!reader || reader.__hjNavigationAnimationAttached) return
  reader.__hjNavigationAnimationAttached = true

  reader.addEventListener('click', (event) => {
    const button = event.target.closest('.reader-navigation > button')
    if (!button) return
    const buttons = reader.querySelectorAll('.reader-navigation > button')
    const direction = button === buttons[buttons.length - 1] ? 'next' : 'prev'
    animateReaderTurn(direction)
  }, true)
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
    if (iframe.__hjRuntimeFixAttached) return
    iframe.__hjRuntimeFixAttached = true

    const apply = () => {
      try {
        const doc = iframe.contentDocument
        forceEpubDocument(doc)
        attachSwipe(doc)
      } catch { }
    }

    apply()
    iframe.addEventListener('load', apply)
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
  attachNavigationAnimation()

  const observer = new MutationObserver(() => {
    fixEpubIframes()
    fixPageInputs()
    attachNavigationAnimation()
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
