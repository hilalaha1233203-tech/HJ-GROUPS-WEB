from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
app = APP.read_text(encoding='utf-8')

# Never mutate the live PDF text layer or EPUB iframe while speech boundaries
# arrive. Keep the word indicator in the reader controls only.
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

# Disable the old DOM-cleanup routine too; no speech marks are created anymore.
start = app.find('  const clearReadAloudHighlight = () => {')
end = app.find('  const highlightReadAloudWord', start)
if start >= 0 and end > start:
    app = app[:start] + '''  const clearReadAloudHighlight = () => {
    // Read Aloud intentionally does not modify reader document DOM.
  }

''' + app[end:]

# Make both page-number inputs truly editable. Empty string is a valid editing
# state; falling back to the current page prevents full deletion in React.
app = app.replace(
    "value={\n                        pdfInputPage !== '' ? pdfInputPage : pdfPage\n                      }",
    "value={pdfInputPage}",
    1,
)
app = app.replace(
    "value={\n                        epubInputPage !== '' ? epubInputPage : epubPage\n                      }",
    "value={epubInputPage}",
    1,
)

# Select the complete current value whenever the user focuses the page field.
needle = 'className="reader-page-input"\n                      onChange={('
focus = 'className="reader-page-input"\n                      onFocus={(event) => event.currentTarget.select()}\n                      onChange={('
app = app.replace(needle, focus, 2)

APP.write_text(app, encoding='utf-8')
print('reader final2 applied')
