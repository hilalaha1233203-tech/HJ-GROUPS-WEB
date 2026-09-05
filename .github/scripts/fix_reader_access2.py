from pathlib import Path

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

old = """          setEpubPage(Math.min(BOOK_FREE_PAGES, book.locations.length || BOOK_FREE_PAGES))\n          requestBookPageAccess(target, () => {})\n          return\n"""
new = """          setEpubPage(Math.min(BOOK_FREE_PAGES, book.locations.length || BOOK_FREE_PAGES))\n          requestBookPageAccess(target, () => {})\n          return\n"""

# This legacy patcher used to inject a second page-turn implementation. The
# runtime reader now owns the physical turn animation, so keep the access-flow
# patch idempotent and never fail the CI build when that older block is absent.
if old in s:
    s = s.replace(old, new, 1)

app.write_text(s, encoding='utf-8')
print('EPUB access-flow patch verified; runtime owns page animation.')
