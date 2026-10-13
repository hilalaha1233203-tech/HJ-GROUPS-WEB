# Existing cover source files — Phase 5U

The current HJ story catalog has four active stories whose cover originals are already available locally. The generator processes only these four known cover files; it does not call Supabase, write the production database, or delete any source object. A prior read-only bucket inventory reported 13 objects, but the other nine are not required for this four-story batch and must remain untouched.

## Use the four active story covers

The Supabase organization reported that it had used up its quota on 2026-10-13; Storage and public object requests returned HTTP 402. Do not keep retrying those downloads. The owner confirmed that only four stories have been added and these four source files are already present locally.

1. Keep the four files under `tools/cover-source/stories/` with these exact filenames:
- `1790866658189-Epic-Fantasy-Warriors_-75M-Plays.png`
- `1790951665948-Cinematic-King_-H7-Groups-Boss-Poster.png`
- `1790951925575-Mythic-Cobra-Fortress-Heroes.png`
- `1790952513979-Warrior-of-the-Golden-Battlefield.png`
2. Do not download the `audio` bucket. Do not delete or modify any Supabase Storage object. The previous 13-object inventory is not the scope of this four-active-story conversion.
3. Keep originals local only. `.gitignore` excludes downloaded source images from commits.

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

The script refuses to write anything unless all four active cover files are present. It creates eight hashed WebP assets: a 400px thumbnail (target ≤80 KiB) and an 800px image (target ≤2 MiB) for each cover, preserving aspect ratio and transparency. It updates both `src/lib/cover-manifest.json` and `public/cover-manifest.json`. Review the exact per-file input/output byte report. If an image cannot meet a size target, the script exits with an error instead of claiming an optimization.

Commit only generated `public/covers/*.webp` and both manifest files to the Phase 5U branch. Do not commit the downloaded source images.

## Runtime URL safety policy

The runtime must use the hashed static WebP manifest for all known existing story covers. A manifest entry may retain its original public `story-covers` URL only in its `originalUrl` fallback field (and the corresponding original-URL lookup key); it must never put that URL in `src` or `srcSet`. The offline generator deliberately creates that fallback metadata and does not fetch Supabase itself.

The sole remaining `wsrv.nl` reference in runtime source is a compatibility parser in `src/lib/coverAssets.js`: it unwraps an already-saved proxy URL to its original URL. The application no longer creates or requests new wsrv.nl transformation URLs. CI checks this allowlist and fails if the old transformation URL is reintroduced elsewhere.

Audio playback follows the Cloudflare streaming Worker URL when an episode has a Telegram message ID. If an audio episode has no Worker URL, the frontend does not fall back to a Supabase Storage object URL; that item needs a verified Cloudflare route rather than another Storage download.
