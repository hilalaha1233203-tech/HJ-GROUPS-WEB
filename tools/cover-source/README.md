# Existing cover source files (manual input)

This folder is intentionally not populated from production Storage by CI. Place the downloaded `story-covers` bucket files here preserving their relative object paths, for example:

```text
tools/cover-source/
  stories/
    1788411106863-file_0000000014e882068f423cd2bef840db.png
    ...
```

The current production database contained 13 objects / 12.95 MiB in `story-covers`. Download only that bucket. Do not download the separate `audio` bucket as part of this task and do not delete any source object.

After all 13 objects are present, run:

```powershell
py -m pip install --user Pillow
py scripts/optimize-covers.py
```

The script writes hashed WebP variants to `public/covers/`, and generates both `src/lib/cover-manifest.json` and `public/cover-manifest.json`. Review the output and keep the generated files in the Phase 5U branch/PR. Do not commit the original source images in this folder.
