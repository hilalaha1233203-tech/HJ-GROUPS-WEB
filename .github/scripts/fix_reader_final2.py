from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
app = APP.read_text(encoding='utf-8')

# Never mutate the live PDF text layer or EPUB iframe while speech boundaries
# arrive. This is important for epub.js because changing iframe DOM during a
# speech callback can make its iframe repaint/rebuild and appear black.
start = app.find('  const highlightReadAloudWord = (chunk, charIndex) => {')
end = app.find('  const animateReaderTurn', start)
if start >= 0 and end > start:
    replacement = '''  const highlightReadAloudWord = (chunk, charIndex) => {
    const text = String(chunk || '')
    const index = Math.max(0, Number(charIndex) || 0)
    const tail = text.slice(index)
    const match = tail.match(/[^\\s.,!?;:()[\\]{}\"'“”‘’]+/u)
    setReadAloudWord(match?.[0] || '')
  }

'''
    app = app[:start] + replacement + app[end:]

start = app.find('  const clearReadAloudHighlight = () => {')
end = app.find('  const highlightReadAloudWord', start)
if start >= 0 and end > start:
    app = app[:start] + '''  const clearReadAloudHighlight = () => {
    // Intentionally no reader DOM mutation during speech.
  }

''' + app[end:]

# Page fields: show the live page when idle, but switch to a real editable
# buffer on focus. This gives both behaviours the user expects: current page is
# visible before editing, and every digit can be deleted while typing.
for page_name in ('pdf', 'epub'):
    pattern = rf"(const \[{page_name}InputPage, set{page_name.capitalize()}InputPage\] = useState\(''\))"
    replacement = rf"\1\n  const [{page_name}PageEditing, set{page_name.capitalize()}PageEditing] = useState(false)"
    app = re.sub(pattern, replacement, app, count=1)

# If the source has already been patched with an editing state, do not duplicate it.
app = re.sub(
    r"\n  const \[(pdfPage|epubPage)Editing, set(?:Pdf|Epub)PageEditing\] = useState\(false\)\n  const \[\1Editing, set(?:Pdf|Epub)PageEditing\] = useState\(false\)",
    r"\n  const [\1Editing, set\1Editing] = useState(false)",
    app,
)

# Controlled input values use the editing buffer only while focused.
app = re.sub(
    r"value=\{pdfInputPage\}",
    "value={pdfPageEditing ? pdfInputPage : String(pdfPage)}",
    app,
    count=1,
)
app = re.sub(
    r"value=\{epubInputPage\}",
    "value={epubPageEditing ? epubInputPage : String(epubPage)}",
    app,
    count=1,
)

# Replace simple select-on-focus handlers with edit-mode handlers. The current
# page is copied into the buffer and selected on the next paint, so deleting is
# genuinely possible instead of React restoring the old page immediately.
app = re.sub(
    r'className="reader-page-input"\s*\n\s*onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}',
    '''className="reader-page-input"\n                      onFocus={(event) => {\n                        setPdfPageEditing(true)\n                        setPdfInputPage(String(pdfPage))\n                        requestAnimationFrame(() => event.currentTarget.select())\n                      }}\n                      onBlur={() => {\n                        setPdfPageEditing(false)\n                        setPdfInputPage('')\n                      }}''',
    app,
    count=1,
)
app = re.sub(
    r'className="reader-page-input"\s*\n\s*onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}',
    '''className="reader-page-input"\n                      onFocus={(event) => {\n                        setEpubPageEditing(true)\n                        setEpubInputPage(String(epubPage))\n                        requestAnimationFrame(() => event.currentTarget.select())\n                      }}\n                      onBlur={() => {\n                        setEpubPageEditing(false)\n                        setEpubInputPage('')\n                      }}''',
    app,
    count=1,
)

# Keep the initial input buffer empty when opening a new document.
app = app.replace("      setPdfPage(1)\n      setPdfPages(0)", "      setPdfPage(1)\n      setPdfInputPage('')\n      setPdfPageEditing(false)\n      setPdfPages(0)", 1)
app = app.replace("      setEpubPage(1)\n      setEpubPages(0)", "      setEpubPage(1)\n      setEpubInputPage('')\n      setEpubPageEditing(false)\n      setEpubPages(0)", 1)

APP.write_text(app, encoding='utf-8')
print('reader final2 applied')
