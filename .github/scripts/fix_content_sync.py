from pathlib import Path

# Canonical Telegram/Supabase persistence is maintained directly in the source.
# The previous patcher could overwrite newer schema-compatible fixes after pushes.
for required in ("src/App.jsx", "src/AdminPanel.jsx"):
    if not Path(required).is_file():
        raise SystemExit(f"Missing required source file: {required}")

print("Content sync patcher: no source mutation required.")
