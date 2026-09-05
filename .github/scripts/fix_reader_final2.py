from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'

app = APP.read_text(encoding='utf-8')

# -----------------------------------------------------------------------------
# Read Aloud: never mutate the live PDF text layer or the EPUB iframe DOM while
# speech boundaries arrive. DOM surgery there can force epub.js/react-pdf to
# rebuild/repaint and is a common cause of a black reader during narration.
# Keep the visible word indicator in the reader controls, but leave document
# content untouched.
# -----------------------------------------------------------------------------
pattern = re.compile(
    r"  const highlightReadAloudWord = \(chunk, charIndex\) => \{.*?\n  \}\n\n  const animateReaderTurn",
    re.S,
)
replacement = """  const highlightReadAloudWord = (chunk, charIndex) => {
    const text = String(chunk || '')
    const index = Math.max(0, Number(charIndex) || 0)
    const tail = text.slice(index)
    const match = tail.match(/[^\\s.,!?;:()[\\]{}\\\"'“”‘’]+/u)
    setReadAloudWord(match?.[0] || '')
  }

  const animateReaderTurn"""
app, count = pattern.subn(replacement, app, count=1)

# The old cleanup routine can also mutate a live EPUB iframe. With the safe
# indicator above there are no speech marks to clean, so make cleanup inert.
pattern_clear = re.compile(
    r"  const clearReadAloudHighlight = \(\) => \{.*?\n  \}\n\n  const highlightReadAloudWord",
    re.S,
)
replacement_clear = """  const clearReadAloudHighlight = () => {
    // Read Aloud intentionally does not modify reader document DOM.
  }

  const highlightReadAloudWord"""
app, clear_count = pattern_clear.subn(replacement_clear, app, count=1)

# -----------------------------------------------------------------------------
# Page number inputs: make them genuinely editable. The previous fallback
# `input || currentPage` made React immediately put the old page number back
# whenever the user deleted the value. A controlled empty string is the correct
# representation while editing.
# -----------------------------------------------------------------------------
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

# Select the complete existing number on focus, making Backspace/Delete behave
# naturally on mobile and desktop.
app = app.replace(
    "className=\"reader-page-input\"\n                      onChange={(",
    "className=\"reader-page-input\"\n                      onFocus={(event) => event.currentTarget.select()}\n                      onChange={(",
    1,
)
app = app.replace(
    "className=\"reader-page-input\"\n                      onChange={(",
    "className=\"reader-page-input\"\n                      onFocus={(event) => event.currentTarget.select()}\n                      onChange={(",
    1,
)

# Keep page state stable when a user is typing: never force the current page
# back into an empty input from the runtime enhancement layer.
APP.write_text(app, encoding='utf-8')
print(f'reader final2 applied: highlight={count}, clear={clear_count}')
