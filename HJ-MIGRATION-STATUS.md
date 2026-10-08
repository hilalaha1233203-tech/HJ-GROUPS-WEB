# HJ GROUPS — Migration Status / Review Patch

Date: 2026-10-08
Current HJ-GROUPS-WEB main HEAD at this checkpoint: `c14bca0d1f3a8517a3132cfec7975235c6e93715`

## Scope of this review

Phase 1 (audit) and Phase 2 (HJ Web container removal) were treated as already executed and were **not redone**.

This review only:
- re-checked the current repository/control-plane state;
- corrected documentation where previous status was stale or contradictory;
- added the specifically requested public-catalog cache path;
- added a Pages Functions routes manifest;
- added a CI secret-access scan;
- did not modify the streaming repository;
- did not modify Episode Analytics;
- did not migrate, compress, upload, delete, or remap the 950-episode catalog.

Production content changes in this review: NO.

Telegram originals deleted: NO.

Telegram session regenerated: NO.

950-row bulk migration: NO.

## 1. Telegram Bot API size limits and large-media policy

### VERIFIED — official documentation checked 2026-10-08

Official references:
- https://core.telegram.org/bots/faq
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/features

Verified limits:
- Cloud Bot API `getFile` download limit: 20 MB.
- Bot API `sendDocument` upload/send limit: currently 50 MB.
- The 50 MB bot upload limit does NOT increase the 20 MB `getFile` download limit.

Therefore a Telegram source above 20 MB cannot be downloaded through the official cloud Bot API `getFile` path.

Officially documented options for large files:
1. Compress/create a smaller derivative below the Bot API download limit.
2. Run Telegram's local Bot API server; official documentation currently lists local download up to 2000 MB and upload up to 2000 MB.
3. Use MTProto APIs; official `upload.getFile` returns a whole file or file parts and is usable by users and bots.

Architecture decision:
- A self-hosted/local Bot API server is NOT part of the requested production architecture because it introduces a separately hosted server/runtime. It is therefore NOT an approved always-on production path.
- MTProto is also NOT approved as the hidden production website streaming runtime because the selected target is Cloudflare Worker + official Bot API. MTProto may be considered only as explicitly controlled maintenance tooling.
- Chosen production-compatible handling: if acceptable, create a compressed derivative under the Bot API download limit; otherwise pre-split the source into independently verified chunks of <=19 MB and stream/reassemble those chunks.
- Original Telegram media remains untouched.

### VERIFIED — exact chosen constraint

The <=19 MB chunk target is an HJ design decision, not a Telegram official limit. It deliberately leaves headroom below the official 20 MB download ceiling.

## 2. Obtaining file_id for existing old Telegram media

### VERIFIED — official method and constraints

The Bot API does not provide a general arbitrary `getMessage` method that simply retrieves an old channel message by `message_id`.

The documented `forwardMessage` method accepts `from_chat_id` + `message_id` and returns the sent `Message` on success. That returned Message contains the media object and therefore its bot-visible `file_id`.

Safe verification method for an existing source message:
- The production bot must have access to the source channel. Telegram's Bot FAQ states that bots receive all messages from channels where they are a member.
- For a message that is forwardable, the same production bot token can `forwardMessage` the exact source message into a private dump chat/channel that the bot can write to.
- Read the returned/sent Message media and record the `file_id`, `file_unique_id`, size, MIME and message identity.
- Use the SAME bot token for subsequent `getFile`/streaming.

Important:
- Telegram documents that `file_id` is unique for each individual bot and cannot be transferred from one bot to another.
- Therefore the file_ids used by the streaming Worker MUST belong to the production `TELEGRAM_BOT_TOKEN`, not a different maintenance bot token.
- `forwardMessage` cannot forward protected-content messages. Such sources require a different explicitly-approved maintenance path.

Official references:
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/faq

Status: VERIFIED as the authoritative Bot API approach. Real message-level execution for a production episode: NOT VERIFIED and intentionally not run in this review.

## 3. Database facts

### VERIFIED — live Supabase queries

HJ Web Supabase:
- `public.episodes` row count: 950
- `public.episodes` has NO `file_id` column
- `public.episodes` has `telegram_message_id`

HJ GROUPS OF FILES Supabase:
- `public.telegram_media_index` exists
- current row count: 24

Therefore:
- `telegram_media_index` is only a small subset relative to the 950-episode HJ Web catalog.
- `telegram_message_id` must NOT be treated as a `file_id`.
- Do NOT point `MEDIA_INDEX_SUPABASE_URL` at the HJ Web database blindly.
- Any future streaming mapping must come from an authoritative Telegram result and be recorded explicitly.

No rows were bulk migrated in this review.

## 4. Listener/Durable Object request-cost analysis

### VERIFIED — calculation based on current Cloudflare Free limits

Legacy listener model:
- `listener/start`: 1 Worker request
- heartbeat every ~20 seconds: about 3 requests/minute
- `listener/end`: 1 Worker request

Approximate request formula:
`2 + session_seconds / 20`

Examples:
- 30-minute listening session: ~90 heartbeats + 2 = ~92 Worker requests
- 60-minute session: ~180 heartbeats + 2 = ~182 Worker requests
- 45-minute session: ~135 heartbeats + 2 = ~137 Worker requests

Cloudflare currently documents:
- Workers Free: 100,000 requests/day, reset at midnight UTC.
- Pages Function requests count toward the Workers Free request quota.
- Static asset requests that do not invoke Functions are free on Pages.

Using ONLY the listener requests and assuming one listening session/user/day:
- ~100,000 / 92 = ~1,086 theoretical 30-minute sessions/day
- ~100,000 / 182 = ~549 theoretical 60-minute sessions/day
- A practical one-session/day envelope is therefore roughly 500–1,000 active listeners/day BEFORE other dynamic Worker/Pages Function requests, auth calls, APIs, admin calls, retries, etc.

This is a budget estimate, not a capacity guarantee.

### VERIFIED — architecture decision

The legacy Durable Object listener lease/heartbeat approach is NOT the target architecture.

Decision:
- REPLACE listener leases/heartbeat coordination with temporary R2 hot-cache objects and an R2 lifecycle expiration policy.
- No listener/heartbeat Durable Object system is part of the final target.

This replacement itself belongs to the later streaming phases and is NOT being implemented in this review.

Official Cloudflare references:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/

## 5. Voroa deployment constraint

### NOT VERIFIED — operational state supplied by user

User-reported current situation:
- website `hj-groups-website` runs on Voroa;
- HJ Files bot `hj-groups-of-files` runs on Voroa;
- this month's Voroa build-minutes and bandwidth allowances are exhausted.

No Voroa dashboard/connector evidence is available in this review, so these operational quota facts are NOT independently verified.

Deployment constraint recorded for this migration:
- Do NOT perform Voroa deploys until the monthly reset.
- Cloudflare is the intended replacement runtime.

## 6. HJ Web Phase-2 result re-verification

### NOT VERIFIED — current main contradicts the expected containerless state

This is NOT a re-execution of Phase 2; it is a current-state drift check.

Live Cloudflare control-plane:
- Pages project: `hj-groups-web`
- production branch: `main`
- build command: `npm run build`
- destination: `dist`
- Functions enabled: yes
- current latest production deployment commit: `95e0d181e2c34ef3a17b6e31d168af101a52d275`
- current Pages production env still contains `HJ_WEB_BACKEND_URL`
- latest production deployment status observed: success

Current repository main still contains:
- `cloudflare-backend/src/index.js` importing `@cloudflare/containers`
- `cloudflare-backend/package.json` depending on `@cloudflare/containers`
- `cloudflare-backend/wrangler.jsonc` declaring a container image and HJWebBackend binding
- root `Dockerfile`
- `functions/[[path]].js` proxying API traffic to `HJ_WEB_BACKEND_URL`
- `server.mjs` using Node HTTP/fs/path APIs

Therefore the previously claimed Phase-2 container-removal state cannot be marked VERIFIED from the current main/control-plane state.

No container-removal work was redone here.

## 7. Actual HJ Web build / lint / test verification

### VERIFIED — GitHub Actions run

The completed `verify` run on commit `1cfa691d0c7206c36bb0179aa240607c9452577e` completed successfully for these checks:
- dependency audit: no high/critical production dependency vulnerabilities
- `npm run lint`: 0 errors, 2 warnings
- `npm run build`: PASS; Vite build completed successfully
- existing Node unit tests: 132 tests, 132 passed, 0 failed
- production server startup smoke check: PASS
- shortener/server syntax checks: PASS
- migration filename checks: PASS
- Auth/settings/source sanity: PASS
- appearance/security-monitoring sanity: PASS
- final source sanity: PASS
- frontend build secret-access scan: PASS

The 2 lint warnings are existing React Hook exhaustive-deps warnings in `src/App.jsx`.

Typecheck:
- NOT VERIFIED / NOT APPLICABLE — `package.json` has no `typecheck` script and the project does not declare a TypeScript typecheck command.

Latest commit `c14bca0d1f3a8517a3132cfec7975235c6e93715` also adds an explicit Pages Function syntax/routes-manifest CI check, but its latest CI run was still queued at this checkpoint. Therefore that new check is NOT VERIFIED yet.

## 8. Endpoint verification matrix

The following is a current-code/CI verification matrix, not a claim of successful production E2E.

| Surface | Status | Evidence / limitation |
|---|---|---|
| Auth / login / signup / recovery | VERIFIED | Auth source sanity + `authRecovery.test.mjs` + successful verify job; production E2E remains NOT VERIFIED |
| Admin authentication | VERIFIED | Admin security/source sanity + successful verify job; production E2E NOT VERIFIED |
| Public settings | VERIFIED | `/api/public-settings` source sanity + successful verify job; live production endpoint NOT VERIFIED |
| Access rules | VERIFIED | access-control source + ad/VIP/shortener unit coverage; production E2E NOT VERIFIED |
| Premium access | VERIFIED | secure-media/access-control source checks; production E2E NOT VERIFIED |
| VIP | VERIFIED | `vipAccess.test.mjs` + source sanity; production E2E NOT VERIFIED |
| Ads | VERIFIED | `adUnlockRules.test.mjs`, `dualProviderUnlock.test.mjs`, source sanity; production E2E NOT VERIFIED |
| Shortener | VERIFIED | `shortenerUnlock.test.mjs` + server syntax + source sanity; production E2E NOT VERIFIED |
| Secure media tickets | NOT VERIFIED | streaming ticket runtime belongs to later streaming phases; not changed in this review |
| Edge TTS / Sarvam TTS | NOT VERIFIED | routes/source are present; live external TTS execution was not successfully verified in the production E2E run |
| Cashfree payments | VERIFIED | `payment.test.mjs` + source sanity; live payment flow NOT VERIFIED |
| Analytics session/admin analytics | VERIFIED | `analytics.test.mjs` + successful source sanity; live E2E NOT VERIFIED |
| Episode Analytics | VERIFIED — unchanged | no Episode Analytics code/migrations changed in this review; post-cutover regression still required |
| Public catalog | NOT VERIFIED in production | new `/api/public-catalog` implementation added; latest CI route-manifest check still pending |
| Security headers | VERIFIED at source/CI level | `server.mjs` source + successful CI sanity; live response headers NOT VERIFIED |
| CORS | VERIFIED at source/CI level | trusted-origin/source checks pass; live browser CORS NOT VERIFIED |

A previous completed production E2E run on the current deployment produced 2 passing tests and 13 failing tests. Representative failures included:
- `Audio Stories` element not found during multiple flows.
- `/api/admin/user-export.xlsx` returned 404 where the test expected 401.

The latest E2E run for the newest commit was still in progress at this checkpoint, so no final pass/fail result is claimed for it.

## 9. Current grep / architecture findings

### NOT VERIFIED CLEAN — legacy/container runtime remains

Current repository still contains:
- `@cloudflare/containers`
- `cloudflare-backend/wrangler.jsonc` container configuration
- root `Dockerfile`
- `server.mjs` Node runtime
- `server/edgeTts.mjs` using `ws` + Node crypto
- `server/payment.mjs`, `server/rewardedAdUnlock.mjs`, `server/shortenerUnlock.mjs` using Node crypto
- `server/adminUserExport.mjs` using Node zlib/Buffer
- `server.mjs` using fs/path/http

These Node-only usages are legacy server/runtime code, NOT evidence that the new Pages Function itself uses Node APIs.

### VERIFIED CLEAN — target Pages Function files changed in this review

- `functions/api/public-catalog.js` uses standard Fetch/Cache APIs and `context.env`; no `process.env`, fs, child_process or node:crypto usage.
- `public/_routes.json` limits Function invocation routing to `/api/*`, `/unlock/*`, and `/health`.

### Legacy hosting references

NOT VERIFIED CLEAN:
- Render/Vercel/Voroa/legacy hosting strings still exist in compatibility/documentation code.
- `src/lib/streamingUrl.js` intentionally contains legacy Render/Vercel detection to reject stale streaming URLs; this is not itself an active production runtime dependency.
- `.env.example` still contains legacy Voroa/Render wording and should be cleaned only when the final runtime cutover is actually verified.
- Current Pages production still has `HJ_WEB_BACKEND_URL`, which is the more important runtime blocker.

No Koyeb production reference was found in the current repository search.

### Process environment usage

- Pages Function target code changed here: no `process.env`.
- Legacy Node server/tests/workflows do use `process.env`; those are not Pages Function runtime code.

## 10. Public endpoint caching patch

### IMPLEMENTED — production verification pending

Changed:
- `functions/api/public-catalog.js`
- `src/lib/telegramContent.js`
- `public/_routes.json`

Behavior:
- Public catalogue reads for stories/episodes/books/videos are served through `/api/public-catalog`.
- `caches.default` is used with a 5-minute cache.
- Response uses `Cache-Control: public, max-age=300, s-maxage=300`.
- Requests with `Authorization` or `Cookie` are rejected from the public cache path and use the existing direct-Supabase fallback.
- No user-specific data or authorization-dependent endpoint is cached.
- Episode Analytics was not touched.
- Existing direct Supabase reads remain as a fallback if the Pages cache endpoint is unavailable.

Important Cloudflare behavior:
- Cache API reduces repeated Supabase reads/egress after a cache HIT, but Cache API runs inside the Worker. It should NOT be described as eliminating the Function invocation itself.
- `public/_routes.json` keeps static assets out of the Functions path; Cloudflare documents non-Function Pages static asset requests as free.

Production verification:
- NOT VERIFIED yet because the latest Pages deployment observed is still the older `95e0...` deployment and the newest CI run is still pending.

Official Cloudflare cache references:
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/pages/functions/pricing/

## 11. Frontend/build secret exposure

### VERIFIED — CI source/build identifier scan

Changed:
- `.github/workflows/quality-check.yml`

The CI now rejects forbidden server-secret access patterns in `src/`, `functions/`, and `dist/`, including `import.meta.env.VITE_*` access to server-only secrets and server-only `process.env/context.env` secret access in frontend/Pages code.

The first run of this corrected scan initially failed because a harmless client-side UI string displayed the literal identifier `HJ_GITHUB_ACTIONS_TOKEN`. The scan was corrected to detect actual secret access expressions rather than harmless secret names.

Final completed `verify` run:
- frontend build secret-access scan: PASS
- no server-only secret environment access emitted into the frontend build.

This verifies the repository/build does not emit those server-only environment access patterns. It cannot mathematically prove that an unknown secret value was never hard-coded; no secret value was available to compare.

## 12. Streaming repo — NO IMPLEMENTATION IN THIS REVIEW

### VERIFIED — no streaming implementation performed here

No HJ-Telegram-Streaming source was modified for this review.

The following remain planned for later phases only:

Phase 3:
- listener/Durable Object removal/replacement decision
- R2 temporary-cache lifecycle design
- lazy verified media mapping boundary
- Bot API source verification

Phase 4:
- <=19 MB chunked-media playback/reassembly
- Range/seek regression
- R2 HIT/MISS regression
- protected-ticket regression
- production streaming cutover

These are NOT marked implemented/complete here.

## 13. Remaining issues / blockers

P0:
1. Current HJ Web main still contains the container backend and Node proxy path, contrary to the expected Phase-2 end state. This is a source/deployment drift verification failure, not a Phase-2 reimplementation.
2. Current Pages production deployment is still commit `95e0d181e2c34ef3a17b6e31d168af101a52d275` and still has `HJ_WEB_BACKEND_URL`.
3. Production endpoint E2E is not currently passing; the previous completed run had 13 failures / 2 passes.

P1:
4. Latest CI run for commit `c14b...` still needs to finish the explicit Pages Function syntax/routes-manifest check.
5. Supabase Preview CI remains failing in the latest run and needs migration-history reconciliation.
6. Live CORS/security-header/API verification is not complete.
7. Live public-catalog cache HIT/MISS behavior is not verified.
8. TTS, Cashfree, shortener, Ads, VIP and secure-ticket real production flows still need authenticated/real-environment regression.
9. Web Push is still tied to legacy Node scheduling and needs later scheduled/event-driven migration.
10. Legacy hosting references remain and should be cleaned after verified cutover only.
11. `HJ-GROUPS-OF-FILES` Voroa quota state is not independently verified.

## 14. Files changed in this review

HJ-GROUPS-WEB:
- `functions/api/public-catalog.js` — added 5-minute public catalogue edge cache.
- `src/lib/telegramContent.js` — use cached public catalogue with direct-Supabase fallback.
- `public/_routes.json` — function routing limited to dynamic API/health routes.
- `.github/workflows/quality-check.yml` — secret-access scan + Pages Function/routes checks.
- `HJ-MIGRATION-STATUS.md` — fully reconciled current review status.

No HJ-Telegram-Streaming file was changed in this review.

No Episode Analytics file/migration/function was changed.

## 15. Qualification

Overall status: **PARTIALLY VERIFIED — NOT PRODUCTION READY**

Verified:
- official Telegram size limits checked;
- authoritative file_id acquisition method documented;
- 950 vs 24 DB mapping facts verified live;
- listener legacy request estimate calculated from official Cloudflare limits;
- HJ Web build/lint/unit/smoke/source checks completed successfully in CI;
- 132/132 unit tests passed;
- frontend secret-access scan passed;
- public catalog cache patch implemented.

NOT VERIFIED:
- Phase-2 containerless state against current main/control-plane;
- latest Pages Function/routes-manifest CI completion;
- production endpoint E2E;
- live public-catalog cache HIT/MISS;
- live authenticated API flows;
- Voroa quota state;
- all later streaming Phases 3/4.

Do not mark this migration complete until the current source/deployment drift, production endpoint E2E, and remaining runtime verification gates are cleared.
