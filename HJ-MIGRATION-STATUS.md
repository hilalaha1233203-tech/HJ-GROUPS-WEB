# HJ GROUPS — Migration Status / Review Patch

Date: 2026-10-08
Code verification checkpoint: `a291d482dea21d4b890019f15422fccd2faf4f9e`
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
- verified code commit: `a291d482dea21d4b890019f15422fccd2faf4f9e`
- previous status-document commit: `e9fc1d94498fa5fa76d84153bcad5695571d0b58`
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

Final PR-head GitHub Actions Quality Check: **run 1048 / run id 37795624866 — SUCCESS**. Lint, build, existing tests, Pages route checks, container guard, local Pages smoke, secret scan, and source sanity all passed on `a291d482...`.

### VERIFIED — Cloudflare Pages Preview deployment history

A preview for the same migration code path was successfully deployed:
- deployment id: **8d69fba2-b0cb-4d29-9983-1ac16fca1c78**
- preview URL: https://8d69fba2.hj-groups-web.pages.dev

### VERIFIED — latest final-head Preview deployment

Latest final PR head `a291d482dea21d4b890019f15422fccd2faf4f9e` deployment:
- deployment id: **f580bb08-cbc1-43e7-a358-6fcce015ea88**
- preview URL: https://f580bb08.hj-groups-web.pages.dev
- preview alias: https://phase2-containerless-pages-m.hj-groups-web.pages.dev
- build stage: SUCCESS
- deploy stage: SUCCESS
- Functions enabled.
- no production promotion was performed.
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
- browser/live HTTP smoke tests against final PR-head HJ Web Preview;


- final HJ Web production containerless cutover / removal of live `HJ_WEB_BACKEND_URL`;
- live authenticated media stream/seek against the production Worker;
- real >20 MB chunked playback until Phase 4 creates/populates `episode_chunks`;
- full cross-repo production E2E after the HJ Web cutover.

Do not mark the overall HJ migration complete until the Phase 4 authoritative chunk mapping and the remaining live production E2E gates are cleared.


## 16. Phase 2 corrective audit — TTS / Web Push (2026-10-12)

### VERIFIED — source-level findings and surgical patch

PR:
- https://github.com/hilalaha1233203-tech/HJ-GROUPS-WEB/pull/9
- Branch: `phase2/containerless-pages-migration-20261008`
- Patch commit containing health/TTS changes: `39b1e076f33e7a84329957abddedaabd7586593e`
- Test commit: `d34859ce084f26a9c5608bb44f33423dea262d04`
- GitHub Actions Quality Check run #1055 / id `38234586990` was IN PROGRESS at this checkpoint. Test result is NOT VERIFIED until the run completes successfully.

Changes limited to PR branch:
- `functions/[[path]].js`: `ttsConfigured` now follows `healthTts().sarvam.configured`, instead of a hard-coded `true`.
- `functions/_lib/tts.js`: Edge TTS response keeps structured code `EDGE_TTS_NOT_MIGRATED` and now explains the two honest options: use Sarvam with `SARVAM_API_KEY`, or explicitly retain/test the Edge route on the legacy backend. Sarvam provider failures now include `SARVAM_TTS_REQUEST_FAILED`.
- Added `tests/unit/pagesTtsWebPush.test.mjs`: tests health configuration flags, structured Edge/Sarvam missing-config responses, mocked Sarvam provider contract, mocked authenticated subscription/preferences writes, and the explicit Web Push delivery pending code.
- Tests mock external provider/PostgREST requests. They do NOT write to the real Supabase database or call the real Sarvam API.

### TTS capability matrix

| Capability | Evidence | Status |
|---|---|---|
| `/health` accurately reports Sarvam configuration | Hard-coded true removed; new unit test added | CI result pending at this checkpoint |
| `/api/tts` with Sarvam | Requires secret `SARVAM_API_KEY`; route sends documented request shape and returns audio on successful provider response; unit test uses a mocked provider | Source-level implementation present; real Sarvam audio NOT VERIFIED |
| `/api/edge-tts` on Pages | Handler intentionally returns HTTP 503 + `EDGE_TTS_NOT_MIGRATED`; no Microsoft WebSocket client is implemented in the Pages route | VERIFIED as intentionally unavailable in this branch; actual Microsoft WebSocket compatibility in Workers NOT VERIFIED |
| Legacy Edge TTS | Legacy Node source has a separate Edge TTS implementation | Live Voroa audio playback NOT VERIFIED in this phase |
| Fallback behavior | Frontend falls back to the browser's native speech implementation when online TTS fails | Source-level behavior only; live browser voice availability depends on user's device and NOT VERIFIED |

User decision (2026-10-12): keep Edge TTS through the HJ_WEB_BACKEND_URL-backed legacy bridge temporarily; Sarvam can be used when configured and successful, with Edge fallback. This is transitional only; Edge is NOT migrated to Pages itself, and the legacy dependency must be removed before final runtime sign-off.

### Web Push capability matrix

| Capability | Evidence | Status |
|---|---|---|
| Public VAPID config endpoint | `GET /api/push/config` returns `configured` based on `WEB_PUSH_VAPID_PUBLIC_KEY` | Source-level verified; live configuration currently reported false by user-provided Preview response |
| Subscription and preference storage handlers | Pages routes authenticate user and issue PostgREST writes to `web_push_subscriptions` and `web_push_preferences`; new tests mock both writes | Mock test pending CI; live Supabase persistence NOT VERIFIED because project is quota-restricted |
| Admin notification delivery | Route explicitly returns HTTP 503, code `WEB_PUSH_SEND_NOT_MIGRATED` | VERIFIED from source; feature is NOT migrated |
| VAPID / Workers-compatible delivery implementation | No Pages delivery implementation. A Workers-compatible Web Push sender using Web Crypto (or another proven Workers-compatible implementation) plus public/private VAPID key configuration is still required | NOT IMPLEMENTED; requires separate scoped change and tests |

No VAPID keys were added. No real subscription was written. No real notification was sent.

### Regression table — legacy production vs PR #9

The source repository shows legacy implementations, but live production behavior was not exercised in this phase. Therefore "works now" is NOT VERIFIED unless a live result is supplied; source presence is not proof of live behavior.

| Feature | Works on live Voroa now? | After PR #9 merge? | Evidence / decision |
|---|---|---|---|
| Edge Neural TTS | NOT VERIFIED — legacy handler exists, but no live audio test in this phase | CONDITIONAL — routes through legacy backend only when HTTPS `HJ_WEB_BACKEND_URL` is configured; with no URL, Pages returns `503 EDGE_TTS_NOT_MIGRATED` | Temporary compatibility bridge; actual audio remains NOT VERIFIED |
| Sarvam TTS | NOT VERIFIED — no live provider request in this phase | CONDITIONAL — requires `SARVAM_API_KEY` on the selected backend and a successful provider request; the legacy `/api/tts` auto route falls back to Edge when appropriate | No key was supplied and no real Tamil/English audio test was performed |
| Web Push subscription/preferences storage | NOT VERIFIED live; legacy source and SQL schema exist | CONDITIONAL — route code is present, but requires working Supabase API/schema and VAPID public key; live storage blocked by current Supabase quota restriction | Retest authenticated subscribe/status/preferences after quota is restored |
| Admin Web Push delivery | NOT VERIFIED live; legacy `server/webPush.mjs` contains sender logic | NO — explicit `503 WEB_PUSH_SEND_NOT_MIGRATED` | Must approve a separate Workers-compatible delivery implementation or accept the loss |
| Other Phase 2 features | NOT classified as regressions by this TTS/Web Push audit | NOT VERIFIED here | Existing PR promotion gates remain; do not infer complete feature parity from this focused audit |

### Safety / phase gate

- PR #9 remains OPEN and UNMERGED at this checkpoint.
- `main`, production Pages settings, production Supabase, Voroa, Telegram session and media were not modified by this patch.
- Episode Analytics was not modified.
- No production database writes, real TTS provider calls, VAPID setup or notification sends were performed.
- Phase 4 remains BLOCKED until PR #9 is merged and user-approved production cutover gates are satisfied.
- Overall status for this corrective patch: IMPLEMENTED IN PR BRANCH; CI AND LIVE RUNTIME VERIFICATION PENDING.


## 17. Edge TTS compatibility qualification (2026-10-12)

Official Cloudflare documentation was checked:
- https://developers.cloudflare.com/workers/examples/websockets/
- https://developers.cloudflare.com/workers/reference/protocols/

Cloudflare documents outbound WebSocket connections from Workers. Therefore this project must NOT claim that WebSockets are inherently unsupported by Workers.

Verified from the existing legacy source:
- `server/edgeTts.mjs` imports `ws` and `node:crypto`, and uses `Buffer` operations.
- The Pages implementation currently does not port this client; `/api/edge-tts` returns the structured `EDGE_TTS_NOT_MIGRATED` response without attempting an outbound connection.
- The new test verifies this intentional, explicit route behavior. It does NOT establish that Microsoft Edge TTS can or cannot successfully complete its provider-specific handshake from Workers.

Status:
- Workers outbound WebSocket capability: VERIFIED against official documentation.
- Microsoft Edge TTS end-to-end handshake/audio in Pages Functions: NOT VERIFIED — needs a dedicated provider-compatible port and live test; do not implement/declare migrated based on protocol support alone.
- Quality Check #1055 / run id `38234586990`: SUCCESS for the first corrective test commit `d34859ce084f26a9c5608bb44f33423dea262d04`.
- Later wording/test refinements are on the PR branch; their final CI run must be checked before this corrective phase can be called CI-verified.

No production runtime or external TTS endpoint was called for this qualification.
## 18. User-approved TTS and Web Push transition decisions (2026-10-12)

### TTS — temporary Edge route accepted, Sarvam optional

User decision:
- Keep existing Edge TTS available through the configured legacy backend temporarily because no Sarvam API key is currently available.
- If Sarvam is configured and actually succeeds, allow the existing legacy /api/tts auto-provider behavior to use it; otherwise Edge remains the fallback.
- This is a temporary migration bridge, NOT approval to retain an always-on legacy backend in the final website architecture.

PR #9 branch changes:
- Added a narrow HTTPS-only bridge in functions/_lib/tts.js; /api/tts, /api/edge-tts, and /api/sarvam-tts use HJ_WEB_BACKEND_URL only when that setting is present.
- /api/tts calls the legacy backend's existing auto-provider route. The legacy source already tries configured Sarvam according to its provider strategy and can fall back to Edge when Sarvam is unavailable/fails.
- With no HJ_WEB_BACKEND_URL, no proxy is attempted: Pages keeps its local Sarvam configuration check and explicit EDGE_TTS_NOT_MIGRATED response.
- /health now distinguishes the legacy bridge being configured from a live-verified provider. legacyBackend.liveVerified remains false.
- Added mocked tests for the three proxy routes and health reporting. They do not contact the actual backend or Microsoft/Sarvam endpoints.
- GitHub Actions Quality Check run #1066 (`38235388474`) on code/test commit `4c54fedfc80d05f9c1b765a343dee0074bf31a2d`: SUCCESS. Lint and production build passed; all 140 unit tests passed, 0 failed, including the new legacy bridge and health tests. The later status-document-only commit records the approved decision and does not change source code.

Status:
- Proxy source and mocked test coverage: implemented on PR #9 branch.
- Real Edge audio through the configured HTTPS backend: NOT VERIFIED here.
- Real Sarvam audio: NOT VERIFIED; no SARVAM_API_KEY was supplied/configured for this task and no provider request was made.
- Production or Preview environment settings were not changed. The Preview environment must have an appropriate HJ_WEB_BACKEND_URL to exercise this transitional bridge; do not add/change that setting without explicit operational approval.
- Before final legacy-backend retirement, the bridge must be replaced by a tested Workers-compatible Edge client or another explicitly approved provider and removed from the final runtime dependency chain.

### Edge TTS cost/reliability qualification

The existing open-source Edge TTS clients use Microsoft's consumer Edge Read Aloud service without an Azure/Sarvam API key (examples: https://github.com/travisvn/edge-tts and https://github.com/DejavuMoe/edgeTTS). This makes it available without a separate TTS API charge in the current implementation, but it is an undocumented consumer endpoint rather than a guaranteed developer API with an SLA. Upstream protocol changes, throttling, or blocking can break it; do not describe it as guaranteed free forever or production-SLA-backed. Source projects are independent of Microsoft and do not establish an official Microsoft service commitment.

### Web Push — delivery migration approved, not implemented by this TTS patch

User approved completing notification delivery later with a Workers-compatible implementation. This approval is scoped to the migration work; it does not authorize sending a real notification now or creating/changing VAPID secrets in production.

Current status:
- Subscription/preferences route tests remain mocked only; live Supabase writes are NOT VERIFIED.
- Admin notification delivery still returns 503 WEB_PUSH_SEND_NOT_MIGRATED.
- Workers-compatible delivery (including VAPID signing with Web Crypto or another tested compatible method), public/private key configuration, expiry handling, and test notifications are NOT IMPLEMENTED.
- No VAPID keys were created, changed, or exposed; no real subscription or notification was sent.

Safety and phase gates:
- PR #9 remains unmerged; no production Pages settings, Supabase data, Voroa, Telegram session/media, or Episode Analytics were changed by this patch.
- All newly added upstream/backend calls are represented in mocked tests only until a controlled preview/live verification is approved.
## 19. Phase 5U — Cover image egress migration (2026-10-12)

### VERIFIED — read-only Supabase Storage snapshot

Project: `yajkfglagnyvenddyvok`.
All SQL queries in this audit were SELECT/read-only. No production database writes, Storage uploads, or Storage removals were run.

Bucket summary from `storage.objects` and `storage.buckets`:

| Bucket | Objects | Stored size | Use / decision |
|---|---:|---:|---|
| `story-covers` | 13 | 12.95 MiB (about 13,581,971 bytes) | Cover source bucket; this is the only bucket in scope for cover migration |
| `audio` | 2 | 44.18 MiB | Media content, explicitly out of scope; not downloaded or changed |
| Total for these buckets | 15 | about 57.13 MiB | Stored size is not egress usage |

The 13 cover objects listed and measured by the read-only query are recorded in `tools/cover-source/README.md`. Four current `public.stories.cover_url` values wrap four larger PNG cover URLs (the original-image total is about 10.33 MiB). `public.stories` had 4 rows at the time of this query; `public.books` and `public.video_stories` had 0 rows. No data column was modified.

Decision qualification: 12.95 MiB of stored cover objects does not establish that covers caused the Supabase 42.5 GB cached-egress quota. In the queried 24-hour `2026-10-11T10:20:00Z` to `2026-10-12T10:20:00Z` window, `edge_logs` had 8,113 rows but no rows matched `/storage/v1/object` or `story-covers`; `storage_logs` had 3 rows and none evidenced image downloads. This query window does not prove that no cover traffic occurred. The same `edge_logs` query window contained 3,991 GETs to `/rest/v1/episodes` returning 402, 3,980 GETs to `/rest/v1/web_push_dispatch_state` returning 402, and 43 `/realtime/v1/websocket` GETs returning 402. These are candidate troubleshooting areas, not evidence that those failed requests caused 42.5 GB. Historical cached object traffic, other media/buckets, other API payloads, Realtime and traffic outside the log window remain unmeasured.

### VERIFIED — code changes on the stacked Phase 5U branch / PR

PR: https://github.com/hilalaha1233203-tech/HJ-GROUPS-WEB/pull/10
Branch: `phase5u-cover-assets-20261012`.
Base branch is the still-open Phase 2 PR branch `phase2/containerless-pages-migration-20261008`. The Phase 5U branch was reconciled with PR #9 latest head `4dd122eb655023c0ae064acae47b130f94c51229` by merge commit `81b3864f65e0276638a94299658e331fb106f75d`. PR #9 is still open and unmerged. PR #10 remains draft and unmerged.

Implemented on the PR branch:
- Shared `src/components/CoverImage.jsx` + `src/lib/coverAssets.js` resolve known source URLs against the static manifest, unwrap old `wsrv.nl` URLs, use responsive `srcSet`/`sizes`, lazy-load catalogue covers (eager-load the hero), and fall back to the direct original URL and then a local SVG placeholder.
- Replaced all 16 `src/App.jsx` cover render sites and all remaining cover preview tags in `src/AdminPanel.jsx`; the current inspection found 0 direct story/book/video cover `<img>` expressions remaining in `src/AdminPanel.jsx`.
- Removed the external `wsrv.nl` transformation from `src/lib/storageUpload.js` and removed catalog URL rewriting through that transformation in `src/lib/telegramContent.js`.
- Added immutable cache headers for static `/covers/*` and a short cache for `/cover-manifest.json` in `public/_headers`.
- Added offline `scripts/optimize-covers.py` to make SHA-256 content-hashed 400px/800px WebP variants, preserve aspect ratio/orientation/transparency, target thumbnails <=80 KiB and large images <=2 MiB, and update both source and public manifests. The script refuses to generate output until all 13 expected originals are present and prints per-file measurements. Downloaded originals are gitignored.
- Added GET/HEAD `/api/covers/{hash}-400.webp` and `-800.webp` restricted to validated hashed WebP keys, and authenticated `/api/admin/covers/upload` for new uploads into a separate `COVERS_BUCKET` binding. The route only uses a public Supabase Auth key to validate `app_metadata.role=admin`; no service-role key is sent to the browser. The interim Pages route responds with immutable cache headers and does not proxy to Supabase Storage.
- New cover uploads are converted in-browser to WebP before POSTing the two variants. Only `bucket === 'story-covers'` uses the new path; existing audio/book/video-file upload behavior was not redirected.
- Added unit tests for manifest hits/misses, legacy URL unwrapping, fallback/placeholder, safe hashed-key routing, cache headers, admin authorization, mocked R2 variant writes and invalid custom-domain rejection.

CI evidence: Quality Check #1081 (`38239348824`) on commit `d904fb9d9482587b01bc8ba9953260ac593be970` completed SUCCESS. Lint, production build, Pages route smoke, Python script syntax and source/security checks passed. Test log reported `# pass 152`, `# fail 0`. This does not constitute real browser playback, real asset conversion, real R2 upload, or deployed Preview verification.

### VERIFIED — Cloudflare configuration safety

- Dedicated R2 bucket `hj-groups-covers` was created on 2026-10-12 and is separate from existing `hj-groups-media`; the cover bucket still has no uploaded cover objects.
- Pages project `hj-groups-web` Preview configuration has `COVERS_BUCKET -> hj-groups-covers`; production R2 binding remains empty. A read-after-write project config comparison confirmed Production's full deployment config object was unchanged by the Preview-only binding change. Existing Production environment keys and `HJ_WEB_BACKEND_URL` remain unchanged.
- No custom DNS zone/domain is present in the connected Cloudflare account. Do not use `r2.dev` for production; Cloudflare documents it as rate-limited. Until a user-owned custom domain is configured, new covers use the safe interim Pages Function path `/api/covers/*`. This incurs a Worker/Pages Function request per image miss/request and must be assessed against Free-tier request limits.

### NOT VERIFIED — existing cover binaries, egress savings, real upload and deployment

- `src/lib/cover-manifest.json` and `public/cover-manifest.json` currently contain an empty `covers` object. The 13 source images could not be downloaded or read by the current execution environment because outbound DNS resolution to Supabase failed; no conversion was run and no generated `.webp` files are in the repository. Do not claim that the existing covers have been migrated or optimized yet.
- Real image bytes and cold/warm measurements on the home page and a story page: NOT VERIFIED. No browser Network capture, `curl`/`curl -I` output, deployed cache hit or real response byte count was available. Code/CI test output is not a substitute for those measurements.
- Real preview render on mobile and desktop, fallback against a real broken URL, immutable HTTP response headers, and actual R2 admin upload: NOT VERIFIED. Tests mocked R2 and fetch.
- A new Pages deployment for `phase5u-cover-assets-20261012` is NOT VERIFIED. The Cloudflare deployment list only contains older Phase 2 previews (including `22bec75a`, commit `fda6f6d17d96669f1f8d5182cea1d16742c99d0e`); that URL is stale and must not be represented as the Phase 5U preview. PR #10 remains draft.
- Actual post-conversion byte savings and actual egress reduction: NOT VERIFIED until the user-provided originals are converted and real page bytes measured.

### Exact next steps / promotion gate

1. From Supabase Dashboard for project `yajkfglagnyvenddyvok`, go to Storage → Files → `story-covers` → `stories`, download only the 13 files listed in `tools/cover-source/README.md`, preserving filenames into `tools/cover-source/stories/`. Do not download the `audio` bucket. If quota blocks download, resolve access through the dashboard after quota/API recovery; do not run a Storage delete or change the production DB.
2. On Windows PowerShell at the repo root, run `py -m pip install --user Pillow` then `py scripts/optimize-covers.py`. Review the printed original and output bytes for each file. Commit only `public/covers/*.webp` plus the two generated manifests to this branch; never commit originals. Re-check Pages asset count (<20,000) and every asset (<25 MiB). The expected 26 WebP variants are not present until this step succeeds.
3. Wait for Quality Check on the updated PR head to finish. Cloudflare Dashboard → Workers & Pages → `hj-groups-web` → Deployments/Builds: verify a deployment whose branch is `phase5u-cover-assets-20261012` and whose commit SHA equals the current PR #10 head. If missing, check Settings → Builds → Git integration/preview deployment automation (`all`) and trigger/retry only the new Phase 5U branch deployment. Do not reuse the stale Phase 2 Preview URL as evidence.
4. Open the real Phase 5U Preview on desktop and mobile. Test manifest hit (one of the four real PNG covers), manifest miss (a URL not in manifest still tries its direct original), intentionally broken URL (placeholder), story-detail page and home list. In Chrome DevTools Network with cache disabled, record all image URL/status/Transferred+Resource size on cold load, then reload with cache enabled and record warm transfer. Use a separate fresh browser/session if needed; do not guess bytes. Compare home vs story page with screenshots/network output.
5. Check `curl -I https://<preview-host>/covers/<real-hash>-800.webp` for `200`, `image/webp`, `Cache-Control: public, max-age=31536000, immutable`, and the same URL again for cache behaviour; check `GET` + `HEAD`/404. Do not issue a test cover upload until authenticated Preview upload is explicitly tested in the browser with an approved image. Verify it creates only two objects in the separate `hj-groups-covers` bucket and returns no Supabase Storage URL.
6. The current account has no custom domain/zone. To switch new cover uploads to direct R2 delivery, first configure a user-owned domain in Cloudflare, then R2 → `hj-groups-covers` → Settings → Custom Domains → connect `covers.<your-domain>` and wait for active. Only then set the Preview-only `COVER_PUBLIC_BASE_URL=https://covers.<your-domain>` and test again. Do not use `r2.dev` for production. Keep Production settings unchanged until the user approves a separate production cutover.
7. Only after existing static assets are generated, current-head CI passes, a real Phase 5U Preview is deployed and the user accepts all tests should PR #10 be changed from draft and reviewed. Do not merge PR #10 or PR #9, and do not promote Production without explicit user approval.

Safety ledger: NO production database writes; NO Storage object uploads/deletes; NO production Pages setting changes; NO Episode Analytics changes; NO Telegram session/media changes; NO `hj-groups-media` binding changes. Preview-only `COVERS_BUCKET` binding and separate bucket creation are the only Cloudflare configuration/resource changes in this phase.

## 20. Phase 5U latest-head verification and audio request guard (2026-10-13)

### VERIFIED — PR and Preview control-plane evidence

Repository: `hilalaha1233203-tech/HJ-GROUPS-WEB`  
PR: https://github.com/hilalaha1233203-tech/HJ-GROUPS-WEB/pull/10  
Branch: `phase5u-cover-assets-20261012`  
Code-bearing verification head before this status-only commit: `789a1380ebc8cd1e636a1e05782c70fa2c6b3fe7`

- PR #10 remains **OPEN / DRAFT / UNMERGED**, stacked on the still-unmerged Phase 2 branch. Do not merge #10 before #9.
- Cloudflare Pages project `hj-groups-web` reports the Git repository source enabled, preview deployment setting `all`, and preview branch include pattern `*`.
- A Preview deployment exists for the exact code-bearing head above:
  - Deployment ID: `849ff315-ec49-4bfb-9037-dec69b60a0c7`
  - Preview URL: https://849ff315.hj-groups-web.pages.dev
  - Branch alias returned by Cloudflare: https://phase5u-cover-assets-2026101.hj-groups-web.pages.dev
  - Cloudflare deployment check: SUCCESS at 2026-10-13 05:37:08 UTC.
  - Build log: Vite `✓ built in 905ms`; Wrangler compiled the Functions Worker successfully; Cloudflare reported `Success: Your site was deployed!`.
- This is a real Pages deployment/build record, not evidence that page images, live storage, HTTP headers, or authenticated upload were tested.
- The same Cloudflare check query returned no separate GitHub Actions Quality Check run for the latest SHA. The earlier Quality Check #1082 belongs to the prior commit `d75e6f85f9b9135046556ec50f182cc33071ed62` and must not be reported as tests for the current head. Latest-head full test suite / new source guards: **NOT VERIFIED**. Manually run Actions → Quality Check → Run workflow → select `phase5u-cover-assets-20261012`. The cover asset gate is expected to fail until the actual 26 generated files are committed.

### VERIFIED — committed cover inventory on the code-bearing head

A read-only Git tree query for `789a1380ebc8cd1e636a1e05782c70fa2c6b3fe7` returned 209 tree entries and:

- `public/covers/*.webp`: **0 files**.
- `tools/cover-source/stories/*`: **0 tracked original binaries**.
- `src/lib/cover-manifest.json`: `{"version":1,"covers":{}}`.
- `public/cover-manifest.json`: `{"version":1,"covers":{}}`.
- `.gitignore` excludes downloaded source originals under `tools/cover-source/*` (while retaining the README and `.gitkeep`).

Therefore the 13 originals have **not** yet been converted/committed in this branch. It is NOT VERIFIED that the requested 26 WebP files, per-file measurements, or 13-source manifest exist. The updated `scripts/verify-cover-assets.mjs` now checks the exact 13 filenames, identical manifests, 26 referenced WebP files, no unreferenced WebP files, thumbnail <=80 KiB, large variant <=2 MiB, Pages <=25 MiB/file, Free-plan <=20,000 files, and no tracked source originals. Its expected file list was checked against `tools/cover-source/README.md`. The guard cannot pass while the manifests/assets remain empty.

Official Cloudflare limits checked 2026-10-13:
- Pages Free: maximum 20,000 files per site; individual site asset <=25 MiB: https://developers.cloudflare.com/pages/platform/limits/
- Pages Function requests count against the Workers Free shared limit of 100,000 requests/day; requests that are served as static assets without invoking Functions are free/unlimited: https://developers.cloudflare.com/pages/functions/pricing/
- Production R2 delivery should use a user-owned custom domain; `r2.dev` is rate-limited and intended for development: https://developers.cloudflare.com/r2/buckets/public-buckets/

### IMPLEMENTED IN BRANCH — source URL and audio-load protections (test execution NOT VERIFIED)

Code-bearing commits:
- `77f6ad69ff356ecbadd2b66eb4d8e3b4efca786f` — audio URL selection/preload change and source guards.
- `789a1380ebc8cd1e636a1e05782c70fa2c6b3fe7` — exact 13-path cover inventory correction in the verification script.

Changes:
- Existing episode `<audio>` now sets `preload="none"`; default `audioAutoplay` is false. The separate video player is unchanged. TTS uses a different generated Blob audio path after a TTS request; that is not either of the two Supabase Storage audio objects.
- `src/lib/telegramContent.js` now prioritizes the Cloudflare Streaming Worker route when an episode has a Telegram message ID. Audio source selection refuses to fall back to a Supabase Storage object URL; an asset without a verified Cloudflare/non-Supabase source can therefore fail playback rather than silently re-download from Storage. This is intentional safety behavior, not a claim that every legacy audio asset is now routable.
- `public/hj-push-sw.js` contains Web Push event handling only; no audio fetch/preload behavior was found. `index.html` has no audio preload/prefetch link. No hard-coded request for either of the two unknown `audio` object keys was found. The exact two stored filenames and their catalogue references remain **NOT VERIFIED** because no production DB query or Storage object download was authorized/performed.
- The generic `uploadFileToBucket('audio', ...)` path in `src/lib/storageUpload.js` still uses Supabase Storage for new uploads and asks for `cacheControl: '3600'` (one hour). This is a remaining migration blocker for any audio uploads that do not have an established Worker/R2 route; do not use that path for new public audio until a Cloudflare destination and URL/metadata contract are verified and approved.
- New `scripts/check-cover-source-urls.mjs` scans runtime source for hard-coded Supabase Storage object URLs and fails on `wsrv.nl` references except the single documented legacy URL un-wrapper in `src/lib/coverAssets.js`. It also prevents Supabase URLs in manifest `src`/`srcSet` and allows the original story-cover URL only as a matching `originalUrl` fallback. The new scripts/tests were committed, but their execution on the latest head is **NOT VERIFIED** until Quality Check is run.

### NOT VERIFIED — HTTP headers, browser and egress measurements

The execution environment could not resolve these hostnames when attempting `curl -I`: the current Preview, production Pages hostname, and the Supabase hostname. This records a DNS limitation of that execution environment; it does not prove the public sites are down.

- Latest-preview HTTP `Cache-Control`, `Content-Type`, `Content-Length`, 404 behavior and cache-hit headers: **NOT VERIFIED**.
- Actual manifest hit/miss and broken-image placeholder in the deployed browser: **NOT VERIFIED**. Unit fixtures exist, but were not executed against a real manifest or deployed browser.
- Cold/warm image transfer bytes on home and a story page, desktop/mobile rendering, real authenticated admin upload producing exactly two variants in `hj-groups-covers`: **NOT VERIFIED**.
- Live audio-object `Cache-Control`/size, Supabase image/audio request referers, bot/hotlink traffic, cache-miss counts and reason for the reported ~700 downloads: **NOT VERIFIED / UNCONFIRMED**. The generator's empty manifest means old cover URLs are presently manifest misses and can use the original-URL fallback, which is a concrete route for continued Supabase requests; it does not prove this caused all reported downloads. The previous log window's repeated HTTP 402 catalog/push-state requests evidence an API retry/poll problem, not proof of Storage object traffic. `storageUpload.js`'s one-hour cache-control value applies to uploads created through that code path only; it is not evidence for the response headers of the two existing objects. Service-worker audio fetches and prefetch links were not found.
- Production Pages settings, live Supabase rows/objects, and bucket publicity were not changed. No DB query, Storage write/delete, R2 upload, or production promotion was performed.

#### Owner HTTP checks (run from PowerShell on a network that resolves the domains)

For the current Preview manifest and health endpoint:
```powershell
curl.exe -sS -I "https://849ff315.hj-groups-web.pages.dev/cover-manifest.json"
curl.exe -sS -I "https://849ff315.hj-groups-web.pages.dev/health"
```

For one existing cover:
```powershell
curl.exe -sS -I "https://yajkfglagnyvenddyvok.supabase.co/storage/v1/object/public/story-covers/stories/1788411106863-file_0000000014e882068f423cd2bef840db.png"
```

For each audio file, first copy its exact object key from Supabase Dashboard → Storage → Files → `audio` (do not guess the keys), then:
```powershell
$audioUrl = "https://yajkfglagnyvenddyvok.supabase.co/storage/v1/object/public/audio/<EXACT-OBJECT-PATH>"
curl.exe -sS -I $audioUrl
```
Record `Cache-Control`, `Content-Type`, `Content-Length`, `ETag` and any cache status header. For a converted cover, also test `curl.exe -sS -I "https://<current-preview-host>/covers/<real-sha256>-800.webp"`; the 26 files must actually exist first. Open the Preview in a logged-out desktop/mobile browser to compare cold-load/warm-reload Network transferred bytes for home and one story page. Never claim measurements without saving the actual outputs.

#### Preview admin-upload checklist (requires owner login; NOT VERIFIED)

1. Sign in as an admin in the current PR Preview and use one non-sensitive test cover image.
2. Confirm upload returns success and exactly two objects appear in the separate `hj-groups-covers` bucket: `*-400.webp` <=80 KiB and `*-800.webp` <=2 MiB.
3. Confirm both objects use `image/webp` and `public, max-age=31536000, immutable`, and returned URLs do not point to `supabase.co/storage`.
4. Do not perform this test against Production; do not delete any original Storage object.

### Interim Function-request cost and future R2 custom domain

- `/api/covers/*` uses a Pages Function and therefore shares the Workers Free allowance of 100,000 requests/day. Budget each request that reaches Function runtime as a counted request until deployed traffic measurements prove otherwise. By contrast `/covers/*` static assets do not invoke Functions and are free under the Pages static-asset rule. The no-domain interim route is therefore for Preview/controlled use; after existing cover WebPs are generated, the preferred route is static `/covers/` for those assets.
- After obtaining a user-owned domain and adding it as a Cloudflare zone in the same Cloudflare account: R2 → `hj-groups-covers` → Settings → Custom Domains → Add → enter `covers.<your-domain>` → Connect Domain → wait for Active. Then set/test `COVER_PUBLIC_BASE_URL=https://covers.<your-domain>` in Preview only. Verify real GET/HEAD, MIME, immutable cache headers and upload output before any Production change. Do not use `r2.dev` for production.
- Production bucket settings and the `audio` bucket must remain unchanged until paths are tested and the owner explicitly approves the exact change.

### PREPARED ONLY — reversible Supabase Storage privacy plan (DO NOT APPLY)

Apply only after the corresponding Cloudflare path is verified with real public traffic and owner gives an exact `APPROVED: ...` instruction.

1. Save the current settings and policies for `story-covers` and `audio`. Verify every catalogue cover resolves from the manifest/static `/covers/` or approved R2 path, and every public audio item resolves through the Cloudflare Worker/R2 route with Range/HEAD behavior where applicable. Verify the two legacy audio objects are accounted for individually.
2. For `story-covers` only, switch the bucket to Private in the Supabase Storage dashboard; remove/disable only public-read access that makes its objects public. Do not delete or rewrite objects/rows. Test all pages, admin upload, and cover fallback behavior.
3. Keep `audio` public until every legacy audio reference and new-upload path is proven to work through Cloudflare. Then, in a separate owner-approved step, make `audio` private and retest each item and seek/range behavior.
4. Expected breakage if done too early: direct `stories.cover_url`/legacy Supabase URLs, old clients, third-party hotlinks, and any audio source with no Worker/R2 mapping can start returning authorization errors. An empty manifest would send cover requests to the legacy original URL fallback and those requests will break after making `story-covers` private.
5. Rollback: in Supabase dashboard restore the original bucket Public setting and the saved public-read policy exactly as before; verify old direct links again. Do not delete objects. Rollback does not require DB writes.

Safety ledger for this checkpoint: no Episode Analytics changes; no production DB writes; no Supabase Storage object upload/delete; no Telegram session/media changes; no production Pages configuration change; no R2 upload; no merge or Production promotion.

#### Follow-on audio autoplay enforcement (2026-10-13)

Code commit: `1e2905e8c45d7a95973846661e30d2fed52cbf53`.

- The audio player no longer auto-advances to another episode, even if an old local/cloud setting still contains `audioAutoplay: true`. The Account Settings default is aligned to false and the old audio auto-next checkbox is replaced by a clear bandwidth note.
- Video autoplay behavior/settings remain unchanged.
- Manual source diff confirms this change is limited to the audio ended-handler and its account-settings presentation. Cloudflare Pages check returned **Deploy successful** for source commit `1e2905e8c45d7a95973846661e30d2fed52cbf53`, Preview `https://0d3f661f.hj-groups-web.pages.dev`, deployment ID `0d3f661f-eca5-49b3-b041-8b36c3bd6f04`. Its build log recorded `✓ built in 812ms`, `Compiled Worker successfully`, and `Success: Your site was deployed!`. This proves build/deploy only; real browser playback remains NOT VERIFIED. Production was not promoted.

#### Latest code-bearing Preview evidence (2026-10-13)

- Cloudflare confirmed deployment of audio preload/auto-next code commit `1e2905e8c45d7a95973846661e30d2fed52cbf53`: `0d3f661f-eca5-49b3-b041-8b36c3bd6f04`, URL https://0d3f661f.hj-groups-web.pages.dev, successful build log at 2026-10-13 05:40 UTC.
- An intermediate status-only commit `84813dbc603d69b100e0e33fff67f010830fdeb2` was deployed at `f9bff42a-f977-46d4-bf81-7ac9d5bf1f64`. The next status-record commit `f7a9751211660f7a6cf7b50b69ce8c09cb990452` was also deployed successfully: deployment `8ffc3442-3ff9-43c8-a7a6-818480c940a0`, URL https://8ffc3442.hj-groups-web.pages.dev, Cloudflare check SUCCESS. That status-only Preview does not add missing cover assets.
- No GitHub Actions Quality Check run was recorded for these latest code commits. Cloudflare's build is not a replacement for lint/unit/source-guard/asset-gate tests. Run the branch's Quality Check manually; the cover gate should block merge while the required 26 WebP files and manifests are absent.

#### Official limit confirmation refresh (2026-10-13)

Cloudflare's official documentation search was re-run for this checkpoint:
- Pages Free: **20,000 files per site**, individual asset **25 MiB** — https://developers.cloudflare.com/pages/platform/limits/ (documentation marked last updated 2026-09-05).
- Pages Functions count against Workers plan requests; Workers Free daily request limit is **100,000**, resetting at midnight UTC. Requests served as static assets without invoking a Function are free/unlimited — https://developers.cloudflare.com/pages/functions/pricing/ (last updated 2026-09-08) and https://developers.cloudflare.com/workers/platform/limits/.
- R2's `r2.dev` public development URL is rate-limited and is not intended for production. Production delivery should use a custom domain on a zone in the same Cloudflare account — https://developers.cloudflare.com/r2/buckets/public-buckets/ (last updated 2026-09-25).

These are official service-plan limits, not guarantees of free use forever. Cloudflare usage and product terms may change; re-check the account dashboard before production cutover.

