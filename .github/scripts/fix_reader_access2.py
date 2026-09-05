from pathlib import Path

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

old = """          setEpubPage(Math.min(BOOK_FREE_PAGES, book.locations.length || BOOK_FREE_PAGES))\n          requestBookPageAccess(target, () => {})\n          return\n"""
new = """          setEpubPage(Math.min(BOOK_FREE_PAGES, book.locations.length || BOOK_FREE_PAGES))\n          requestBookPageAccess(target, () => {\n            animateReaderTurn('next', async () => {\n              await epubRenditionRef.current.display(item.href)\n              setEpubPage(target)\n              setChapterPanelOpen(false)\n            })\n          })\n          return\n"""
if old not in s:
    raise SystemExit('EPUB locked chapter unlock block missing')
s = s.replace(old, new, 1)

app.write_text(s, encoding='utf-8')
print('EPUB locked chapter unlock flow completed.')
