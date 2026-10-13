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


## 19. Phase 2 TTS/Web Push decision patch — final runtime qualification (2026-10-13)

This section supersedes earlier TTS capability statements in Sections 16–18 where the earlier provider viability was still untested. It records branch/CI/probe evidence separately from Preview, production and device testing.

### Git / CI evidence

- Target: PR #9 branch `phase2/containerless-pages-migration-20261008`; PR #9 remains OPEN, UNMERGED, based on `main`.
- Code/test head verified before this status-only update: `58e50b664ac4db1a4509e580719ff4e446d28dfb`.
- Quality Check **#1106**, run ID `38262539588`, completed **SUCCESS** on that head. Job steps passed: dependency audit, lint, production build, unit tests, migration filenames, startup exports, Pages routes manifest, no-container production-path guard, Pages route smoke, frontend secret scan, auth/settings sanity, appearance/security-monitoring sanity and final source sanity. Run: https://github.com/hilalaha1233203-tech/HJ-GROUPS-WEB/actions/runs/38262539588
- Real outbound Edge TTS probe **#17**, run ID `38262539570`, completed **SUCCESS as a negative viability test**. The success result means the probe correctly classified the rejection; it does not mean Edge TTS audio works. Actual output:
  `{"classification":"not_viable_current_workers_handshake","httpStatus":502,"ok":false,"code":"EDGE_TTS_HANDSHAKE_FAILED","upstreamStatus":403,"bytes":0,"voice":"ta-IN-PallaviNeural","runtime":"wrangler-dev-local-workers-runtime"}`
  The Microsoft consumer endpoint rejected the handshake with HTTP 403, and no audio bytes were returned. Run: https://github.com/hilalaha1233203-tech/HJ-GROUPS-WEB/actions/runs/38262539570
- Quality Check/negative-probe evidence above verifies CI and the probe on the code head. It does not verify an actual Cloudflare Pages Preview, production route, or device speech voices.

### TTS behavior implemented on the PR #9 branch

- `POST /api/tts` requires a signed-in Supabase user, validates text, and defaults to `TTS_MAX_CHARS=2000` (hard code ceiling 10,000 characters).
- Daily per-user quota defaults to `TTS_DAILY_LIMIT=30`. The counter uses conditional writes and reads in the already-existing `MEDIA_CACHE` R2 binding under `tts-usage/`; it adds no PostgREST table/read for quota tracking. R2 operations are still metered.
- Audio key: SHA-256 of the normalized text, chosen voice and format; object prefix `tts/`. HIT returns cached MP3; MISS tries each configured provider once, validates MP3, writes to R2 and responds. Cached/ranged audio advertises `audio/mpeg`, `Content-Length`, `Accept-Ranges`, 206 + `Content-Range`, and 416 for invalid ranges.
- Provider secret names recognized by code: `SARVAM_API_KEY`, `GOOGLE_CLOUD_TTS_API_KEY`, and paired `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`. Provider calls have no automatic retry loop; each configured provider is attempted at most once per request.
- **Edge TTS is NOT VIABLE on the tested handshake and is disabled by a code-level viability gate** (`EDGE_TTS_WORKERS_VIABLE=false)). Setting `EDGE_TTS_ENABLED=true` cannot override this gate. `/health` reports the result honestly; no optional provider key is reported as configured unless that secret is present.
- `/api/edge-tts` intentionally returns a structured `503 EDGE_TTS_NOT_MIGRATED` response; the frontend does not call it. The frontend makes one `/api/tts` request and, when it fails, falls back to device `speechSynthesis`, checks the installed voice list (including `voiceschanged`), chunks long text, and disables Read Aloud with a clear message when no Tamil voice becomes available.
- Browser fallback behavior is unit/source-tested. Availability/quality on Android Chrome, iOS Safari, Windows and macOS is **NOT VERIFIED**; use the manual matrix below.
- Microsoft Edge Read Aloud endpoint is an unofficial consumer endpoint, not a verified supported developer TTS API. The observed 403 and any future endpoint/terms/throttling changes are operational and Terms-of-Service risks. This is a risk note, not legal advice.

### Temporary R2 retention — required dashboard configuration, NOT applied/verified here

Use the existing R2 bucket already intended for `MEDIA_CACHE` (the existing media bucket, not a new bucket). Create **prefix-scoped** lifecycle rules only:
- `tts/` → delete after **604800 seconds (7 days)**.
- `tts-usage/` → delete after **172800 seconds (2 days)**, so daily counters don't accumulate.
- Preserve existing `streaming-cache/` lifecycle policy (currently recorded separately as 172800 seconds / 2 days). Do not apply an empty-prefix/all-bucket expiration rule, because that could delete streaming cache objects outside this feature.

These are recommended design settings, **NOT VERIFIED in the live R2 dashboard**. Exact user action:
1. Cloudflare Dashboard → R2 → the existing media bucket bound as `MEDIA_CACHE` → Settings/Lifecycle rules.
2. Add the two prefix-only delete rules above, without replacing/removing the existing `streaming-cache/` rule.
3. Confirm the displayed rule list contains all existing and new rules; keep a screenshot for evidence.
4. Cloudflare docs say lifecycle deletion is typically completed within 24 hours of the expiration time, not instantly: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
5. R2's current published monthly included Standard usage is 10 GB-month storage, 1 million Class A operations and 10 million Class B operations; egress is free, but storage/operations remain metered and the free tier is not unlimited or guaranteed forever. Re-check current plan/billing: https://developers.cloudflare.com/r2/pricing/

### Required environment variable and binding names

Set the names below separately in **Cloudflare Pages → hj-groups-web → Settings → Variables and Secrets → Preview** and **Production** as appropriate. Values are not included here. Preview and Production do not automatically share environment configuration.

| Name | Type / required state | Purpose / safety |
|---|---|---|
| `MEDIA_CACHE` | R2 binding; required for /api/tts | Bind the existing media R2 bucket; no new bucket. Bind in both Preview and Production if each environment is meant to use TTS. |
| `SUPABASE_URL` | non-secret variable; required | HJ Web Supabase project URL for server-side authenticated TTS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**; required for current server-side auth helper | Must remain server-side only; never use a `VITE_` prefix, never print the value, and never expose it to the browser build. |
| `CORS_ALLOWED_ORIGINS` | non-secret comma-separated origin list; set per environment | Include the exact Pages Preview origin(s) used for testing and the production origin. Don't guess a preview hostname; copy it from the deployed Preview. |
| `TTS_MAX_CHARS` | optional integer; default 2000, code ceiling 10000 | Per-request text cap. |
| `TTS_DAILY_LIMIT` | optional integer; default 30 | Per-user daily request cap; valid configured range 1–1000. |
| `EDGE_TTS_ENABLED` | optional flag; keep `false` for now | Current negative viability gate disables Edge regardless of the env value. Do not use this flag to claim Edge is working. |
| `SARVAM_API_KEY` | optional **secret** | Only enables Sarvam if the owner configures a key and accepts the usage/pricing conditions. |
| `GOOGLE_CLOUD_TTS_API_KEY` | optional **secret** | Only enables Google Cloud TTS if a key is supplied and Google Cloud billing/quotas are accepted. |
| `AZURE_SPEECH_KEY` | optional **secret** | Must be paired with `AZURE_SPEECH_REGION`. |
| `AZURE_SPEECH_REGION` | optional non-secret variable | Region matching the Azure Speech resource; must be paired with the key. |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | optional public variable for push config/status | Public key only. It does **not** enable sending; delivery remains deferred. Do not create/change VAPID keys automatically. |

Keep the existing frontend build variables as already configured:
- `VITE_SUPABASE_URL` — public project URL.
- `VITE_HJ_CLIENT_KEY` (or the existing supported public publishable/anon key alias) — public browser client key only, never a service-role key.
- `VITE_STREAMING_SERVER_URL` — existing deployed streaming Worker URL.

Optional provider settings are **not required** for browser speech fallback. If none of the online providers has been deliberately configured, `/api/tts` returns a structured error and the frontend falls back to the device voice. Do not create or add a secret just to make the health flag appear green.

### Official provider cost / limit check (not a promise of free service)

- **Sarvam Bulbul v3:** current official docs advertise ₹100 signup credits, then ₹30 per 10,000 characters; Bulbul v3 Starter is limited to 30 requests/minute. Credits are limited; usage after exhaustion is billable. Sources: https://docs.sarvam.ai/api/getting-started/pricing and https://docs.sarvam.ai/api/getting-started/ratelimits
- **Google Cloud Text-to-Speech:** official pricing lists a monthly free usage allowance for Standard voices (up to 4 million characters in the currently published pricing table) and bills usage after the allowance. A billing account must be enabled, and charges can apply beyond free usage. Verify current SKU, billing account, budget alerts and quota before enabling: https://cloud.google.com/text-to-speech/pricing
- **Azure Speech:** official docs bill TTS per character and list a distinct F0 free tier/quotas; the exact allowance should be checked on the current pricing page for the chosen region/resource before enabling. The official quota page lists F0 standard-voice real-time TTS at 20 transactions per 60 seconds and max 10 minutes generated audio per request. Do not treat F0 as unlimited: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits and https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Cloudflare Workers/R2, Supabase plan/egress, provider billing, rate limits and GitHub Actions allowances are separate limit systems. Check each dashboard; no “free forever” or unlimited claim is made.

### Web Push — explicitly deferred

- Admin notification UI states delivery is not available yet and its send button is disabled; no fake sent count is displayed.
- `POST /api/admin/notifications/send` retains explicit `503 WEB_PUSH_SEND_NOT_MIGRATED`.
- Subscription/preferences route source and mocked tests are present, but live persistence is **NOT VERIFIED** while Supabase API access is quota-restricted.
- No real notification, live subscription write, VAPID key creation/change, production DB change or preview/production setting change was made here.

### Regression / acceptance matrix — Phase 2 TTS + Web Push decision patch

| Test surface | Result | Evidence / remaining caveat |
|---|---|---|
| Quality Check | VERIFIED PASS | Run #1106 / `38262539588`; lint, build, unit tests, route smoke, source guard and secret scan passed on code head `58e50b664ac4db1a4509e580719ff4e446d28dfb`. |
| Real Edge WebSocket probe | VERIFIED NOT VIABLE on tested runtime path | Run #17 / `38262539570`: 502 `EDGE_TTS_HANDSHAKE_FAILED`, upstream 403, 0 audio bytes. CI passed because it correctly classified this expected negative outcome. |
| Edge production provider | DISABLED | `EDGE_TTS_WORKERS_VIABLE=false`; explicit config cannot override the evidence-based gate. |
| `/api/tts` auth/limits/provider errors | VERIFIED at unit/source level | Tests cover auth rejection, configurable char cap, one-attempt provider failure, R2 usage quota, cache hit/miss and Range. Live Pages Preview is NOT VERIFIED. |
| TTS cache key normalization | VERIFIED at unit level | Same normalized text + voice + MP3 format reuses one `tts/<sha256>.mp3` key. |
| Cached audio Range/206/416 headers | VERIFIED at unit level | Live browser/Preview range test is still needed. |
| Browser `speechSynthesis` fallback | VERIFIED at source/unit level | Device voice availability and audible output are NOT VERIFIED on Android Chrome, iOS Safari, Windows or macOS. |
| `/health` provider flags | VERIFIED at unit/source level | Reports cache binding and configured provider names only; a secret being present does not prove the provider can generate audio. Live Preview response NOT VERIFIED. |
| Web Push admin send | VERIFIED deferred state at source/unit level | UI disabled; API explicit `503 WEB_PUSH_SEND_NOT_MIGRATED`; real delivery intentionally not attempted. |
| Web Push subscription/preferences | NOT VERIFIED live | Tests are mocked; re-test after Supabase quota/access recovers. |
| Episode Analytics | UNCHANGED BY THIS PATCH | No Episode Analytics files/routes/migrations were intentionally modified. |
| R2 lifecycle & Pages env | NOT VERIFIED — user action | Add prefix-only lifecycle rules and inspect Preview/Production bindings as described above. |
| Preview browser regression | NOT VERIFIED — user action | Requires a real Pages Preview deployment after Pages Git integration is reconnected; do not merge until owner approval. |

### Manual Preview and browser checklist (owner action)

After the Supabase quota restriction is lifted and Pages Preview deployment is available:
1. Confirm Preview has `MEDIA_CACHE`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` and the correct Preview origin in `CORS_ALLOWED_ORIGINS`. Do not paste secret values into chat or screenshots.
2. Signed out → trigger Read Aloud: expect the structured auth failure then native device fallback if a Tamil voice is installed; no repeated online retries. Signed in → test a short Tamil paragraph; with no optional provider configured, expect fallback, not a fake online-audio success.
3. With an approved provider secret configured, test first TTS MISS, repeat identical text HIT, normalized whitespace reuse, Range request 206 and invalid range 416. Check `/health` flags without exposing secret values.
4. Check the Admin Notification Center: the send button remains disabled and the UI clearly says delivery is not available yet. Verify subscribe/preferences only when Supabase accepts requests; never send a real notification for this acceptance test.
5. Test Tamil fallback voices on Android Chrome, iOS Safari, Windows and macOS; note whether `getVoices()` is populated immediately or after `voiceschanged`, and confirm the button is disabled with a clear message where no Tamil voice exists.
6. In DevTools Network, filter `/api/tts`; verify only one online request per Read Aloud invocation, structured failure codes, and no browser-visible secret values. Save sanitized request/response headers and console output as evidence.

### Safety outcome

- PR #9 stays open and unmerged until the owner tests and approves Preview. PR #12 remains a separate draft stacked on PR #9; do not merge it independently or merge any PR automatically.
- `main`, production Pages settings, R2 lifecycle settings, Supabase data/schema, Voroa, Telegram session/media and Episode Analytics were not changed by this phase.
- No real provider key was added; no provider is claimed to have completed live synthesis; no notification was sent.
- Remaining gates are: apply/verify prefix lifecycle rules, configure bindings/variables in Preview and Production with owner approval, run Preview and device tests, and obtain owner approval before merge/cutover.
