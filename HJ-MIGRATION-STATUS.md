# HJ GROUPS — Migration Status / Review Patch

Date: 2026-10-08
Code verification checkpoint: `21a3b6ebfcaf87f387bd36ae28d1569038612865`
Status-document commit: this file's current commit

## Scope of this review

Phase 1 audit was re-checked only. The Phase 2 reality check found that the expected containerless implementation was **not actually present on main**, so Phase 2 was implemented now on a dedicated branch and PR. Main was not modified.

This review/implementation:
- re-checked the current repository/control-plane state;
- migrated the required HJ Web server routes to Pages Functions using Web APIs;
- removed the container/Docker production-path artifacts from the migration branch;
- preserved Episode Analytics with no code/migration changes;
- retained the requested public-catalog 5-minute cache;
- added Pages Functions route and production-path guards;
- did not modify the streaming repository;
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

The `c14bca0d1f3a8517a3132cfec7975235c6e93715` verify run also completed the explicit Pages Function syntax/routes-manifest check successfully.

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

## 11A. PHASE 2 REAL-STATE RECONCILE + IMPLEMENTATION — 2026-10-08

### VERIFIED — Phase 2 missing-state evidence

GitHub repository:
- main base SHA at start of this work: `c51248efbf86b10f65bdaf98ecf83e22b731ba20`
- no existing Phase 2 implementation branch/PR was found before this work.
- open PR created: **#9**
- PR URL: https://github.com/hilalaha1233203-tech/HJ-GROUPS-WEB/pull/9
- PR base: `main`
- current PR head: `21a3b6ebfcaf87f387bd36ae28d1569038612865`
- PR state: OPEN, not merged, mergeable: true.

Live Cloudflare Pages evidence before cutover:
- project: `hj-groups-web`
- production branch: `main`
- latest production deployment before this PR: **7624f08c-1894-4792-b5f0-6b51590ba8e9**
- production commit: `95e0d181e2c34ef3a17b6e31d168af101a52d275`
- production still had `HJ_WEB_BACKEND_URL`
- therefore production was still on the old container-proxy path.

### VERIFIED — Phase 2 production-path implementation on branch

Changed production-path files include:
- `functions/[[path]].js` — container proxy replaced by the Pages Functions router.
- `functions/_lib/runtime.js` — Web API runtime helpers, Supabase REST/Auth, HMAC/Web Crypto, CORS/security response helpers.
- `functions/_lib/publicSettings.js`
- `functions/_lib/analytics.js`
- `functions/_lib/vip.js`
- `functions/_lib/ads.js`
- `functions/_lib/shortener.js`
- `functions/_lib/payment.js`
- `functions/_lib/tts.js`
- `functions/_lib/webPush.js`
- `functions/_lib/playwright.js`
- `functions/_lib/adminExport.js`
- `scripts/test-pages-routes.mjs`
- `.github/workflows/quality-check.yml`

Removed from the migration branch production path:
- `Dockerfile`
- `cloudflare-backend/.dockerignore`
- `cloudflare-backend/package.json`
- `cloudflare-backend/src/index.js`
- `cloudflare-backend/wrangler.jsonc`
- `.github/workflows/deploy-cloudflare-web-backend.yml`

### VERIFIED — route classification / migration outcome

A — migrated to Pages Functions:
- public settings;
- analytics session link;
- admin analytics;
- admin user export XLSX;
- admin Playwright workflow trigger;
- VIP self/admin;
- rewarded Ads;
- shortener/unlock;
- Cashfree create-order/status/webhook/health;
- Web Push config/status/subscribe/preferences/unsubscribe;
- security/CORS headers and health.

E — external API calls, preserved as Fetch/Web APIs:
- Supabase REST/Auth;
- Cashfree API;
- AroLinks/Earn4Link APIs;
- Sarvam TTS;
- GitHub Actions workflow-dispatch API.

B — not migrated as a fake implementation:
- **Edge TTS** remains an explicit `503 EDGE_TTS_NOT_MIGRATED` because the old implementation depends on Node WebSocket/runtime behavior. No false-success fallback was introduced.
- **Web Push admin delivery** remains explicit `503 WEB_PUSH_SEND_NOT_MIGRATED`; subscription/config management is migrated, but delivery sender was not claimed VERIFIED without a Worker-safe implementation.

D — legacy Node server compatibility code is not part of the new production Pages runtime and is not used by `functions/[[path]].js`. It remains in the repository only where needed for rollback/tests until final cutover.

F — no architecture redesign was introduced; the existing API responsibilities were moved behind the Pages Functions boundary.

### VERIFIED — local Pages runtime verification

GitHub Actions Quality Check run:
- run number **1043**
- run id **37790428213**
- commit tested: `e6a8a83449fb84a9c74598110b3e64cb4c3dbaf1`
- conclusion: **SUCCESS**

Verified in that run:
- dependency audit: PASS, 0 high/critical production vulnerabilities;
- lint: PASS after migration cleanup, with the existing two React Hook warnings in `src/App.jsx`;
- production build: PASS;
- existing tests: **132 passed / 0 failed**;
- Pages Function syntax/routes manifest: PASS;
- production-path container guard: PASS;
- local `wrangler pages dev` smoke: PASS;
- frontend server-secret identifier scan: PASS;
- Auth/settings/metadata sanity: PASS;
- appearance/security-monitoring sanity: PASS;
- final source sanity: PASS.

A final one-line Web Push cleanup was then made at PR head `21a3b6...` to remove an unused helper. Cloudflare Preview build/deploy below verifies that final head compiles and deploys; because GitHub Actions did not produce a newer post-cleanup run in this check window, **final-head GitHub lint/unit-test verification is NOT VERIFIED** beyond the prior green run.

### VERIFIED — Cloudflare Pages Preview deployment

Final PR head `21a3b6ebfcaf87f387bd36ae28d1569038612865` was deployed as a Cloudflare Pages **preview**:
- deployment id: **8d69fba2-b0cb-4d29-9983-1ac16fca1c78**
- short id: **8d69fba2**
- preview URL: https://8d69fba2.hj-groups-web.pages.dev
- preview alias: https://phase2-containerless-pages-m.hj-groups-web.pages.dev
- build stage: SUCCESS
- deploy stage: SUCCESS
- Functions: enabled
- production branch remains `main`.

Cloudflare deployment logs confirmed:
- `npm clean-install` succeeded;
- `npm run build` succeeded;
- Vite built successfully;
- Functions directory uploaded;
- `_routes.json` uploaded/validated.

### NOT VERIFIED — browser/live HTTP smoke from this environment

Attempted live HTTP fetches to the preview returned a connector-level:
`403 Forbidden: requests to <preview-host> are not allowed`
This response came from the tool security layer, not from the HJ application.

Therefore these real user-facing checks remain **NOT VERIFIED — needs user action**:
- browser health endpoint;
- public settings;
- public catalog/cache behavior;
- login/signup/recovery;
- admin login;
- settings;
- Ads unlock;
- shortener unlock;
- VIP/Premium;
- ticket issue/playback;
- TTS;
- Cashfree sandbox create-order;
- CORS/headers from a real browser;
- Episode Analytics regression.

### IMPORTANT CUTOVER STATE

The live Pages project still contains the legacy `HJ_WEB_BACKEND_URL` environment variable in its **production and preview deployment configuration**.

The new branch runtime does **not** use that variable, and the branch source/container guard is clean. However, the variable has intentionally NOT been removed from live production configuration yet, so the old backend remains available for rollback exactly as requested.

Do NOT merge/promote PR #9 until the preview has been manually accepted.

## 12. HJ-Telegram-Streaming Phase 3 — Cloudflare containerless streaming runtime

### VERIFIED — repository implementation and CI

Phase 1/2 were not redone. This phase implements only the requested HJ-Telegram-Streaming runtime work.

Current HJ-Telegram-Streaming main implementation commit:
- `1d13576d981d136a1d96703fa36cbc148bd96ba4`

Changed:
- `cloudflare-worker/src/index.js`
- `cloudflare-worker/src/pure.js`
- `cloudflare-worker/wrangler.jsonc`
- `cloudflare-worker/package.json`
- `cloudflare-worker/vitest.config.js`
- `cloudflare-worker/tests/streaming.test.js`
- `cloudflare-worker/README.md`
- `cloudflare-worker/.env.example`
- `.github/workflows/verify.yml`
- `.github/workflows/deploy-cloudflare-worker.yml`
- `.github/workflows/quality-check.yml`
- `tests/cors.test.js`
- `server.js` only for preserving the Cloudflare Pages origin in rollback/legacy CORS tests.

No HJ GROUPS Web frontend code was changed for listener compatibility; the existing `/listener/start`, `/listener/heartbeat`, and `/listener/end` calls remain compatible.

### VERIFIED — final runtime architecture

Final Worker routes:
- `/audio/message/:messageId`
- `/video/message/:messageId`
- `/document/message/:messageId`
- `/media-ticket/:type/message/:messageId`

Flow:
`Browser -> Worker -> access/ticket check -> R2 lookup -> HIT: R2 stream | MISS: Telegram Bot API -> temporary R2 object -> validated final R2 object -> R2 stream`

The Worker implementation:
- uses Web Crypto API only for HMAC/SHA-256;
- has no `node:` imports, `Buffer`, `fs`, `child_process`, or `@cloudflare/containers` in the target Worker source;
- uses the existing `MEDIA_CACHE` binding only;
- creates no new R2 bucket;
- does not implement Durable Objects, heartbeats, leases, or alarms;
- keeps listener endpoints as stateless `200 {"ok":true}` compatibility endpoints.

### VERIFIED — deterministic cache identity and safe writes

Whole-media keys include:
- media kind;
- `file_unique_id` when available, otherwise verified chat/message/kind identity;
- source size;
- version hash derived from content identity, Telegram `file_id`, MIME type, and DB update version.

Chunk keys include:
- content/episode id;
- chunk index;
- `file_unique_id`;
- chunk size;
- version hash.

Every R2 HIT checks:
- completion marker;
- object size;
- MIME type;
- media/chunk identity;
- version;
- R2 ETag;
- expected SHA-256 for chunk rows.

A mismatch is treated as a cache MISS, stale object is deleted, and a safe rewrite occurs.

Cache writes use a temporary `.tmp-<uuid>` key. The Worker validates the temporary object, promotes it to the deterministic final key, validates the final object, and only then serves it.

Concurrent identical MISS requests are intentionally idempotent. They may duplicate Telegram/R2 work, but a partial/unvalidated object is never served.

### VERIFIED — Range / HEAD / OPTIONS / seek behavior in integration tests

Worker test suite:
- **10 tests passed, 0 failed**
- real Cloudflare Workers test runtime with R2 binding
- latest successful integration execution was part of GitHub Actions deploy run **31** / run id **37781514620**
- the latest full verification run **179** / run id **37781514567** also completed successfully.

Covered and passed:
- first-request MISS;
- second-request HIT;
- Range / seek;
- `206`;
- exact `Content-Length`;
- `Content-Range`;
- `416` with `bytes */SIZE`;
- `HEAD`;
- `OPTIONS` / CORS;
- all three final media routes;
- missing media;
- oversized source without chunks;
- protected ticket creation and playback;
- expired ticket;
- wrong user;
- wrong user-agent;
- unauthorized protected media;
- corrupted cache object -> safe rewrite;
- deleted cache -> recreation;
- chunked full playback;
- chunk range inside one chunk;
- chunk range across boundary;
- seek into last chunk;
- only required chunk fetch for a ranged request;
- corrupted chunk cache repair;
- missing Telegram chunk source;
- malformed chunk metadata.

The same latest verify run also passed:
- Worker dry-run;
- Worker containerless source guard;
- root legacy streaming tests.

### VERIFIED — chunked playback design, with live production dependency explicitly NOT VERIFIED

The Worker implements the Phase 4 schema contract:
`episode_chunks(episode_id, idx, telegram_file_id, file_unique_id, size, sha256)`

Rules enforced by Worker code:
- contiguous `idx = 0..n-1`;
- each chunk `<=19 MB`;
- authoritative `telegram_file_id`;
- authoritative `file_unique_id`;
- positive verified size;
- 64-character SHA-256;
- logical Content-Length is the sum of chunk sizes;
- requested byte range maps only to intersecting chunks;
- each chunk is cached independently in R2;
- chunk SHA-256 is attached to R2 upload metadata/checksum verification where supported.

Oversized source without chunk metadata:
- explicit HTTP `413`;
- JSON `{"error":"TELEGRAM_FILE_TOO_LARGE","hint":"needs_split"}`;
- Worker does not pretend it cached the source.

**Production chunk data status: NOT VERIFIED.**
The live HJ Web Supabase database currently has no `episode_chunks` table/schema available to the Worker. Therefore real >20 MB chunked playback is intentionally blocked until Phase 4 creates/populates the authoritative chunk mapping.

### VERIFIED — R2 lifecycle cleanup

Existing bucket:
- `hj-groups-media`

No additional bucket was created.

Live Cloudflare lifecycle configuration was updated with exactly:
- rule id: `streaming-cache-2d`
- prefix: `streaming-cache/`
- delete after: **172800 seconds = 2 days**

Live GET verification confirmed the rule.

Existing unrelated lifecycle rules were preserved and not modified.

Deleted cache object = normal MISS; the next play recreates the object from Telegram.

### VERIFIED — production Worker control-plane cutover

The production Worker `hj-telegram-streaming` was uploaded directly through the Cloudflare Worker Script Upload API after preserving existing secrets and the existing `MEDIA_CACHE -> hj-groups-media` binding.

Deployment evidence:
- deployment id: `bc5e771d1024474aa298605194cdc401`
- entry point: `index.js`
- modules enabled;
- `compatibility_flags: []` after cutover;
- `MEDIA_CACHE` binding remains `hj-groups-media`;
- old `MEDIA_LISTENER` Durable Object binding is absent after cutover;
- Cloudflare exports reconciliation reports `MediaListener` as deleted.

Important distinction:
- the `MediaListener` deleted export is only the Cloudflare control-plane tombstone required to retire the previously provisioned namespace;
- there is no Durable Object implementation/binding in the new runtime.

### NOT VERIFIED — live HTTP/media end-to-end

A live authenticated media play against the new Worker has **not** been marked VERIFIED.

Reason:
- no production media/file_id was fabricated or forced for testing;
- live `episode_chunks` mapping is not yet available;
- a real browser-level authenticated stream/seek test against production was not completed in this phase.

Therefore production control-plane deployment is VERIFIED, but live user-facing media E2E remains NOT VERIFIED.

## 13. Remaining issues / blockers

P0:
1. HJ Web Phase-2 implementation is now present in open PR #9, but `main` and live Pages production still use the legacy container path until preview acceptance and merge.
2. Live user-facing streaming E2E against `hj-telegram-streaming.hilalaha1233203.workers.dev` is NOT VERIFIED.
3. The live HJ Web Supabase database still lacks the authoritative `episode_chunks` table, so >20 MB real chunked playback remains Phase 4 work.
4. GitHub Actions does not currently have `CLOUDFLARE_API_TOKEN` configured, so repository auto-deploy remains unavailable. Cloudflare Pages Preview was deployed directly through the Cloudflare control plane for PR #9; production was not promoted.

P1:
5. HJ Web production endpoint E2E and remaining live authenticated flows still need verification.
6. Supabase Preview migration-history reconciliation remains pending.
7. HJ GROUPS OF FILES `telegram_media_index` still covers only a small subset (24 rows) compared with 950 HJ Web episodes; no bulk mapping was fabricated.
8. Legacy Node/hosting compatibility code remains in the repositories and should be removed only after verified final cutover, not during this Phase 3 surgical migration.
9. No Episode Analytics code/migration was changed in Phase 3.

## 14. Files changed for Phase 3

HJ-Telegram-Streaming:
- `cloudflare-worker/src/index.js`
- `cloudflare-worker/src/pure.js`
- `cloudflare-worker/wrangler.jsonc`
- `cloudflare-worker/package.json`
- `cloudflare-worker/vitest.config.js`
- `cloudflare-worker/tests/streaming.test.js`
- `cloudflare-worker/README.md`
- `cloudflare-worker/.env.example`
- `.github/workflows/verify.yml`
- `.github/workflows/deploy-cloudflare-worker.yml`
- `.github/workflows/quality-check.yml`
- `tests/cors.test.js`
- `server.js` (Cloudflare production-origin compatibility only)

Canonical migration status:
- HJ Web `HJ-MIGRATION-STATUS.md` updated with this Phase 3 evidence.
- No HJ GROUPS Web Episode Analytics files/migrations were changed.

## 15. Qualification

Overall status: **PARTIALLY VERIFIED — PHASE 2 IMPLEMENTED IN PR #9 + PHASE 3 WORK COMPLETED; USER PREVIEW ACCEPTANCE / PRODUCTION CUTOVER / LIVE MEDIA E2E / PHASE 4 DATA STILL BLOCKED**

VERIFIED:
- Phase 3 Worker source implementation;
- deterministic R2 keys;
- R2 HIT validation;
- safe temporary-write/promotion flow;
- Range/206/416/HEAD/OPTIONS/seek behavior in real Worker integration tests;
- ticket expiry/user/user-agent checks in real Worker integration tests;
- oversized-without-chunks safe error;
- chunked playback logic against test fixtures;
- listener compatibility without state/DOs;
- structured observability logs;
- containerless source guard;
- Worker dry-run;
- 10/10 Worker integration tests;
- production Cloudflare Worker control-plane deployment;
- R2 `streaming-cache/` 2-day lifecycle rule;
- removal of the old production `MEDIA_LISTENER` binding.

NOT VERIFIED:
- final PR-head GitHub lint/unit-test run after the final one-line Web Push cleanup;
- browser/live HTTP smoke tests against HJ Web Preview;
- final HJ Web production containerless cutover / removal of live `HJ_WEB_BACKEND_URL`;
- live authenticated media stream/seek against the production Worker;
- real >20 MB chunked playback until Phase 4 creates/populates `episode_chunks`;
- full cross-repo production E2E after the HJ Web cutover.

Do not mark the overall HJ migration complete until the Phase 4 authoritative chunk mapping and the remaining live production E2E gates are cleared.
