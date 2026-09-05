from pathlib import Path

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

# PDF page-number input must use the same 50-page access gate as Next.
old = """                          if (Number.isFinite(val)) {\n                            setPdfPage(\n                              clamp(\n                                val,\n                                1,\n                                pdfPages || 1\n                              )\n                            )\n                          }\n                          setPdfInputPage('')\n"""
new = """                          if (Number.isFinite(val)) {\n                            const target = clamp(val, 1, pdfPages || 1)\n                            requestBookPageAccess(target, () => {\n                              animateReaderTurn(target >= pdfPage ? 'next' : 'prev', () => setPdfPage(target))\n                            })\n                          }\n                          setPdfInputPage('')\n"""
if old in s:
    s = s.replace(old, new, 1)

old = """                        if (Number.isFinite(val)) {\n                          setPdfPage(\n                            clamp(\n                              val,\n                              1,\n                              pdfPages || 1\n                            )\n                          )\n                        }\n                        setPdfInputPage('')\n"""
new = """                        if (Number.isFinite(val)) {\n                          const target = clamp(val, 1, pdfPages || 1)\n                          requestBookPageAccess(target, () => {\n                            animateReaderTurn(target >= pdfPage ? 'next' : 'prev', () => setPdfPage(target))\n                          })\n                        }\n                        setPdfInputPage('')\n"""
if old in s:
    s = s.replace(old, new, 1)

# EPUB page-number jumps must be gated before display(cfi).
old = """      if (isReading) {\n        stopReadAloud()\n      }\n\n      pendingAutoReadRef.current =\n        false\n\n      await epubRenditionRef.current.display(\n        cfi\n      )\n\n      setEpubPage(target)\n"""
new = """      if (isReading) {\n        stopReadAloud()\n      }\n\n      pendingAutoReadRef.current = false\n\n      requestBookPageAccess(target, async () => {\n        animateReaderTurn(target >= epubPage ? 'next' : 'prev', async () => {\n          await epubRenditionRef.current.display(cfi)\n          setEpubPage(target)\n        })\n      })\n"""
if old in s:
    s = s.replace(old, new, 1)

# EPUB TOC jumps are gated after navigation resolves to a whole-book location.
old = """      try {\n        await epubRenditionRef.current.display(\n          item.href\n        )\n\n        setChapterPanelOpen(\n          false\n        )\n      } catch (error) {\n"""
new = """      try {\n        await epubRenditionRef.current.display(item.href)\n        const location = epubRenditionRef.current.currentLocation()\n        const cfi = location?.start?.cfi\n        const book = epubBookRef.current\n        const target = cfi && book?.locations?.length\n          ? book.locations.locationFromCfi(cfi) + 1\n          : epubPage\n\n        if (!canReadBookPage(target)) {\n          await epubRenditionRef.current.display(\n            book.locations.cfiFromLocation(Math.max(0, BOOK_FREE_PAGES - 1))\n          )\n          setEpubPage(Math.min(BOOK_FREE_PAGES, book.locations.length || BOOK_FREE_PAGES))\n          requestBookPageAccess(target, () => {})\n          return\n        }\n\n        animateReaderTurn(target >= epubPage ? 'next' : 'prev', () => {})\n        setChapterPanelOpen(false)\n      } catch (error) {\n"""
if old in s:
    s = s.replace(old, new, 1)

app.write_text(s, encoding='utf-8')
print('Reader access hardening patch completed.')
