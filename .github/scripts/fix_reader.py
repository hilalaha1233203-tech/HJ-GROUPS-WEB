from pathlib import Path

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

# ---------------------------------------------------------
# Reader state: 50 free pages + page-turn/highlight state
# ---------------------------------------------------------
anchor = "const [pdfPages, setPdfPages] =\n    useState(0)\n"
insert = anchor + "\n  const BOOK_FREE_PAGES = 50\n\n  const [readerPageTurn, setReaderPageTurn] =\n    useState('')\n\n  const [readAloudWord, setReadAloudWord] =\n    useState('')\n"
if 'const BOOK_FREE_PAGES = 50' not in s:
    if anchor not in s:
        raise SystemExit('reader state anchor missing')
    s = s.replace(anchor, insert, 1)

# ---------------------------------------------------------
# Word highlighting + book page access helpers
# ---------------------------------------------------------
anchor = "  /* =======================================================\n     STOP READ ALOUD\n  ======================================================= */\n"
helper = r'''  /* =======================================================
     READ ALOUD WORD HIGHLIGHT
  ======================================================= */

  const clearReadAloudHighlight = () => {
    const clearDocument = (doc) => {
      if (!doc?.querySelectorAll) return
      doc.querySelectorAll('mark.reader-speech-word').forEach((mark) => {
        const parent = mark.parentNode
        if (!parent) return
        parent.replaceChild(doc.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      })
    }

    clearDocument(document)

    const iframe = epubContainerRef.current?.querySelector('iframe')
    try {
      clearDocument(iframe?.contentDocument)
    } catch { }
  }

  const highlightReadAloudWord = (chunk, charIndex) => {
    const text = String(chunk || '')
    const index = Math.max(0, Number(charIndex) || 0)
    const wordMatch = text.slice(index).match(/[^\s.,!?;:()[\]{}"'“”‘’]+/u)
    const word = wordMatch?.[0] || ''
    if (!word) return

    setReadAloudWord(word)
    clearReadAloudHighlight()

    const highlightInDocument = (doc) => {
      if (!doc?.body) return false
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      const nodes = []
      let node
      let total = 0

      while ((node = walker.nextNode())) {
        const parent = node.parentElement
        if (!parent || parent.closest('script,style,mark.reader-speech-word')) continue
        const value = node.nodeValue || ''
        nodes.push({ node, start: total, end: total + value.length })
        total += value.length
      }

      let target = null
      let bestDistance = Infinity
      for (const item of nodes) {
        const distance = index >= item.start && index <= item.end
          ? 0
          : Math.min(Math.abs(index - item.start), Math.abs(index - item.end))
        if (distance < bestDistance) {
          bestDistance = distance
          target = item
        }
      }

      if (!target) return false

      const value = target.node.nodeValue || ''
      const localStart = Math.max(0, Math.min(value.length, index - target.start))
      const tail = value.slice(localStart)
      const exact = tail.match(/^[^\s.,!?;:()[\]{}"'“”‘’]+/u)
      if (!exact) return false

      const range = doc.createRange()
      range.setStart(target.node, localStart)
      range.setEnd(target.node, localStart + exact[0].length)
      const mark = doc.createElement('mark')
      mark.className = 'reader-speech-word'
      mark.textContent = exact[0]
      range.deleteContents()
      range.insertNode(mark)
      return true
    }

    if (readerType === 'epub') {
      const iframe = epubContainerRef.current?.querySelector('iframe')
      try {
        highlightInDocument(iframe?.contentDocument)
      } catch { }
    } else {
      highlightInDocument(document)
    }
  }

  const animateReaderTurn = (direction, callback) => {
    setReaderPageTurn(direction)
    window.setTimeout(() => {
      callback?.()
      window.setTimeout(() => setReaderPageTurn(''), 380)
    }, 30)
  }

  const getBookAccessKey = (book) =>
    book ? adsKeyFor('book', book.id) : undefined

  const canReadBookPage = (pageNumber, book = readerBook) => {
    if (!book) return false
    if (Number(pageNumber) <= BOOK_FREE_PAGES) return true
    return canAccessContent(book, getBookAccessKey(book), book.id)
  }

  const requestBookPageAccess = (pageNumber, onGranted) => {
    if (canReadBookPage(pageNumber)) {
      onGranted?.()
      return true
    }

    if (!readerBook) return false
    requestAccess(
      readerBook,
      getBookAccessKey(readerBook),
      onGranted,
      readerBook.id
    )
    return false
  }

'''
if 'const highlightReadAloudWord' not in s:
    if anchor not in s:
        raise SystemExit('read aloud stop anchor missing')
    s = s.replace(anchor, helper + anchor, 1)

# Clear current highlight when speech stops.
old = "      setReadAloudProgress(0)\n      setReadAloudLabel('')\n"
new = "      setReadAloudProgress(0)\n      setReadAloudLabel('')\n      setReadAloudWord('')\n      clearReadAloudHighlight()\n"
if old in s and "setReadAloudWord('')" not in s[s.index(old):s.index(old)+220]:
    s = s.replace(old, new, 1)

# Speech boundary drives the real word highlight.
old = """          if (\n            typeof event.charIndex ===\n            'number'\n          ) {\n            const withinChunk =\n"""
new = """          if (\n            typeof event.charIndex ===\n            'number'\n          ) {\n            highlightReadAloudWord(\n              chunk,\n              event.charIndex\n            )\n\n            const withinChunk =\n"""
if old not in s:
    raise SystemExit('speech boundary anchor missing')
s = s.replace(old, new, 1)

# Automatic page transition now respects the 50-page free allowance.
old = """                pendingAutoReadRef.current =\n                  true\n\n                setPdfPage(\n                  (\n                    current\n                  ) =>\n                    Math.min(\n                      current +\n                      1,\n                      pdfPages\n                    )\n                )\n\n                return\n"""
new = """                requestBookPageAccess(\n                  pdfPage + 1,\n                  () => {\n                    pendingAutoReadRef.current = true\n                    animateReaderTurn('next', () => {\n                      setPdfPage((current) => Math.min(current + 1, pdfPages))\n                    })\n                  }\n                )\n\n                return\n"""
if old not in s:
    raise SystemExit('PDF auto-next block missing')
s = s.replace(old, new, 1)

old = """              pendingAutoReadRef.current =\n                true\n\n              epubNext()\n"""
new = """              requestBookPageAccess(\n                epubPage + 1,\n                () => {\n                  pendingAutoReadRef.current = true\n                  animateReaderTurn('next', () => epubNext())\n                }\n              )\n"""
if old not in s:
    raise SystemExit('EPUB auto-next block missing')
s = s.replace(old, new, 1)

# Open books immediately; only pages after 50 are gated.
old = """  const startReadingBook =\n    (book) => {\n      const adsKey =\n        adsKeyFor(\n          'book',\n          book.id\n        )\n\n      requestAccess(\n        book,\n        adsKey,\n        () =>\n          openReaderForBook(\n            book\n          )\n      )\n    }\n\n  const startReadAloudForBook =\n    (book) => {\n      const adsKey =\n        adsKeyFor(\n          'book',\n          book.id\n        )\n\n      requestAccess(\n        book,\n        adsKey,\n        () =>\n          openReaderForBook(\n            book,\n            {\n              autoRead: true,\n            }\n          )\n      )\n    }\n"""
new = """  const startReadingBook =\n    (book) => {\n      if (!book) return\n      openReaderForBook(book)\n    }\n\n  const startReadAloudForBook =\n    (book) => {\n      if (!book) return\n      openReaderForBook(book, { autoRead: true })\n    }\n"""
if old not in s:
    raise SystemExit('book open access block missing')
s = s.replace(old, new, 1)

# Manual navigation + chapter jumps use the same access gate and page-turn animation.
old = """  const readerPrevious =\n    () => {\n      const wasReading =\n        isReading\n\n      if (isReading) {\n        stopReadAloud()\n      }\n\n      if (\n        readerType ===\n        'pdf'\n      ) {\n        setPdfPage(\n          (current) =>\n            Math.max(\n              1,\n              current - 1\n            )\n        )\n      } else {\n        epubPrevious()\n      }\n\n      if (wasReading) {\n        pendingAutoReadRef.current =\n          true\n      }\n    }\n\n  const readerNext =\n    () => {\n      const wasReading =\n        isReading\n\n      if (isReading) {\n        stopReadAloud()\n      }\n\n      if (\n        readerType ===\n        'pdf'\n      ) {\n        setPdfPage(\n          (current) =>\n            Math.min(\n              pdfPages ||\n              current + 1,\n              current + 1\n            )\n        )\n      } else {\n        epubNext()\n      }\n\n      if (wasReading) {\n        pendingAutoReadRef.current =\n          true\n      }\n    }\n"""
new = """  const readerPrevious =\n    () => {\n      const wasReading = isReading\n      if (isReading) stopReadAloud()\n\n      if (readerType === 'pdf') {\n        if (pdfPage <= 1) return\n        animateReaderTurn('prev', () => setPdfPage((current) => Math.max(1, current - 1)))\n      } else {\n        animateReaderTurn('prev', () => epubPrevious())\n      }\n\n      if (wasReading) pendingAutoReadRef.current = true\n    }\n\n  const readerNext =\n    () => {\n      const wasReading = isReading\n      if (isReading) stopReadAloud()\n\n      if (readerType === 'pdf') {\n        const target = Math.min(pdfPages || pdfPage + 1, pdfPage + 1)\n        if (target <= pdfPage) return\n        requestBookPageAccess(target, () => {\n          animateReaderTurn('next', () => setPdfPage(target))\n        })\n      } else {\n        requestBookPageAccess(epubPage + 1, () => {\n          animateReaderTurn('next', () => epubNext())\n        })\n      }\n\n      if (wasReading) pendingAutoReadRef.current = true\n    }\n"""
if old not in s:
    raise SystemExit('reader navigation block missing')
s = s.replace(old, new, 1)

old = """      setPdfPage(\n        item.page\n      )\n\n      setChapterPanelOpen(\n        false\n      )\n"""
new = """      requestBookPageAccess(item.page, () => {\n        animateReaderTurn(item.page >= pdfPage ? 'next' : 'prev', () => {\n          setPdfPage(item.page)\n          setChapterPanelOpen(false)\n        })\n      })\n"""
if old not in s:
    raise SystemExit('PDF chapter jump block missing')
s = s.replace(old, new, 1)

# Page-turn class on the reader body.
old = 'className="reader-body reader-body-full"'
new = 'className={`reader-body reader-body-full ${readerPageTurn ? `reader-page-turn-${readerPageTurn}` : ""}`} '
if old not in s:
    raise SystemExit('reader body class missing')
s = s.replace(old, new, 1)

# Current spoken word indicator.
old = "            <div className=\"reader-bottom\">\n"
new = "            <div className=\"reader-bottom\">\n              {readAloudWord && isReading && (\n                <div className=\"reader-word-indicator\" aria-live=\"polite\">\n                  {readAloudWord}\n                </div>\n              )}\n"
if old not in s:
    raise SystemExit('reader bottom anchor missing')
s = s.replace(old, new, 1)

# Add explicit skip controls to the read-aloud bar. Speech synthesis cannot seek
# in seconds like an audio file, so these are page/chapter-safe navigation controls
# rather than pretending to provide inaccurate time seeking.
old = """              <div className=\"reader-player\">\n                <button\n                  onClick={\n                    readerPrevious\n                  }\n                >\n                  ⏮\n                </button>\n\n                <button\n                  className=\"reader-play-button\"\n"""
new = """              <div className=\"reader-player\">\n                <button\n                  onClick={\n                    readerPrevious\n                  }\n                  title=\"Previous page / chapter\"\n                >\n                  ⏮\n                </button>\n\n                <button\n                  className=\"reader-play-button\"\n"""
if old not in s:
    raise SystemExit('reader player start missing')
s = s.replace(old, new, 1)

# Add a labeled auto-next control after the play button by replacing the existing
# next-page button only in the reader player section.
old = """                <button\n                  onClick={\n                    readerNext\n                  }\n                >\n                  ⏭\n                </button>\n\n                <div className=\"reader-progress\">\n"""
new = """                <button\n                  onClick={\n                    readerNext\n                  }\n                  title=\"Next page / chapter\"\n                >\n                  ⏭\n                </button>\n\n                <div className=\"reader-progress\">\n"""
if old not in s:
    raise SystemExit('reader player next button missing')
s = s.replace(old, new, 1)

app.write_text(s, encoding='utf-8')

# Reader styling is intentionally appended once so the existing visual language is preserved.
css = Path('src/App.css')
c = css.read_text(encoding='utf-8')
if '.reader-speech-word' not in c:
    c += r'''

/* =========================================================
   BOOK READER / READ ALOUD ENHANCEMENTS
========================================================= */
.reader-body-full {
  perspective: 1200px;
  transform-style: preserve-3d;
}

.reader-page-turn-next {
  animation: hjReaderPageNext 420ms ease both;
}

.reader-page-turn-prev {
  animation: hjReaderPagePrev 420ms ease both;
}

@keyframes hjReaderPageNext {
  0% { opacity: .78; transform: rotateY(-7deg) translateX(16px); }
  45% { opacity: .92; transform: rotateY(3deg) translateX(-5px); }
  100% { opacity: 1; transform: rotateY(0) translateX(0); }
}

@keyframes hjReaderPagePrev {
  0% { opacity: .78; transform: rotateY(7deg) translateX(-16px); }
  45% { opacity: .92; transform: rotateY(-3deg) translateX(5px); }
  100% { opacity: 1; transform: rotateY(0) translateX(0); }
}

.reader-speech-word {
  background: rgba(124, 131, 255, .38);
  color: inherit;
  border-radius: 4px;
  padding: 1px 3px;
  box-shadow: 0 0 0 1px rgba(124, 131, 255, .25), 0 2px 10px rgba(124, 131, 255, .18);
}

.reader-word-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  margin: 0 auto 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(124, 131, 255, .12);
  border: 1px solid rgba(124, 131, 255, .28);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  max-width: min(80vw, 520px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .reader-page-turn-next,
  .reader-page-turn-prev {
    animation: none;
  }
}
'''
css.write_text(c, encoding='utf-8')
print('Reader enhancement patch completed.')
