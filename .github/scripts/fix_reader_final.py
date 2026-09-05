from pathlib import Path

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

# Keep speech highlighting scoped to the actual reader instead of the whole app.
s = s.replace("    clearDocument(document)\n", "    clearDocument(readerBodyRef.current)\n", 1)
s = s.replace(
    "      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)\n",
    "      const root = doc === document ? readerBodyRef.current : doc.body\n      if (!root) return false\n      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)\n",
    1,
)

# PDF page-number input must use the 50-page gate.
old = """                          if (Number.isFinite(val)) {\n                            setPdfPage(\n                              clamp(\n                                val,\n                                1,\n                                pdfPages || 1\n                              )\n                            )\n                          }\n                          setPdfInputPage('')\n"""
new = """                          if (Number.isFinite(val)) {\n                            const target = clamp(val, 1, pdfPages || 1)\n                            requestBookPageAccess(target, () => {\n                              animateReaderTurn(target >= pdfPage ? 'next' : 'prev', () => setPdfPage(target))\n                            })\n                          }\n                          setPdfInputPage('')\n"""
if old in s:
    s = s.replace(old, new, 1)

old = """                        if (Number.isFinite(val)) {\n                          setPdfPage(\n                            clamp(\n                              val,\n                              1,\n                              pdfPages || 1\n                            )\n                          )\n                        }\n                        setPdfInputPage('')\n"""
new = """                        if (Number.isFinite(val)) {\n                          const target = clamp(val, 1, pdfPages || 1)\n                          requestBookPageAccess(target, () => {\n                            animateReaderTurn(target >= pdfPage ? 'next' : 'prev', () => setPdfPage(target))\n                          })\n                        }\n                        setPdfInputPage('')\n"""
if old in s:
    s = s.replace(old, new, 1)

# EPUB page-number jumps must be gated before display(cfi).
old = """      pendingAutoReadRef.current =\n        false\n\n      await epubRenditionRef.current.display(\n        cfi\n      )\n\n      setEpubPage(target)\n"""
new = """      pendingAutoReadRef.current = false\n\n      requestBookPageAccess(target, () => {\n        animateReaderTurn(target >= epubPage ? 'next' : 'prev', async () => {\n          await epubRenditionRef.current.display(cfi)\n          setEpubPage(target)\n        })\n      })\n"""
if old in s:
    s = s.replace(old, new, 1)

# EPUB TOC jumps: resolve the destination, enforce the page limit, and reopen the
# requested chapter after the user completes the ad/premium unlock.
old = """        await epubRenditionRef.current.display(\n          item.href\n        )\n\n        setChapterPanelOpen(\n          false\n        )\n"""
new = """        await epubRenditionRef.current.display(item.href)\n        const location = epubRenditionRef.current.currentLocation()\n        const cfi = location?.start?.cfi\n        const book = epubBookRef.current\n        const target = cfi && book?.locations?.length\n          ? book.locations.locationFromCfi(cfi) + 1\n          : epubPage\n\n        if (!canReadBookPage(target)) {\n          if (book?.locations?.length) {\n            await epubRenditionRef.current.display(\n              book.locations.cfiFromLocation(Math.max(0, BOOK_FREE_PAGES - 1))\n            )\n            setEpubPage(Math.min(BOOK_FREE_PAGES, book.locations.length))\n          }\n          requestBookPageAccess(target, () => {\n            animateReaderTurn('next', async () => {\n              await epubRenditionRef.current.display(item.href)\n              setEpubPage(target)\n              setChapterPanelOpen(false)\n            })\n          })\n          return\n        }\n\n        setChapterPanelOpen(false)\n"""
if old in s:
    s = s.replace(old, new, 1)

# React-PDF must receive a stable options object. An inline object is recreated on
# every App render, which can make react-pdf restart PDF.js loading whenever page
# state changes. Keep the PDF.js version in sync with the installed package.
worker_marker = """pdfjs.GlobalWorkerOptions.workerSrc = new URL(\n  'pdfjs-dist/build/pdf.worker.min.mjs',\n  import.meta.url\n).toString()\n"""
options_block = worker_marker + """\nconst PDF_OPTIONS = Object.freeze({\n  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,\n  cMapPacked: true,\n  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,\n})\n"""
if "const PDF_OPTIONS = Object.freeze" not in s and worker_marker in s:
    s = s.replace(worker_marker, options_block, 1)

old_options = """                      options={{\n                        cMapUrl: `https://unpkg.com/pdfjs-dist@5.4.296/cmaps/`,\n                        cMapPacked: true,\n                        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/`,\n                      }}\n"""
if old_options in s:
    s = s.replace(old_options, "                      options={PDF_OPTIONS}\n", 1)

# Add source-level diagnostics so a bad/HTML response is reported as a file error
# instead of leaving the reader in an ambiguous loading state.
needle = """          if (\n            !blob ||\n            blob.size === 0\n          ) {\n            throw new Error(\n              'The book file is empty.'\n            )\n          }\n"""
replacement = """          if (\n            !blob ||\n            blob.size === 0\n          ) {\n            throw new Error(\n              'The book file is empty.'\n            )\n          }\n\n          if (readerType === 'pdf') {\n            const header = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())\n            if (header !== '%PDF-') {\n              throw new Error('The selected file is not a valid PDF.')\n            }\n          }\n\n          if (readerType === 'epub') {\n            const headerBytes = new Uint8Array(await blob.slice(0, 2).arrayBuffer())\n            if (headerBytes[0] !== 0x50 || headerBytes[1] !== 0x4b) {\n              throw new Error('The selected file is not a valid EPUB archive.')\n            }\n          }\n"""
if needle in s and "The selected file is not a valid PDF." not in s:
    s = s.replace(needle, replacement, 1)

app.write_text(s, encoding='utf-8')
print('Final reader hardening patch completed.')