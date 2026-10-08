# HJ GROUPS — Migration Status / Read-Only Audit

Audit date: 2026-10-08
Audit scope: HJ-GROUPS-WEB, HJ-Telegram-Streaming, HJ-GROUPS-OF-FILES
Audit mode: READ-ONLY
Production behavior changed in this phase: NO
Migration performed in this phase: NO
950-episode bulk migration/compression performed: NO
Telegram originals deleted: NO
Telegram session regenerated: NO
Episode Analytics changed: NO

## Audit snapshot

Repository main branches audited:
- HJ-GROUPS-WEB: 95e0d181e2c34ef3a17b6e31d168af101a52d275
- HJ-Telegram-Streaming: b8dc7076bfa88be9802b3900aff10e37cf5e218b
- HJ-GROUPS-OF-FILES: 7b4dfe2a20cbaf06431fca8409fd817df179c509

Important deployment drift was found between GitHub source and the Cloudflare control-plane state. The deployed streaming Worker contains R2 + Durable Object + listener code that is not present in the HJ-Telegram-Streaming main branch. The deployed HJ Groups web backend Worker is currently a bootstrap response and is not the server.mjs implementation from GitHub.

## 1. Current architecture

### HJ GROUPS Web

Current repository architecture:
Browser -> Cloudflare Pages static site -> Pages Functions -> HJ_WEB_BACKEND_URL -> Node server runtime (server.mjs).

The repository contains:
- root Dockerfile based on node:22-slim
- server.mjs listening on port 4173
- server-side modules for access, shortener, ads, payments, VIP, Web Push, TTS, analytics and admin APIs
- cloudflare-backend configured with @cloudflare/containers
- Functions proxy that forwards /api, /unlock and /health to HJ_WEB_BACKEND_URL

The Cloudflare Pages project is connected to GitHub HJ-GROUPS-WEB, production branch main, and currently uses:
- HJ_WEB_BACKEND_URL
- VITE_STREAMING_SERVER_URL
- VITE_SUPABASE_URL

The latest Pages production deployment is commit 95e0d181e2c34ef3a17b6e31d168af101a52d275.

### HJ Telegram Streaming

Repository main contains:
- Cloudflare Worker source under cloudflare-worker/
- R2 binding declaration for MEDIA_CACHE
- Durable Object declaration for MEDIA_LISTENER
- Bot API streaming implementation
- legacy Node/Express + teleproto server.js
- Render deployment config render.yaml

Actual deployed Cloudflare Worker currently contains additional R2 cache and MediaListener logic that is absent from the repository main branch.

### HJ GROUPS OF FILES

Current architecture includes:
- Telegram bot application
- Pyrogram/TgCrypto
- Supabase metadata/indexing
- GitHub Actions maintenance
- compression_runner.py using FFmpeg/Ghostscript
- telegram_media_index
- Dockerfile and Procfile for the legacy bot runtime

The website streaming Worker currently depends directly on telegram_media_index from this repository's Supabase data. Therefore HJ GROUPS OF FILES is currently a request-time data dependency of the website streaming path, which violates the final target architecture.

## 2. Target architecture

HJ GROUPS Web
-> Cloudflare Pages
-> Cloudflare Worker / Pages Functions
-> Supabase + Cloudflare R2 + Telegram Bot API

Streaming:
Browser
-> Cloudflare Streaming Worker
-> access control
-> R2 cache lookup
   -> HIT: stream from R2
   -> MISS: resolve verified Telegram source -> retrieve from Telegram Bot API -> write temporary R2 cache -> stream

Listener lifecycle:
player starts
-> listener/start
-> heartbeat approximately every 20 seconds
-> player pause/end/unmount
-> listener/end
-> lease expiry protection
-> cleanup evaluation
-> delete R2 object only when no listener is active

HJ GROUPS OF FILES:
- not a website runtime dependency
- compression remains independently usable
- maintenance should be private/manual through GitHub Actions
- no always-on Node runtime is required for website or streaming
- no Docker/container deployment is required for the target

## 3. Completed components

The following components are implemented somewhere in the current system, but several are not yet synchronized with repository source:

1. Cloudflare Pages project exists and is GitHub-connected.
2. Cloudflare streaming Worker exists in production.
3. Production streaming Worker has an R2 bucket binding named MEDIA_CACHE for hj-groups-media.
4. Production streaming Worker has a Durable Object namespace named MediaListener.
5. Production streaming Worker has /listener/start, /listener/heartbeat and /listener/end routes.
6. Website App.jsx already contains listener lifecycle code and a 20-second heartbeat.
7. Media access control exists for free, Premium, VIP and Ads policies.
8. Secure media tickets exist with HMAC signing, expiry and user-agent binding.
9. Range-request streaming exists.
10. R2 cache write/read/delete logic exists in the deployed streaming Worker.
11. HJ GROUPS OF FILES has independent GitHub Actions compression capability.
12. Supabase schemas and migrations already contain the access-control, payment, shortener, ad-unlock, VIP, analytics and Telegram identity foundations.

Status qualification:
- Implemented in production control-plane: yes for several streaming pieces.
- Reconciled into GitHub source of truth: no.
- Fully matching target architecture: no.

## 4. Pending components

### Critical

1. Reconcile deployed streaming Worker source with HJ-Telegram-Streaming main.
2. Remove the HJ Web container backend dependency.
3. Move required HJ Web backend APIs from Node-only server.mjs execution into Workers/Pages Functions without changing business rules unnecessarily.
4. Remove HJ GROUPS OF FILES request-time dependency from streaming.
5. Create a safe, verified media mapping owned by the website/streaming architecture. Do not invent Telegram file_id values.
6. Do not assume telegram_message_id can be converted to file_id by changing URLs.
7. Implement the exact R2 cache-first order: check R2 before any Telegram Bot API getFile request.
8. Implement the exact listener cleanup policy requested by the target. Current deployed code uses 45-second leases and a 15-minute grace window; it is not the exact requested 10-minute cleanup behavior.
9. Ensure cache deletion checks the specific media's listeners and never deletes while any valid listener lease is active.
10. Migrate all required secrets from legacy/backend storage to the final Cloudflare runtime locations.
11. Preserve Episode Analytics and its database functions exactly unless a dependency is proven unrelated and tested.
12. Replace legacy deployment references after cutover, not before.

### Secondary

- Decide the long-term status of the legacy teleproto server.
- Remove stale Voroa/Vercel/Render references from production configuration and documentation after the cutover path is verified.
- Move Web Push dispatch from a setInterval Node process to an event/scheduled Worker mechanism.
- Audit the admin Playwright control path separately; it currently triggers GitHub Actions from the Node backend.
- Decide the future of the old Supabase telegram-file proxy and Telegram webhook byte-storage path.

## 5. Blocking issues

### P0 — Source/deployment drift

The Cloudflare-deployed hj-telegram-streaming Worker contains:
- Durable Object MediaListener
- R2 cache reads/writes/deletes
- listener endpoints
- cache lifecycle logic

These are not present in HJ-Telegram-Streaming main. Production and GitHub source are therefore not the same implementation.

The deployed hj-groups-web-backend Worker currently returns a fixed bootstrap response and is not the server.mjs implementation. Pages production still points HJ_WEB_BACKEND_URL to this Worker. Therefore the repository's Node backend behavior cannot be treated as the behavior deployed behind Pages.

### P0 — HJ GROUPS OF FILES is a runtime data dependency

The streaming Worker resolves Telegram file_id and media metadata from telegram_media_index. That table belongs to HJ GROUPS OF FILES and only contains a subset of media.

This means:
- an episode with no verified mapping cannot be streamed through the Bot API path;
- changing Supabase URLs alone cannot solve this;
- a 950-row mass mapping is unsafe and explicitly prohibited in this phase.

### P0 — HJ Web container dependency

The repository still declares @cloudflare/containers and configures a container image for HJWebBackend. The Pages Function forwards API traffic to that backend.

This directly violates the final containerless target.

### P1 — R2 cache order is not target-exact

The deployed streaming Worker currently calls Telegram getFile before checking the R2 cache. Therefore an R2 HIT is not truly independent of Telegram metadata lookup.

For the target:
R2 lookup must happen first. Only a true MISS should require Telegram source resolution/retrieval.

### P1 — Listener cleanup timing differs from the target

The deployed MediaListener code uses:
- 45-second listener leases
- 15-minute cache grace
- media-duration-based base expiry
- Durable Object alarms

The requested target specifies a 10-minute cleanup check after the last listener disappears. The implementation must be reconciled before being declared complete.

### P1 — No safe file_id source for all episodes

The HJ Web episodes schema relies on telegram_message_id. The production content setup does not add a file_id column to episodes.

HJ GROUPS OF FILES telegram_media_index stores file_id, but only for indexed media.

No file_id may be fabricated, guessed, copied from another message, or mass-assigned without message-level verification.

### P1 — Telegram Bot API 20 MB download limit

Telegram's official Bot API getFile supports files up to 20 MB for download. Telegram bots can currently send files up to 50 MB, but that does not increase the Bot API download limit.

Therefore:
- an R2 MISS for a >20 MB Telegram source cannot be fulfilled through the official Bot API getFile path;
- R2 does not bypass this source limitation;
- the correct target behavior is to keep the original Telegram media and only stream an already-available <=20 MB Bot API-compatible derivative;
- using a self-hosted/local Bot API to remove the 20 MB limit is outside the requested architecture and is not permitted in this migration.

Telegram's MTProto upload.getFile method is separate from the Bot API and can retrieve file parts, but using an MTProto user-session streaming runtime would violate the specified Bot API streaming target. It may remain an independent maintenance mechanism only where explicitly allowed and must not be silently introduced as a production streaming bypass.

### P1 — Existing compression flow replaces media in place

compression_runner.py downloads media and uses edit_message_media to replace the media attached to the original Telegram message.

This is incompatible with the strict migration rule "do not delete original Telegram media" if the goal is to preserve the original attachment independently.

Do not run this flow against the 950 episodes in this phase. A future maintenance design should preserve the original message/media and create a separately verified compressed derivative, then record the verified mapping.

### P1 — Web Push is tied to an always-running Node timer

server/webPush.mjs starts a 15-second setInterval dispatcher.

This is not compatible with the final no-always-on-Node architecture. The notification data model can remain; the dispatcher must move to a scheduled/event-driven runtime.

### P2 — stale deployment references

HJ-GROUPS-WEB contains stale references to:
- Voroa
- Vercel
- legacy Render streaming hosts

HJ-Telegram-Streaming contains legacy Render deployment configuration.

HJ-GROUPS-OF-FILES contains Render-related documentation and a render package dependency.

These are drift/hygiene issues. They should not be blindly removed until the final deployment path is verified.

## 6. Database/schema dependencies

### HJ GROUPS Web schema

Critical content identity:
- stories
- episodes
- books
- video_stories
- video_episodes
- telegram_message_id fields
- file_url/file_path legacy fields

Access/control:
- content_access_settings
- purchases
- user_vip_grants
- ad_unlocks
- rewarded_ad_unlock_intents
- shortener_links
- shortener_unlocks

Payments:
- payment_orders

Analytics:
- user_activity and related analytics tables/functions
- get_hj_admin_analytics_v2
- all Episode Analytics-specific migrations/functions must remain unchanged during the migration

Telegram ingestion:
- telegram_ingest_log
- telegram-webhook Supabase Edge Function

Other backend data:
- app_settings
- web_push_subscriptions
- web_push_dispatch_state
- web_push_episode_dispatches

### HJ GROUPS OF FILES schema

Runtime-dependency table today:
- telegram_media_index

Fields include:
- storage_chat_id
- telegram_message_id
- media_kind
- file_id
- file_unique_id
- file_name
- mime_type
- file_size
- duration
- width
- height
- updated_at

Maintenance queue:
- compression_jobs

Configuration:
- bot_settings / storage channel configuration

### Required future schema boundary

Do not add file_id to episodes merely to make the migration easier.

Preferred safe boundary:
- keep HJ Web content tables authoritative for content identity and access;
- create a dedicated streaming/media-source mapping owned by the final streaming architecture;
- populate only verified mappings;
- key mapping by media kind + Telegram message identity, with verified Telegram file_id and media metadata;
- migrate mappings incrementally/on-demand or by explicitly selected verified messages;
- do not mass-update 950 rows.

A future schema migration is required, but no schema change was made in this audit phase.

## 7. Exact files that must change

The following are the primary future-change files. They are NOT being modified in this audit phase.

### HJ-GROUPS-WEB

- functions/[[path]].js
- cloudflare-backend/wrangler.jsonc
- cloudflare-backend/src/index.js
- cloudflare-backend/package.json
- .github/workflows/deploy-cloudflare-web-backend.yml
- server.mjs
- server/shortenerUnlock.mjs
- server/rewardedAdUnlock.mjs
- server/payment.mjs
- server/vipAccess.mjs
- server/webPush.mjs
- server/analyticsSession.mjs
- server/adminUserExport.mjs
- server/playwrightControl.mjs
- server/edgeTts.mjs
- server/sarvamTts.mjs
- src/lib/secureMedia.js
- src/lib/streamingUrl.js
- src/lib/telegramContent.js
- supabase/functions/telegram-file/index.ts
- supabase/functions/telegram-webhook/index.ts
- a future Supabase migration for the new verified streaming-media mapping and any listener-related metadata that must live outside the DO

Root Dockerfile may be retired/decommissioned after the containerless backend cutover is proven. It is not to be used for the target runtime.

### HJ-Telegram-Streaming

- cloudflare-worker/src/index.js
- cloudflare-worker/src/pure.js
- cloudflare-worker/wrangler.jsonc
- .github/workflows/deploy-cloudflare-worker.yml
- add/refactor the MediaListener implementation into repository source so deployed and GitHub source are identical
- future source-map/mapping integration file(s) as required by the chosen verified mapping design

### HJ-GROUPS-OF-FILES

- .github/workflows/telegram-maintenance.yml
- scripts/compression_runner.py
- scripts/media_indexer.py
- supabase_schema.sql only if the maintenance schema needs a controlled separation
- related maintenance documentation

The HJ GROUPS OF FILES bot itself is not required to become a website runtime dependency. Its compression/indexing capability should remain separately runnable through GitHub Actions.

## 8. Exact files that must NOT change in this phase

No production behavior files were changed in this phase.

High-risk files that must remain untouched until the migration implementation phase:
- HJ-GROUPS-WEB/src/App.jsx, except a future implementation phase may adjust listener plumbing without touching Episode Analytics logic
- HJ-GROUPS-WEB analytics-related source and migrations
- HJ-GROUPS-WEB server/analyticsSession.mjs
- HJ-GROUPS-WEB analytics migrations and get_hj_admin_analytics_v2 definitions
- HJ-Telegram-Streaming/server.js
- HJ-Telegram-Streaming/scripts/generate-session.js
- current TELEGRAM_SESSION / authorization state
- Telegram storage-channel originals
- HJ GROUPS OF FILES link-generation and unrelated bot handlers
- existing production content rows
- existing Telegram message IDs
- existing file_id mappings
- 950-episode bulk content

Do not run bulk migration, bulk compression, message replacement, Telegram deletion, or session regeneration during the migration implementation without a separate verified plan.

## 9. Deployment dependencies

### Cloudflare Pages

Current project:
- hj-groups-web
- GitHub source: HJ-GROUPS-WEB
- production branch: main
- Pages Functions enabled

Current production environment variables include:
- HJ_WEB_BACKEND_URL
- VITE_STREAMING_SERVER_URL
- VITE_SUPABASE_URL

### Cloudflare streaming Worker

Current production bindings:
- MEDIA_CACHE -> R2 bucket hj-groups-media
- MEDIA_LISTENER -> Durable Object MediaListener
- MEDIA_TICKET_SECRET
- SUPABASE_SERVICE_ROLE_KEY
- MEDIA_INDEX_SUPABASE_SERVICE_ROLE_KEY
- TELEGRAM_BOT_TOKEN

Current deployed configuration also contains old-looking secret bindings:
- TELEGRAM_API_ID
- TELEGRAM_API_HASH
- TELEGRAM_SESSION

These should be treated as deployment drift/stale secret bindings until proven necessary. Do not regenerate the Telegram session as part of cleanup.

### HJ Web backend Worker

Current deployed script settings contain Supabase, shortener, GitHub Actions and Web Push bindings, but the deployed source is only a bootstrap response.

Repository container configuration additionally expects:
- Cashfree credentials
- Sarvam credentials
- HJ_PUBLIC_BASE_URL
- other backend secrets

This mismatch must be reconciled before production API migration.

### GitHub Actions

Relevant:
- HJ Web quality-check workflow
- HJ Web Cloudflare backend deployment workflow
- HJ Telegram streaming Cloudflare Worker deployment workflow
- HJ Files telegram-maintenance workflow
- HJ Files maintenance-test workflow
- Playwright workflow

Node/Python usage inside GitHub Actions is acceptable as build/test/maintenance tooling. The final restriction is about production always-on runtimes, not ephemeral CI runners.

## 10. Testing plan

Testing must happen in stages and must not start with the 950-episode catalog.

### Stage A — static architecture checks

Verify:
- no production @cloudflare/containers dependency
- no backend proxy to an always-on Node runtime
- no Render/Railway/Vercel/Voroa production runtime reference
- no Docker runtime path in the target deployment
- HJ Files is not queried by the streaming Worker at request time
- Telegram session is not used by production streaming
- no change to Episode Analytics

### Stage B — media mapping

Use a tiny controlled test set only:
- one <=20 MB audio
- one <=20 MB video
- one document/book
- one protected media item
- one intentionally unmapped media item
- one >20 MB source item

For every mapped item verify Telegram message identity, media kind, file_id, file_unique_id, size and MIME metadata from an authoritative source.

### Stage C — R2 streaming

Test:
1. first request = R2 MISS
2. source resolution only on MISS
3. Telegram retrieval
4. R2 write
5. response streaming
6. second request = R2 HIT without Telegram getFile
7. 206 range requests
8. 416 invalid ranges
9. HEAD
10. failed Telegram source
11. missing mapping
12. R2 failure recovery

### Stage D — access control

Test:
- free media
- first-episode free preview rules
- Premium
- VIP
- Ads
- mixed access
- missing authentication
- invalid/expired authentication
- valid entitlement
- signed ticket expiry
- ticket/user-agent binding

### Stage E — listener lifecycle

For one test media:
- user A start
- user B start
- A heartbeat
- A end
- verify cache remains because B is active
- B heartbeat
- B end
- wait through the configured cleanup window
- verify deletion only after no active listener remains
- start a new listener during cleanup and verify deletion is prevented
- verify lease expiry acts as fail-safe

The exact cleanup interval must match the agreed 10-minute target before production sign-off.

### Stage F — website/admin regression

Verify:
- playback
- story/episode selection
- Admin create/manage flows
- TTS
- shortener
- Ads unlock
- Cashfree payment flow
- VIP grants
- Web Push
- security page
- Playwright control
- analytics
- Episode Analytics unchanged

### Stage G — maintenance regression

Use GitHub Actions on a controlled test media only.
Verify:
- compression succeeds
- resulting media is <=20 MB when that is the selected target
- caption/metadata preservation
- original Telegram media is preserved according to the approved future process
- verified file_id is recorded
- no website runtime call is made to HJ GROUPS OF FILES

## 11. Safe migration order

1. Freeze this audit snapshot. No production behavior changes.
2. Reconcile GitHub HJ-Telegram-Streaming source with the actual deployed Worker code, or explicitly make GitHub the authoritative source after reviewing every difference.
3. Reconcile the deployed HJ web backend with the intended backend source before changing routing.
4. Migrate Web API capabilities from Node server.mjs to Cloudflare Worker/Pages Functions in small functional slices.
5. Keep business rules unchanged while changing the runtime boundary.
6. Establish the dedicated verified streaming-media mapping schema.
7. Populate only selected/test mappings first. Never fabricate file_id.
8. Modify streaming Worker to use the new mapping, not HJ Files at request time.
9. Make R2 lookup the first media-data operation on every request.
10. Add/fix exact listener lifecycle and 10-minute cleanup behavior.
11. Migrate required secrets to the final runtime.
12. Test all Stage A-G cases with a tiny controlled set.
13. Cut over Pages API routing.
14. Observe production with a limited media set.
15. Only after stable operation, deprecate legacy container/Node/Render/Voroa/Vercel runtime paths.
16. Keep original Telegram media intact throughout.
17. Expand mappings incrementally only after verified success. No forced 950-row migration.

## 12. Known hard limitations

1. Official Telegram Bot API getFile download limit is 20 MB. The streaming Worker cannot legally/officially stream a >20 MB source through the Bot API path.
2. Telegram bots can currently send files up to 50 MB, but that is an upload/send limit and does not remove the 20 MB getFile download limit.
3. An R2 cache hit can serve previously cached data without Telegram retrieval only after the object already exists in R2. R2 cannot create a missing object from a >20 MB source through Bot API getFile.
4. No local Bot API server or other bypass is part of this migration.
5. MTProto is technically a different transfer mechanism and must not be introduced into the production Bot API streaming Worker as a hidden workaround.
6. telegram_message_id is not equivalent to Telegram Bot API file_id.
7. file_id must be sourced from an authoritative Telegram result. It must never be guessed.
8. HJ GROUPS OF FILES telegram_media_index is currently incomplete for the website catalog.
9. Current compression_runner.py replaces media in place; therefore it must not be used for the prohibited 950-item migration or any future flow that must preserve originals independently.
10. Current deployed listener behavior is not yet an exact implementation of the requested 10-minute cleanup policy.
11. Production control-plane state and GitHub source are currently divergent.

Official Telegram references checked during this audit:
- core.telegram.org/bots/faq
- core.telegram.org/bots/api
- core.telegram.org/method/upload.getFile
- core.telegram.org/api/files

## 13. Recommended next phase

Recommended next phase: "SOURCE-OF-TRUTH RECONCILIATION + CONTAINERLESS WEB BACKEND PREPARATION"

First fix the two most dangerous forms of drift without changing content:
A. reconcile the deployed streaming Worker (R2 + MediaListener) into HJ-Telegram-Streaming source;
B. reconcile the HJ Web backend deployment so its actual Worker source matches the intended backend implementation before any runtime migration.

Then perform a small-scope architecture migration:
- define the verified streaming-media mapping schema;
- migrate only a few known message IDs;
- make R2 the true first lookup;
- move the required API endpoints incrementally to Pages/Workers;
- preserve all existing access rules and Episode Analytics;
- keep HJ GROUPS OF FILES out of the request path;
- keep compression manual/independent;
- do not touch the 950-episode catalog yet.

Production sign-off criteria:
- GitHub source == deployed source for each production Worker
- no container/always-on Node dependency
- no HJ GROUPS OF FILES request-time dependency
- verified media mapping coverage for the selected production set
- R2-first behavior confirmed
- listener cleanup confirmed
- >20 MB source handling explicitly returns the supported failure state or uses an already-created <=20 MB derivative
- Episode Analytics regression-free
- Telegram originals preserved

Audit conclusion:
The final target architecture is technically achievable without bulk-migrating or bulk-compressing the 950 episodes, but it is NOT production-ready yet. The primary blockers are deployment/source drift, the HJ Web container backend, incomplete media mappings, current HJ Files runtime dependency, non-target R2 lookup order, and the need to reconcile the listener cleanup semantics.


---

# Phase Addendum — 2026-10-08 — R2-first / No-DO correction

This addendum supersedes any earlier audit text that describes a Durable Object listener/heartbeat design as the final target.

## Agreed architecture for this phase

- Website target remains Cloudflare Pages + Pages Functions/Workers + Supabase + R2 + official Telegram Bot API.
- No Durable Object listener/heartbeat system is part of the final design.
- R2 is a temporary hot cache; cleanup is controlled by an R2 lifecycle rule.
- HJ GROUPS OF FILES is an independent maintenance utility and must not be queried by the website/streaming Worker at request time.
- Media mapping is lazy and on-demand; no bulk mapping was performed.
- Heavy compression/splitting remains manual GitHub Actions work; no 950-episode bulk operation was performed.
- Telegram originals were not deleted and the Telegram session was not regenerated.
- Episode Analytics was not modified.

## What was actually changed/verified in this phase

### HJ-Telegram-Streaming

A new review branch was created from `main`:

`codex/r2-first-lifecycle-no-do`

A previous draft PR that implemented the now-rejected Durable Object/listener design was closed without merging:

`PR #7 — closed, not merged`

A new draft review PR contains the corrected implementation:

`PR #8 — Migration phase: R2-first hot cache without Durable Objects`

Verified source changes on the review branch:
- Durable Object/listener/heartbeat code removed from the target Worker source.
- Durable Object binding and migration removed from `wrangler.jsonc`.
- R2 is checked before Telegram Bot API `getFile`.
- On R2 MISS only, the Worker resolves the verified Telegram source.
- Request-time media mapping is switched from the HJ GROUPS OF FILES `telegram_media_index` table to HJ Web Supabase `public.streaming_media_sources`.
- Worker package validation files were added.
- R2 lifecycle configuration is versioned in `cloudflare-worker/r2-lifecycle.json`.
- The deployment workflow applies that lifecycle configuration after a Worker deployment when the Cloudflare token is configured.

### HJ Web Supabase mapping table

Created:

`public.streaming_media_sources`

Security/verification:
- RLS enabled.
- Service-role-only policy created.
- Live SQL verification returned `row_count = 0`.

This is intentional. No 950-row mapping or bulk data migration has been performed.

### Cloudflare R2

Live bucket checked:

`hj-groups-media`

Verified lifecycle configuration:
- Existing multipart-abort rule retained: 7 days.
- New `Expire HJ Hot Media` rule:
  - prefix: `media/`
  - age threshold: 600 seconds (10 minutes)

Important limitation:
Cloudflare documents lifecycle deletion as asynchronous; objects are typically removed within 24 hours after their expiration becomes due. Therefore 600 seconds is the configured eligibility/age threshold, NOT a guaranteed exact deletion time.

### Telegram official limit

Official Telegram Bot API documentation currently states that `getFile` downloads work for files up to 20 MB. Bots can send files up to 50 MB, but that is a separate upload/send limit. The migration will not bypass the 20 MB download limit.

Agreed handling for larger content:
- create separately verified <=19 MB derivatives/chunks using GitHub Actions maintenance;
- upload those derivatives/chunks to Telegram;
- keep original Telegram media untouched;
- reassemble verified parts in the streaming Worker as a future implementation phase.

## NOT VERIFIED / still pending

- The corrected Worker has NOT been promoted to production from PR #8.
- Real production media regression matrix (R2 HIT/MISS, Message 7, Range, seek, protected access, failure paths) is still NOT VERIFIED.
- GitHub Actions CI result for the new PR is not yet available through the current connector.
- The new mapping table is empty; no selected production media has been mapped yet.
- HJ GROUPS OF FILES request-time dependency is removed in the corrected Worker branch, but website/admin flows that still depend on its old scanning/indexing behavior require a separate regression pass.
- Containerless HJ Web backend migration is still pending.
- Web API runtime migration from `server.mjs` to Pages/Workers is still pending.
- Web Push scheduled/event-driven migration is still pending.
- Episode Analytics remains unchanged and must be regression-tested after the web runtime migration.

## Phase qualification

Status: PARTIALLY COMPLETED — source correction + mapping boundary + R2 lifecycle configuration are implemented/verified; production cutover is intentionally not completed.

No production content migration was performed.
