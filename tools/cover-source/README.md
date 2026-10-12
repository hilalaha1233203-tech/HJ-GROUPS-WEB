# Existing cover source files — Phase 5U

The existing Supabase objects must be copied locally before the script can create the static WebP assets and non-empty manifest. The script does not call Supabase, does not write the production database, and does not delete any source object.

## Download only the cover bucket

1. Open Supabase Dashboard: https://supabase.com/dashboard/project/yajkfglagnyvenddyvok/storage/buckets
2. Choose **Storage → Files → story-covers → stories**.
3. Download each of these 13 files individually, preserving the exact filenames and the `stories/` folder:
- `1788411106863-file_0000000014e882068f423cd2bef840db.png`
- `1788586464860-6217308045835357343.jpg`
- `1789997726308-6217308045835357343.jpg`
- `1789997771808-6217308045835357343.jpg`
- `1789998931387-6217308045835357343.jpg`
- `1789999579655-6217308045835357343.jpg`
- `1789999694248-6217308045835357343.jpg`
- `1790000595773-6217308045835357343.jpg`
- `1790836907383-8283a78b-0be0-4a14-b379-d8a549491564.jfif`
- `1790866658189-Epic-Fantasy-Warriors_-75M-Plays.png`
- `1790951665948-Cinematic-King_-H7-Groups-Boss-Poster.png`
- `1790951925575-Mythic-Cobra-Fortress-Heroes.png`
- `1790952513979-Warrior-of-the-Golden-Battlefield.png`
4. Save files under `tools/cover-source/stories/` in this repo. Do **not** download the `audio` bucket (2 files / 44.18 MiB); only download the `story-covers` bucket (13 objects / 12.95 MiB according to a read-only query on 2026-10-12).
5. Keep originals local only. `.gitignore` excludes downloaded source images from commits.

If the dashboard download fails, use the bucket file list and retry after the Supabase quota restriction is resolved. Do not disable policy checks or copy any service-role secret into the browser.

## Check top-20 object sizes (read-only SQL)

In the same project, open **SQL Editor → New query** and run:

```sql
select
  bucket_id,
  name,
  metadata->>'mimetype' as mime_type,
  (metadata->>'size')::bigint as bytes,
  round((metadata->>'size')::numeric / 1024 / 1024, 3) as mib,
  created_at,
  updated_at
from storage.objects
where bucket_id = 'story-covers'
order by coalesce((metadata->>'size')::bigint, 0) desc
limit 20;
```

This is a read-only SELECT. Do not run INSERT, UPDATE, DELETE, or Storage removal commands for this task.

## Inspect hotlinking / bot traffic

1. Open **Logs → Logs Explorer** in the same Supabase project.
2. Choose the API Gateway / Edge logs source (`edge_logs`) and set the last 24 hours. Look for `/storage/v1/object/public/story-covers/`.
3. If the fields are available in your project's log schema, run:

```sql
select
  timestamp,
  log_attributes['request.method'] as method,
  log_attributes['request.path'] as path,
  log_attributes['response.status_code'] as status,
  log_attributes['request.headers.referer'] as referer,
  log_attributes['request.headers.user_agent'] as user_agent,
  event_message
from logs
where source = 'edge_logs'
  and (
    positionCaseInsensitive(toString(log_attributes['request.path']), '/storage/v1/object') > 0
    or positionCaseInsensitive(event_message, 'story-covers') > 0
  )
order by timestamp desc
limit 100;
```

Filter the returned rows by story-covers, group Referer / User-Agent, status and path. Missing request-header fields or zero matching rows only means those events were not visible in the queried log source/time range; it does not prove no image traffic occurred. Storage internal logs may not carry browser Referer/User-Agent values.

## Generate optimized WebP assets and manifests

From PowerShell at the repo root:

```powershell
py -m pip install --user Pillow
py scripts/optimize-covers.py
```

The script refuses to write anything unless all 13 expected object files are present. It creates hashed 400px thumbnails (target ≤80 KiB) and 800px images (target ≤2 MiB), preserving aspect ratio and transparency, then updates both `src/lib/cover-manifest.json` and `public/cover-manifest.json`. Review the exact per-file input/output byte report. If an image cannot meet a size target, the script exits with an error instead of claiming an optimization.

Commit only generated `public/covers/*.webp` and both manifest files to the Phase 5U branch. Do not commit the downloaded source images.
