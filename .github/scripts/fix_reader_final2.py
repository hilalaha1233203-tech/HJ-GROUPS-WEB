from pathlib import Path

# Reader controls and lifecycle handling are maintained directly in App.jsx.
# This legacy patcher is intentionally validation-only so it cannot reintroduce
# React SyntheticEvent.currentTarget access after the event has returned.
app = Path('src/App.jsx')
if not app.is_file():
    raise SystemExit('Missing src/App.jsx')

print('Reader final2 patcher: source is canonical; no mutation required.')
