# Infrastructure research: sync, offline, jobs, auth, storage, documents

Researched 2026-09-25 for the Clash v2 rebuild: Next.js 16 App Router, React 19, TypeScript, on **Vercel Hobby**, with **Neon Postgres** (free plan, Vercel Marketplace).

**How to read this document**

- **[V]** means verified on 2026-09-25 against an official source. The bracketed ID, such as [V1], points to the Sources list at the end. Every source was accessed on 2026-09-25.
- **[V-src]** means verified by reading the published npm package source or by running it locally. The experiments are in §6.2 and §8.
- **[I]** means an inference or design recommendation built on verified facts. It is not a vendor claim.
- **[U]** means unverified. Either the claim wasn't found in official docs, or the docs disagree.

---

## 0. Recommendations at a glance

| Area | Recommendation | Main reason | Main risk |
|---|---|---|---|
| Hosting | Vercel Hobby with Fluid compute (the default). Use Route Handlers for sync and all offline-critical APIs. Don't use Server Actions in the round workspace. | Hobby limits are workable for 2–10 users. Server Actions are serialized per client, capped at 1 MB, and their IDs rotate on each deploy [N3][N4]. | Hobby has no spend controls. Exceeding a limit pauses the feature for up to 30 days [V3]. Hobby is limited to non-commercial use [V32]. |
| Database | Neon free plan on Postgres 18 (this matches PGlite 0.5.8, which embeds PG 18.3). Use `pg` Pool with `attachDatabasePool` on the pooled URL. Run migrations over the unpooled URL. | Neon's own recommendation for Fluid [D12]. | Running out of CU-hours or storage suspends compute or blocks writes [D3]. Point-in-time restore covers only 6 h [D1]. |
| ORM | Drizzle ORM 0.45.3 and drizzle-kit 0.31.11, with `generate` then `migrate`. Stay on 0.x until 1.0 leaves RC. | Stable release line. Includes runtime migrators for neon-http and pglite [Z2][V-src]. | 1.0 is in RC (`1.0.0-rc.4`), so a migration will come later. |
| Auth | Self-hosted **Better Auth 1.7.6** with the Drizzle adapter, email + password, the organization plugin (teams off), and the admin plugin. Make it invite-only. Store rate-limit counters in the database. | Current, maintained, and runs inside Next.js. Auth.js is in maintenance mode [A10]. Neon's managed Better Auth runs 1.4.18 and supports orgs only partially [D14][D16]. | Password resets, magic links, and emailed invitations need email. Resend's free tier requires a verified domain [A12][A13]. |
| Real-time editing | **Yjs 13.6.33 + TipTap 3.31.3**, with **one top-level `Y.XmlFragment` per section**. Run a **custom HTTP state-vector sync** over Route Handlers with adaptive polling. No WebSockets in v1. | School networks may block WebSockets. Every hosted Yjs backend evaluated (Liveblocks, Y-Sweet, PartyKit, Hocuspocus) uses WebSockets for real-time traffic; Electric's HTTP-based option wasn't evaluated in depth (§6.4). Yjs updates are idempotent and state vectors repair losses (§6.2). | Polling costs function invocations (§6.7). Presence is coarse, around 1–2 s. |
| Offline | Your own IndexedDB outbox, plus a doc store (y-indexeddb is acceptable for doc state). Serwist through `@serwist/turbopack`. Call `navigator.storage.persist()`. Install as a home-screen PWA on iPad. | Accurate "saved on this device" requires knowing when the IndexedDB commit finished. y-indexeddb writes fire-and-forget (§6.1). | Safari evicts script-written storage after 7 days without interaction, unless the app is installed [O3][O5]. |
| Background jobs | **Vercel Workflows** (GA since 2026-04-16) for the 1–10 minute research pipeline, with a Postgres `job` row as the source of truth. Trigger.dev is the fallback if any single step must exceed 300 s. | Built in, with durable steps, retries, streams, and cancel. The Hobby allowance of 50k events/month covers hundreds of runs [V25]. | Each step is capped at 300 s on Hobby. Run data is kept only 1 day on Hobby [V25]. |
| Files | Vercel Blob **private** store, uploaded with presigned client uploads (`uploadPresigned` / `handleUploadPresigned`). | Avoids the 4.5 MB function body cap. Private storage is GA [V20][V21][V22]. | Hobby Blob quotas are 1 GB storage and 2k advanced ops per month, with a 30-day lockout if exceeded [V19]. |
| DOCX in | Keep the direct OOXML parser already in `src/server/ingest/docx.ts` (fflate + XML). Don't use mammoth. | On the three real sample files, mammoth's default HTML dropped every highlight and underline. It also doesn't apply formatting that comes from character styles such as Verbatim's "Style Underline" (§8.1). | Style inheritance and toggle-property rules must be implemented correctly. |
| DOCX out | `docx` 9.7.2 with explicit character-style IDs. Override the built-in headings through `styles.default.headingN`. Consider `externalStyles` taken from a real Verbatim file. | Style IDs, highlights, and sizes come out correctly (§8.2). | Defining `Heading1` through `paragraphStyles` creates **duplicate style IDs** (§8.2). |
| PDF / OCR | `unpdf` `extractTextItems` for layout-aware text. OCR fallback through Claude or Gemini native PDF input, or Mistral OCR. Always label OCR output as machine-transcribed. | Serverless-ready. OCR pricing is modest (§8.4). | Hallucinated OCR text reaching evidence. Needs deterministic verification and human confirmation. |
| Tests | Vitest 5, PGlite 0.5.8 (unit/DB), and Playwright 1.63 with two contexts, `setOffline`, and `routeWebSocket`. Run a small suite against a Neon branch. | Fast and deterministic. | PGlite cannot emulate PgBouncer transaction pooling or multi-connection locking. |

---

## 1. Vercel Hobby: verified platform facts

### 1.1 Functions (Fluid compute, which is the default for projects created on or after 2025-04-23 [V16])

| Item | Hobby value | Source |
|---|---|---|
| Max duration | **300 s default and 300 s maximum**. Pro allows 800 s, and 1800 s in beta. | [V] [V1][V2] |
| Legacy non-Fluid projects (created before 2025-04-23) | 10 s default, 60 s max | [V] [V4] |
| Memory / CPU | **2 GB / 1 vCPU**, fixed. Only Pro and Enterprise can change it. | [V] [V1] |
| Request **and** response body | **4.5 MB**. Larger bodies get 413 `FUNCTION_PAYLOAD_TOO_LARGE`. | [V] [V1] |
| Streamed responses | Duration includes streaming time [V1]. Vercel's KB says streamed responses "don't have this limit" of 4.5 MB [V23]. | [V] |
| Idle long-lived HTTP | Vercel sends HTTP/2 PING frames. HTTP/1.1 clients and intermediaries may close idle connections, so "stream progress or heartbeat data" [V2]. | [V] |
| Bundle size | 250 MB uncompressed. The "large functions" beta allows up to 5 GB. | [V] [V1] |
| Concurrency, region, file descriptors | Up to 30,000 concurrency. Default region `iad1`; multi-region is Pro/Enterprise only. 1,024 file descriptors "shared across all concurrent executions (including runtime usage)". | [V] [V1] |
| Billing model | Active CPU excludes I/O wait. Provisioned memory is billed for instance lifetime until the last in-flight request completes. Instances pause when idle. | [V] [V7] |

**Included usage per month [V3][V32]:** 1,000,000 function invocations; 4 active CPU-hours; 360 GB-hours of provisioned memory; 100 GB Fast Data Transfer; 10 GB Fast Origin Transfer; 1,000,000 Edge Requests; 50,000 Workflow events; 1 GB Workflow data written.
**If you exceed a limit:** "In most cases … you will have to wait until 30 days have passed before you can use the feature again." Spend Management is not available on Hobby [V3].
**Commercial use:** "Hobby teams are restricted to non-commercial personal use only." Commercial means any deployment used "for the purpose of financial gain of anyone involved in any part of the production," including paid developers [V32]. A student team tool with no payments looks non-commercial **[I]**, but that is the user's call.

### 1.2 Streaming, SSE, and WebSockets

- **SSE works** as a normal streamed `Response` from a Route Handler. Vercel's own streaming example sets `Content-Type: text/event-stream` [V6]. The connection counts against the 300 s max duration [V1].
- **WebSockets are in public beta** [V16]. They require Fluid compute. A connection is **pinned to one function instance** and closes at max duration (300 s on Hobby). Reconnects may land on a different instance or even a newer deployment. Durable state, presence, and pub/sub must live in an external store such as Redis [V16][V17]. In Next.js the only route is `experimental_upgradeWebSocket()` from `@vercel/functions` (default `maxPayload` 256 KiB). Local development requires `vc dev` with CLI ≥ 54.14.2 [V8]. An open connection is billed like any other function usage [V16].
- **[I]** Under our constraint (school networks may block WebSockets), a WebSocket path would only ever be an optimization. It would also need Redis for fan-out across instances. Defer it.

### 1.3 `after()` / `waitUntil`

- `after()` is stable since Next.js 15.1. It runs after the response, "for the platform's default or configured max duration of your route". It runs even when the response errored [N6].
- `waitUntil` promises "have the same timeout as the function itself. If the function times out, the promises will be cancelled." `getDeadline()` covers request work plus `waitUntil` tasks [V8].
- **[I]** Treat both as best-effort fire-and-forget: cache warming, analytics, "kick the compactor". They are **not durable**. Anything that must happen belongs in a Workflow or a DB-backed job.

### 1.4 Cron on Hobby

100 cron jobs per project. The **minimum interval is once per day**, and a more frequent expression **fails the deployment**. Timing precision is **±59 min**, so `0 1 * * *` fires anywhere between 1:00 and 1:59 [V5]. **[I]** Use it only for nightly housekeeping: compaction sweep, backup export, orphan-Blob cleanup, stale-job reaper.

### 1.5 Deployment Protection and server-to-server calls

- Deployment Protection has been **on by default for new projects since 2023-11-02** [V14]. "Standard Protection" protects every URL **except production domains**, including preview and generated deployment URLs [V10]. Vercel Authentication is available on Hobby. Password Protection is not [V10]. Hobby allows only one external user per account through access requests [V15].
- **Ways to bypass [V11][V12][V13]:**
  - **Protection Bypass for Automation.** A per-project secret, exposed as `VERCEL_AUTOMATION_BYPASS_SECRET`. Send it as the header `x-vercel-protection-bypass` or as a query parameter of the same name. Add `x-vercel-set-bypass-cookie: true` (or `samesitenone` inside iframes) so browser tests keep access. Multiple secrets are allowed. Rotating a secret invalidates it for existing deployments, so you must redeploy [V11].
  - **Trusted Sources (OIDC).** The caller sends its OIDC token in `x-vercel-trusted-oidc-idp-token`. By default a project can call **its own deployments in the same environment**, for example preview calling preview. Other projects in the team, and external issuers such as GitHub Actions, can be allow-listed [V12].
  - **Same-domain calls.** Client-side relative `fetch('/…')` carries the user's auth cookie. Server-side, forward the incoming cookies to the same origin. Vercel says a bypass is "not required for requests targeting the same domain" [V10].
  - OPTIONS allowlist, Deployment Protection Exceptions (make a specific preview domain public), and Shareable Links [V13].
- **[I]** Vercel Blob's `onUploadCompleted` callback is an inbound request from Vercel to your route. On a protected preview it will be blocked unless the callback URL carries the bypass query parameter. Don't depend on the callback (§2). **[U]** Whether Vercel Workflows/Queues push deliveries to preview deployments are affected by protection is not documented. Test it on the first preview deploy.

### 1.6 Version skew (important for offline clients)

- **Skew Protection is Pro/Enterprise only** [V31]. On Hobby, a client that stayed open or offline across a deploy talks to the **new** deployment's APIs.
- Server Action IDs rotate on new deploys (at most every 14 days even without source changes). Stale clients get "Failed to find Server Action". Server Actions are also **dispatched one at a time per client**, and their bodies are capped at **1 MB** by default [N3][N4].
- **[I]** For sync and uploads, use **versioned Route Handlers** (`/api/sync/v1/...`) with a protocol-version header. Keep the server accepting protocol N-1 for at least one deploy cycle.

### 1.7 Other Hobby limits that matter

Runtime logs are kept for **1 hour** [V4]. 100 deployments per day, 1 concurrent build, and a 45-minute maximum build time [V4]. **[I]** Because logs disappear after an hour, write sync and job errors to a small Postgres `event_log` table so tournament incidents can be diagnosed afterwards.

---

## 2. Vercel Blob

| Fact | Detail | Source |
|---|---|---|
| Hobby included | **1 GB-month storage, 10,000 simple ops, 2,000 advanced ops, 10 GB Blob data transfer**. Over the limit, Blob becomes inaccessible until 30 days have passed. | [V] [V19] |
| Op rate limits (Hobby) | The pricing page says 1,200/min simple and 900/min advanced. The limits page lists 1,500/min advanced. | **[U] docs disagree** [V19][V4] |
| What counts | `put`, `copy`, `list`, and client `upload` are advanced ops. Multipart uploads cost 1 + parts + 1. Dashboard browsing also counts. `del` is free. | [V] [V18][V19] |
| Sizes | Max file size 5 TB. Multipart recommended above 100 MB. CDN cache limit 512 MB per blob. | [V] [V19] |
| Private vs public | Access is chosen **per store and cannot be changed later**. Private reads require auth and are served through your Function using `get()`. Private storage is GA and needs `@vercel/blob` ≥ 2.3. | [V] [V18][V21] |
| Private delivery | Stream `result.stream` from a Route Handler that checks auth. Set `Cache-Control: private, no-cache` and forward `If-None-Match` to get 304s. Serving files over 100 MB through private stores is not recommended unless traffic is low. | [V] [V21] |
| Consistency | Overwrites can take up to 60 s to propagate through the CDN cache. `get(..., { useCache: false })` reads from origin. Conditional writes use `ifMatch` with an ETag. Overwrites are rejected unless `allowOverwrite` is set. | [V] [V18][V21] |
| Auth | OIDC by default (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`). `BLOB_READ_WRITE_TOKEN` is required for `handleUpload` client tokens but **not** for `handleUploadPresigned`. | [V] [V18][V20][V22] |
| Client upload flow | Browser calls `upload()`, which calls your route running `handleUpload()`. You must authenticate inside `onBeforeGenerateToken`. The file then goes directly to Blob, bypassing the 4.5 MB limit. `onUploadCompleted` is called by Vercel, doesn't work on localhost, and the webhook retries 5 times. | [V] [V20] |
| Presigned flow | `issueSignedToken({ pathname, operations:['put'], allowedContentTypes, maximumSizeInBytes, validUntil })`. `validUntil` is at most 7 days and defaults to 1 h. Pair with `presignUrl` or with `uploadPresigned` and `handleUploadPresigned`. Constraints are enforced at the CDN. | [V] [V22] |
| Upload cost | Client uploads incur no data-transfer charge. Server uploads incur Fast Data Transfer. | [V] [V19] |

**Recommended upload flow [I]:**
1. The client asks `/api/uploads/v1/presign`. The server checks the session and team, issues a presigned PUT scoped to `teams/{teamId}/sources/{uuid}.{ext}`, and sets content-type and size limits.
2. The client uploads with `uploadPresigned`, then calls `/api/uploads/v1/confirm` with the pathname.
3. The server calls `head()` to verify existence, size, and type, inserts a `source_file` row, and starts ingestion (a Workflow).
4. The `onUploadCompleted` callback is at most a secondary signal. Without it, uploads still work on localhost and on protected previews.
5. A nightly cron removes Blob objects with no DB row older than 24 h. That spends advanced ops (`list`), so keep sweeps small.

---

## 3. Durable background jobs (research pipeline: 1–10 min, progress, cancel, resume, dedup)

### 3.1 Vercel Workflows (Workflow SDK, `workflow` package)

- **GA on 2026-04-16** [V27]. Stable npm line is `workflow@4.8.9`; `5.0.0-beta.56` is in beta. Multi-region requires 5.0 beta ≥ 33, and 4.x runs live in `iad1` [V24][npm].
- **Model:** `'use workflow'` functions orchestrate and `'use step'` functions do the work. Each step "compiles into an isolated API route". All inputs and outputs go to an event log, and "if a deploy or crash happens, the system replays execution deterministically". `sleep()` and hooks consume no compute. Runs stay **pinned to the deployment that created them**. Cancel runs from the dashboard or CLI, and cancel runs pinned to deleted deployments yourself [V26].
- **Retries:** steps retry up to 3 times by default (4 attempts). `FatalError` skips retries. `RetryableError` accepts `retryAfter` [W1].
- **Streaming progress:** steps write through `getWritable()`. Clients read `run.readable`, or `getRun(runId).getReadable({ startIndex })` to resume after a reconnect. On Vercel, streams are Redis-backed [W2].
- **Cancellation:** `getRun(runId).cancel()`. `returnValue` then throws `WorkflowRunCancelledError`. **The in-flight step keeps running until it completes** [W3][W5]. For graceful cancellation, race the work against a stop hook [W5].
- **Idempotency:** `stepId` is stable across retries, so use it as the idempotency key for external calls. To dedup whole runs, create a hook with a domain-derived token and check `hook.getConflict()` [W6].
- **Next.js:** `npm i workflow`, wrap config with `withWorkflow` from `workflow/next`, and call `start()` from `workflow/api`. Next.js 16.1+ needs `workflow` ≥ 4.0.1 [W7].
- **Hobby pricing and limits [V25]:**
  - Allowance: 50,000 events/month and 1 GB data written. "Data retained" is not available on Hobby.
  - Retention after run completion is **1 day** on Hobby (7 days on Pro).
  - A normal step produces 3 events: created, started, completed. Each retry adds one more.
  - Per-run limits: 25,000 events, 10,000 steps, 50 MB payload, 2 GB entity storage.
  - Replay (orchestration) is limited to **240 s**.
  - A step can run no longer than a function (**300 s on Hobby**). Run duration itself is unlimited.
  - Workflows are billed on top of Queues usage.

### 3.2 Vercel Queues

**Public beta.** Consumer trigger type is `queue/v2beta`, package `@vercel/queue@0.7.0` [V28][npm]. It provides durable topics, consumer groups, at-least-once delivery, idempotency keys that drop repeated publishes, and delays [V28]. Limits: TTL from 60 s to 7 days (default 24 h), visibility timeout up to 60 min, 100 MB max message size. Messages are metered in 4 KiB chunks. **Hobby includes 1,000,000 operations** [V29]. **[I]** Use it only indirectly, through Workflows.

### 3.3 Alternatives

| Service | Free tier (verified) | Execution model | Vercel Marketplace |
|---|---|---|---|
| **Inngest** | 50k executions/month, 5 concurrent steps, 24 h trace history, 256 KiB event size. Pro from $99/month [J1]. | Steps run inside your Vercel functions, so each is still capped at 300 s **[I]**. | "Vercel Native" [V34] |
| **Trigger.dev** | $5/month free credit, 20 concurrent runs, **no timeouts**, 1-day log retention, 10 schedules. Hobby $10, Pro $50 [J2]. | Tasks run on Trigger.dev's infrastructure with checkpoint-resume, retries, and idempotency keys [J3]. | Integration exists and syncs env vars (**[U]**: from search results, not fetched) |
| **Upstash Workflow / QStash** | 1,000 steps/day, 1 MB messages, 15 min max HTTP response duration. $1 per 100k steps pay-as-you-go [J4]. | HTTP callbacks into your functions (300 s on Hobby) **[I]**. | Listed [V35] |

### 3.4 Recommendation and pipeline design [I]

Use **Vercel Workflows**. It has no extra vendor, is GA, and its Hobby allowance fits. A 40-step run is about 120–150 events, so roughly 300 runs/month fit in 50k events.

Keep **Postgres as the source of truth**. Hobby keeps run data only 1 day, and progress must survive reloads and devices.

```
research_job(id, team_id, dedup_key, status queued|running|succeeded|failed|cancelled,
             progress jsonb, cancel_requested_at, workflow_run_id, created_by, created_at, updated_at)
UNIQUE (team_id, dedup_key) WHERE status IN ('queued','running')
research_step(job_id, step_key, status, output_ref, attempts, updated_at)   PK(job_id, step_key)
```

1. **Start.** Insert the job with `ON CONFLICT DO NOTHING`. If a job already exists, return it; that is the dedup. Then call `start(researchWorkflow, [jobId])` and save the run ID.
2. **Steps.** Keep each step to 240 s or less (fetch one source, run one LLM call, verify one card). Each step begins by reading `cancel_requested_at` and throws `FatalError('cancelled')` if it is set. Results go to `research_step` keyed by `(job_id, step_key)`, so a replayed or resumed step is a no-op. External calls pass `stepId` as the idempotency key.
3. **Progress.** Write coarse progress to the job row, which the UI polls every 2–5 s. Optionally stream fine-grained progress through `getWritable()`, and use `startIndex` to resume.
4. **Cancel.** Set `cancel_requested_at`, then call `getRun(runId).cancel()`. Because an in-flight step completes anyway [W5], guard its final write with `UPDATE … WHERE status='running' AND cancel_requested_at IS NULL`.
5. **Resume after failure.** Start a new run for the same `jobId`. Completed steps are skipped because their `research_step` rows exist.
6. **Escape hatch.** If a step can't be made to fit in 300 s (for example, OCR of a 300-page scan), move that step to Trigger.dev.

---

## 4. Neon Postgres and Drizzle

### 4.1 Free plan [V]

| Item | Value | Source |
|---|---|---|
| Projects / branches | 100 projects; **10 branches per project**; extra branches not available | [D1] |
| Compute | **100 CU-hours per project per month**, autoscaling up to 2 CU (8 GB RAM). 0.25 CU is about 1 GB RAM, so the allowance is about **400 h at 0.25 CU** | [D1][D3] |
| Scale-to-zero | After **5 min**, and it **cannot be disabled** on Free. Reactivation takes "a few hundred milliseconds" | [D1][D4] |
| Storage | **0.5 GB per project**, hard cap. Writes that would grow storage fail | [D2][D3] |
| History (PITR) | **6 hours**, up to 1 GB-month. One manual snapshot | [D1] |
| Egress | 5 GB per project | [D1] |
| Quota exhausted | If CU-hours or egress run out, "compute is suspended until the next billing period or until you upgrade. Existing connections drop". No data is deleted | [D3] |
| Next tier (Launch) | $0.106/CU-hour, $0.35/GB-month, $1.50 per extra branch-month, history up to 7 days | [D1] |
| Postgres versions | 14–18 | [D13] |

### 4.2 Connecting from Vercel functions [V]

- Neon's recommendation for **Fluid compute** is a standard TCP driver (`pg`) with a pool, using `attachDatabasePool` from `@vercel/functions`: "Once established, it's the fastest". They also say to benchmark it [D12]. `attachDatabasePool` releases idle clients before the function suspends [V8][V33].
- **HTTP (`neon()`)** is fastest for one-shot queries. `sql.transaction([...])` runs non-interactive batches. Request and response are limited to 64 MB. **WebSocket `Pool`/`Client`** covers sessions and interactive transactions, but in classic serverless it cannot outlive a request [D5].
- **Pooled URL (PgBouncer, transaction mode, up to 10,000 client connections)** doesn't support `SET`/`RESET`, `LISTEN`/`NOTIFY`, SQL `PREPARE`, some temp-table modes, `WITH HOLD` cursors, `LOAD`, or **session-level** advisory locks. Use the **direct URL** for migrations and pg_dump [D6]. Row locks and transactions work normally in transaction mode **[I]**.
- The Vercel-managed integration injects `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, and `PG*`, and optionally creates **a branch per preview deployment** [D10].

**[I] Driver choice:** use `pg` + `drizzle-orm/node-postgres` + `attachDatabasePool(pool)` on `DATABASE_URL` for all app traffic, including the interactive transactions the sync endpoint needs. Keep `@neondatabase/serverless` HTTP only for scripts or edge cases. Use `DATABASE_URL_UNPOOLED` for `drizzle-kit migrate`.

### 4.3 LISTEN/NOTIFY: not viable here [V + I]

It is incompatible with the pooler, and "when your compute scales to zero, it will terminate all listeners" [D6][D7]. Free-plan computes cannot disable scale-to-zero [D1], and a Vercel function can't hold a listener past 300 s anyway [V1]. **[I]** Detect changes with a per-document `head_seq` counter that clients poll (§6.5).

### 4.4 Extensions and search [V]

| Extension | Status |
|---|---|
| pgvector | 0.8.0 on PG14–17, 0.8.6 on PG18 |
| pg_trgm | 1.6 |
| unaccent, fuzzystrmatch | Available |
| pg_search (ParadeDB BM25) | **Deprecated**, not available for new projects |
| pg_cron | **Paid plans only**, and runs only while the compute is active |

Source: [D8]. **[I]** For the evidence library, use built-in full-text search (`tsvector` with a GIN index) plus `pg_trgm` for fuzzy cite and tag matching, and `pgvector` only if semantic search proves necessary.

### 4.5 Branching, previews, and backups

- Branches are copy-on-write clones with instant creation. Neon also supports schema-only branches and "reset from parent" [D9].
- Preview branches are deleted only when their Vercel deployment is removed, which is 6 months by default. **Archived branches still count toward the 10-branch limit**. Neon recommends its `delete-branch-action` GitHub Action on PR close [D10][D11].
- **[I]** With 10 branches on Free, either disable per-preview branching or add the cleanup action from day one.
- **[I]** PITR covers only 6 h. Add a nightly cron that exports each document's compacted Yjs state and the core tables to a private Blob path, or a GitHub Actions `pg_dump` over the unpooled URL. Keep 14 dailies.

### 4.6 Neon Auth (now "Managed Better Auth") [V]

It is GA and "currently supports Better Auth version **1.4.18**". Data lives in the `neon_auth` schema, and each branch has an isolated auth environment. AWS regions only. Custom plugins, hooks, and options are **not supported** [D14].

- **Supported** [D15]: email + password, Google/GitHub/Vercel OAuth, email OTP, magic link, JWT, phone, and the admin plugin.
- **Partial or missing** [D15][D16]: the organization plugin has **no teams, no custom roles, and no server-side hooks**. Invitations require "Verify email at signup". MFA is "coming soon".
- **Email** [D17]: sent by a built-in provider with Neon branding. A custom SMTP server changes only the sender. Webhooks (`send.otp`, `send.magic_link`) give full control.
- Free plan: up to 60k MAU [D1].

### 4.7 Drizzle [V]

Latest stable versions are `drizzle-orm@0.45.3` and `drizzle-kit@0.31.11`, both published 2026-09-21. 1.0 is at `1.0.0-rc.4` [npm]. Drizzle supports Neon through `neon-http`, `neon-serverless` (WebSocket), and `node-postgres`. `push` is for fast iteration; `generate` + `migrate` is for production. A runtime `migrate(db)` is also available [Z1][Z2]. The published package contains `pglite/migrator` and `neon-http/migrator` [V-src].

**[I] Workflow:**
1. Run `drizzle-kit generate` locally and commit the SQL.
2. Apply it with `drizzle-kit migrate` (or the existing `scripts/migrate.ts`) over `DATABASE_URL_UNPOOLED` in CI before promoting a deploy.
3. Avoid `push` against the production branch.
4. Test migrations on a Neon branch reset from production.

---

## 5. Authentication

### 5.1 Options compared

| | Better Auth 1.7.6 (self-hosted) | Auth.js | Neon Auth (Managed Better Auth) | Clerk |
|---|---|---|---|---|
| Status | Current. Latest release 2026-09-24 [npm] | "Now part of Better Auth" (2025-09-22). Keeps getting security patches. New projects are told to use Better Auth [A10]. `next-auth` v5 is still `5.0.0-beta.32` [npm]. | GA, but pinned to Better Auth **1.4.18** [D14] | Hosted SaaS |
| Next.js App Router | `toNextJsHandler(auth)` at `/api/auth/[...all]`, `auth.api.getSession({ headers: await headers() })`, `nextCookies()` for server actions, Node-runtime `proxy.ts` for full validation. `getSessionCookie()` alone is "NOT SECURE" [A1] | n/a | `@neondatabase/auth` (0.5.0-beta) [npm] | SDK |
| Postgres / Drizzle | `drizzleAdapter` from `@better-auth/drizzle-adapter`. Generate the schema with `npx auth@latest generate` [A2] | adapters | Fixed `neon_auth` schema | n/a (their DB) |
| Orgs / teams | Organization plugin: owner/admin/member roles, custom access control, dynamic roles, optional teams. Invitations expire after 48 h by default. `allowUserToCreateOrganization` can restrict creation [A5] | DIY | Partial: no teams, no custom roles, no hooks [D16] | Free: up to 20 members per org, 100 MRO [A11] |
| Rate limiting | Built in: 100 req/60 s in production, `/sign-in/email` 3 per 10 s. **In-memory by default**, which is "not suitable … in serverless". Use `storage: "database"` [A3] | DIY | Managed | Managed |
| Sessions | 7-day expiry, refreshed daily. Optional signed cookie cache (compact/jwt/jwe) [A4] | JWT/DB | Managed | Managed |
| Free tier | n/a (self-hosted) | n/a | 60k MAU [D1] | 50k MRU per app; Clerk branding stays until Pro ($25/month, or $20 billed annually) [A11] |

### 5.2 Recommendation [I]

Self-host **Better Auth 1.7.6** in Next.js with the Drizzle adapter on Neon. Neon's managed version lags behind (1.4.18) and lacks teams and custom roles. Clerk adds a vendor and branding for no real gain at 2–10 users.

Configuration sketch. Each capability is verified; how they're combined is **[I]**.

- `emailAndPassword: { enabled: true }` (scrypt hashing, 8–128 characters [A7]).
- Invite-only access, in one of two ways:
  - **(a) Simplest:** `disableSignUp: true` [A7]. Admins create accounts through the `admin` plugin's `createUser` and set passwords with `setUserPassword` [A8].
  - **(b) Self-service join:** keep sign-up enabled and gate it in `databaseHooks.user.create.before`. The hook returns `false`, or throws `APIError`, unless a valid pending invitation exists for that email [A9].
- The `admin` plugin, so the team captain or coach can manage users and `revokeUserSessions` [A8].
- The `organization` plugin (teams off) with `allowUserToCreateOrganization` limited to admins [A5].
- `rateLimit: { storage: "database" }` [A3].
- `session.cookieCache` enabled with a ~5 min `maxAge`, to cut session DB reads on every sync poll [A4].
- **Offline [I]:** a sync request made after the session expires returns 401. Keep local edits, show "Signed out: changes are saved on this device", and never clear IndexedDB on sign-out while the outbox is non-empty.

### 5.3 What needs email

| Feature | Needs email? |
|---|---|
| Email + password sign-in; admin-created accounts; admin password reset | No [A7][A8] |
| Self-service password reset (`sendResetPassword`); email verification | Yes [A7] |
| Magic link (`sendMagicLink`, 5 min default expiry); email OTP | Yes [A6] |
| Organization invitations | The callback is `sendInvitationEmail`, but it can deliver the link through any channel. Showing a "copy invite link" in the UI works **[I]**. Accepting requires the invitee to be signed in [A5]. |

**Free email option:** Resend Free gives 3,000 emails/month, **100/day**, 3 domains, and 30-day retention [A12]. The shared `resend.dev` sender "can only send testing emails to your own email address", so you need a domain you control [A13]. **[I]** Launch without email (admin-provisioned accounts). Add Resend once a domain exists.

---

## 6. Real-time collaborative editing

### 6.1 Verified library facts

- **Yjs 13.6.33** is current stable (2026-09-23). v14 is in RC as `@y/y@14.0.0-rc.7` [npm]. **TipTap 3.31.3's collaboration packages peer-depend on `yjs ^13`** through `@tiptap/y-tiptap` [V-src]. Stay on 13.x.
- **Update API [R1][R3]:** `encodeStateVector`, `encodeStateAsUpdate(doc, sv)`, `applyUpdate(doc, u, origin)`, `mergeUpdates`, `diffUpdate(update, sv)`, and `encodeStateVectorFromUpdate`. Updates are "commutative, associative, and idempotent". Syncing directly on binary updates, without loading a `Y.Doc`, is supported.
- **Snapshots need `gc: false`:** `createDocFromSnapshot` throws `"Garbage-collection must be disabled in originDoc!"` [V-src]. Deleted text becomes content-less `ItemDeleted`, and a deleted type's children become `GC` structs [R3].
- **Y.Map key conflicts:** concurrent `set` on the same key keeps exactly one winner. The losing item is deleted, which for a nested type deletes all of its content [V-src, `Item.integrate`]. **Y.Array has no move operation** in 13.x (only insert, push, unshift, delete) [V-src].
- **TipTap Collaboration (v3):**
  - Options are `document`, `field` (default `'default'`), and **`fragment`**, "a raw Y.js fragment, can be used instead of document and field" [R4].
  - In source, `fragment` is passed straight to `ySyncPlugin(fragment)`, which reads `fragment.doc`. **Any `Y.XmlFragment` attached to a doc works, including one nested in a `Y.Map`** [R5][R6].
  - The undo manager is scoped to that fragment and tracks only `ySyncPluginKey` origins (plus any you configure), so remote and AI transactions are not in the local undo stack by default [R6].
  - Disable StarterKit's `undoRedo` [R4][R5]. y-tiptap explicitly handles "several editors sharing one provider" [R6].
- **CollaborationCaret** (`@tiptap/extension-collaboration-caret`) only touches `provider.awareness`, so any object with an `awareness` works, including our HTTP transport [R7][V-src]. Cursors whose relative position points into a different fragment resolve to `null` and are not drawn [R6].
- **y-indexeddb 9.0.12** (last release 2023-11-02) [npm]:
  - Every doc update is appended to IndexedDB immediately.
  - It compacts to a single state update after **500** stored updates (`PREFERRED_TRIM_SIZE`, 1 s debounce).
  - It exposes `whenSynced` / `'synced'`, `clearData()`, and a small custom key-value store.
  - Writes are fire-and-forget, with no per-update commit callback [R8][V-src].
- **Awareness (y-protocols 1.0.7):** a peer is dropped after 30 s without renewal. Local state renews every 15 s and is checked every 3 s [R9][V-src].

### 6.2 Experiments (Node 22.23.2, yjs 13.6.33; condensed script in Appendix A)

| # | Scenario | Result |
|---|---|---|
| 1 | Two partners offline each create `sections.set('s1', new Y.XmlFragment())` and type | **Partner A's text is silently lost.** Both converge to B's fragment. |
| 2 | The same edits into top-level `doc.getXmlFragment('section:s1')` | Both paragraphs survive. |
| 3 | A deletes a nested section while B edits it offline | B's edit is gone after sync. |
| 4 | `createDocFromSnapshot` with gc on | Throws. With `gc:false`, it restores the old content. |
| 5 | Server receives update #3, a duplicate of #1, and never #2 | Server shows `"a"` with `pendingStructs` set. After one state-vector exchange: `"abc"`, nothing pending. |
| 6 | 3,500 single-character updates (2,000 inserted, 1,500 deleted) | Raw log 56 KB; `mergeUpdates` 19.9 KB; re-encoded through a gc'd `Y.Doc` **534 B**. |
| 7 | Transactions with `'user'` vs `{kind:'ai'}` origins | Origins are visible on `'update'` events. |
| 8 | Relative positions around the word "plan" | Track correctly through a partner's prepend. A partner edit *inside* the range is detectable (range text changes and the state vector advances). |
| 9 | AI "replace plan→CP" merged with a concurrent human insert inside "plan" | Result `"The [human]CP solves warming."`: the human's characters survive but the surrounding words are destroyed. An `UndoManager` tracking only `'ai'` reverts the AI change and keeps the human text. |

### 6.3 Transports that don't need WebSockets [I]

1. **Short-poll + push over HTTP (recommended).** Each request carries local updates and asks for everything after the client's last-seen sequence number. Plain `POST`s and JSON or binary bodies pass school proxies and captive-portal logic best. Latency equals the poll interval.
2. **SSE (optional enhancement).** One streamed GET per ≤ 280 s, with heartbeats because of HTTP/1.1 idle closes [V2]. Without `LISTEN/NOTIFY` the function must poll Postgres internally anyway. It keeps an instance alive for the whole stream, costing provisioned memory (2 GB × wall time on Hobby) [V7]. Some proxies buffer event streams **[U]**. Use it only with automatic fallback to polling when no event or heartbeat arrives within ~10 s.
3. **Long-poll.** Same cost profile as SSE, with more request churn. Not recommended.

### 6.4 Hosted or managed alternatives

| Option | Status and facts | Fit |
|---|---|---|
| **Liveblocks** (`@liveblocks/yjs` 3.24.2) | Free: 10 simultaneous connections per room, 10 MB per room, **3,000 collaboration minutes/month**, 1 GB realtime storage, 24 h version history. Pro $30/month with $30 credit, then $0.002/min [R10]. `offlineSupport_experimental` uses IndexedDB [R11]. WebSocket on Cloudflare's network, no documented non-WebSocket fallback [R12]. | **[I]** 2 partners × 16 h over a 2-day tournament ≈ 1,920 min, so the free tier covers about 1.5 tournaments/month. It also fails if WebSockets are blocked **[U]**. |
| **Y-Sweet / Jamsocket** | `jamsocket.com` and `docs.jamsocket.com` now **302-redirect to Modal's "Jamsocket is joining Modal" post (2025-07-10)** [R13]. Search indexes title jamsocket.com "Jamsocket is shutting down" (**[U]** exact date). The y-sweet repo is not archived; last release v0.9.1 (2025-09-16), last push 2025-12-04 [R14]. | Treat the hosted service as gone. Self-hosting is still a WebSocket server. |
| **PartyKit / Cloudflare** | Cloudflare acquired PartyKit on 2024-04-05 [R15]. `y-partyserver` 2.2.0 provides `YServer` on Durable Objects with `onLoad`/`onSave`. Its provider is WebSocket-only [R16]. The DO free plan allows 100k requests/day, 13,000 GB-s/day, and 5 GB SQLite [R17]. | A good WebSocket fast path later. Same blocking risk. |
| **Hocuspocus** (4.7.0, MIT) | WebSocket backend on Node, Bun, Deno, and **Cloudflare Workers (since v4)**, with Redis for scaling [R18]. | Needs a long-lived WebSocket host. Not on Vercel Hobby functions. |
| **Electric** (`@electric-sql/y-electric` 0.1.54) | Electric's sync is HTTP-based. Pricing is pay-as-you-go with under $5/month waived [R19]. The Yjs integration docs are thin. | **[U]** Worth a spike only if the custom sync becomes a burden. |

### 6.5 Recommended design [I]

**Document model (per speech document, one `Y.Doc`):**

- `doc.getMap('meta')`: title, round ID, format version.
- `doc.getMap('sections')`: `sectionId → Y.Map{ kind, title, order: fractional-index string, deletedAt?, lockedBy? }`. These are small last-writer-wins fields. Section IDs are client-generated UUIDs, so two clients never create the same key.
- Section **content** lives in **top-level** fragments: `doc.getXmlFragment('sec:' + sectionId)`, bound with `Collaboration.configure({ document: ydoc, field: 'sec:' + id })`. Experiments 1–3 show why nested fragments must be avoided.
- **Deleting** a section means setting `deletedAt` (a tombstone). Never clear the fragment. The UI hides it and can restore it.
- **Reordering** means rewriting the `order` key, which avoids Y.Array's missing move.
- Remove `y-prosemirror` from `package.json` and use `@tiptap/y-tiptap`'s exports instead (`prosemirrorJSONToYXmlFragment`, `yXmlFragmentToProsemirrorJSON`, `absolutePositionToRelativePosition`, and others) [R6]. Mixing two different ySync plugin implementations risks mismatched plugin keys and state.

**Server tables:**

```
doc(id, team_id, kind, head_seq bigint, snapshot bytea, snapshot_seq bigint, snapshot_sv bytea, updated_at)
doc_update(doc_id, seq bigint, update_id uuid, author_id, origin text, bytes bytea, created_at)
           PK(doc_id, seq)  UNIQUE(doc_id, update_id)
doc_version(doc_id, version_id, state bytea, sv bytea, reason, label, created_by, created_at)
ai_suggestion(id, doc_id, section_id, job_id, anchor_start bytea, anchor_end bytea,
              base_text text, base_sv bytea, proposal jsonb, status pending|applied|stale|rejected, created_at)
```

**Sync endpoint** (`POST /api/sync/v1/docs/:id`, Node runtime, `maxDuration` about 30 s, header `x-clash-protocol: 1`):

1. Check the session, team membership, and document ACL.
2. In one transaction:
   - `SELECT head_seq … FOR UPDATE` on the `doc` row.
   - Insert the client's updates with `seq = head_seq + i`, using `ON CONFLICT (doc_id, update_id) DO NOTHING`.
   - `UPDATE doc SET head_seq = …`.
   - **Don't use a `bigserial` as the sync cursor.** Sequence values are assigned before commit and "cannot be used to obtain gapless sequences" [PG1]. A reader could see seq 105 committed before 104, advance past it, and miss 104. The per-document row lock makes commit order equal seq order.
3. **Reply:**
   - If `sinceSeq ≥ snapshot_seq`, return the raw updates with `seq > sinceSeq`, capped around 1 MB with a `hasMore` flag.
   - Otherwise return `diffUpdate(merge(snapshot, updates), clientSV)`.
   - Always include `headSeq`, `acks[update_id]`, and server time.
4. **Every Nth request, and on reconnect,** the client also sends its full state vector. The server returns its own state vector, and the client re-sends anything the server lacks. Updates are idempotent, so this "full reconcile" heals lost acks, outbox bugs, and dropped messages (experiment 5).

**Client:**

- An IndexedDB **outbox** holds `{update_id, bytes}`, written in the same `'update'` handler for local origins.
- "Saved on this device" is shown only after the IndexedDB transaction's `complete` event.
- Remote updates are applied with origin `'remote'`. `sinceSeq` is advanced only after the apply and its IndexedDB write both commit.
- Adaptive polling:
  - **1–2 s** while a partner edited the same document in the last 60 s or a speech is in progress.
  - **10–15 s** otherwise.
  - **Paused** when `document.hidden`. Poll immediately on `visibilitychange`, `online`, and focus.
- Local edits are debounced at about 250–500 ms and sent in the same request as the poll.
- Cross-tab: a `BroadcastChannel` relays updates between tabs, or Web Locks allow one sync leader per document.

**Compaction** (after a write when `head_seq - snapshot_seq > 500` or updates exceed ~256 KB, plus the nightly cron):

1. Take the row lock.
2. Load the snapshot and updates into `new Y.Doc({ gc: true })`.
3. **If `doc.store.pendingStructs` or `pendingDs` is non-null, abort.** A dependency is missing, so keep the raw updates.
4. Otherwise write `encodeStateAsUpdate` as the new snapshot.
5. Delete updates ≤ `snapshot_seq` older than 7 days, keeping a forensic window.

Experiment 6 shows why re-encoding through a gc'd doc, not `mergeUpdates` alone, is what shrinks storage.

**Version history:**

- Keep live docs at `gc: true`.
- Save **full-state checkpoints** to `doc_version`: every ~15 min of activity, before any AI apply, before a restore, and at "speech delivered" or "round ended".
- **Restore** is a *forward* transaction in the live doc (origin `'restore'`) that replaces the section's content with the old version's content. Partners merge it like any edit, and nothing is rewritten.
- Show diffs by comparing `yXmlFragmentToProsemirrorJSON` of two versions.
- Switch to `gc: false` plus `Y.snapshot` only if you need keystroke-level time travel. It makes documents grow with every deletion.

**AI suggestions must never overwrite newer human edits.** Experiment 9 shows the CRDT alone doesn't guarantee this.

1. When a suggestion is requested, record the section, relative-position anchors for the target range (from `absolutePositionToRelativePosition`, encoded with `Y.encodeRelativePosition`), `base_text`, and the state vector.
2. AI output is **never written into the Y.Doc by the server**. It is stored as an `ai_suggestion` row and rendered as a decoration or side panel.
3. On accept, the client resolves the anchors against its current doc. If the text between them no longer equals `base_text`, the suggestion is marked `stale` and must be re-run.
4. Otherwise save a `doc_version` first, then apply the change in one Yjs transaction with a dedicated origin. Use `ydoc.transact(fn, new AiApplyOrigin(suggestionId))`, editing the section's Y types directly or through y-tiptap's `updateYFragment`.
   - Changes made through TipTap editor commands carry the ySync plugin's origin instead of your own [V-src].
   - `Y.UndoManager` matches a tracked origin either by identity or by its **constructor** [V-src, `UndoManager.js`]. So `Collaboration.configure({ yUndoOptions: { trackedOrigins: [AiApplyOrigin] } })` lets Ctrl-Z revert the AI change without touching human text (experiment 9).
5. Pure insertions, such as adding a new card section, never conflict and can skip the check.

**Presence:** the transport carries a small awareness payload: `{user, sectionId, cursor}` from y-protocols `encodeAwarenessUpdate`. The server keeps no in-memory state. It stores the payload in a `presence(doc_id, client_id, state, expires_at)` table with a 30 s TTL (matching y-protocols' timeout). Expect "who is in which section" and 1–2 s cursor latency, not character-level live cursors. With one editor per section sharing one awareness, y-tiptap draws a remote cursor only in the editor whose fragment contains it (it checks `anchor !== null && head !== null`) [V-src]. Test the focus/blur hand-off between section editors; all of them write the same `cursor` field by default.

### 6.6 Failure modes and mitigations [I unless marked]

| Failure | What happens | Mitigation |
|---|---|---|
| Lost request or response | Server or client misses updates. The server may hold `pendingStructs` [V-src exp.5]. | Outbox resend until acked. Periodic state-vector reconcile. Never compact while anything is pending. |
| Duplicate delivery | Harmless to Yjs (idempotent [R1]). Duplicate rows would bloat storage. | `UNIQUE(doc_id, update_id)` with `ON CONFLICT DO NOTHING`. |
| Out-of-order commits | A cursor skips an update (see sequence caution [PG1]). | Per-document row lock and counter. The cursor is `head_seq`, not a sequence. |
| Clock skew between devices | None for merging: Yjs uses per-client logical clocks. It can cause misleading "last saved" labels. | Use server time from each response for UI labels. Never order by client timestamps. |
| Concurrent section create or delete | Silent loss of a partner's text (exp. 1, 3). | Top-level fragments, UUID keys, tombstones. |
| Concurrent reorder | Duplicate entries if Y.Array delete+insert is used. | Fractional `order` key in section metadata. |
| Large document or initial import | Exceeds the 4.5 MB function body [V1]. | Per-section fragments. Sync requests ≤ ~1 MB with pagination. Serve the initial snapshot as a streamed response [V23]. |
| Stale client after a deploy (no Skew Protection on Hobby [V31]) | Old code calls new APIs. Server Actions fail [N4]. | Versioned Route Handlers and protocol header. Keep N-1 compatibility. Prompt a service-worker update only between rounds. |
| Captive portal (school Wi-Fi) | `navigator.onLine` is true [O7] but responses are HTML. | Validate content-type and protocol header. Treat anything else as offline. |
| Session expiry offline | 401 on sync. | Keep the outbox. Re-authenticate without clearing local data. |
| IndexedDB eviction | Unsynced edits lost (Safari 7-day rule, storage pressure) [O3][O5]. | `persist()`, installed PWA on iPad, a visible unsynced counter, and warn before closing with a non-empty outbox. |
| Two tabs offline | Each tab diverges until one reaches the server. | BroadcastChannel relay or a per-document Web Lock leader. |
| Neon quota exhausted mid-tournament | Compute suspended until next month [D3]. | Usage alerts at about 70%. Cap autoscaling at 0.25–0.5 CU. Upgrade path (Launch, pay-as-you-go [D1]). |
| Vercel Hobby limit exceeded | Feature paused up to 30 days [V3]. | Monitor usage weekly in tournament season. Move to Pro before hitting ~70%. |

### 6.7 Rough Hobby budget for sync [I, derived from verified allowances]

Assumptions: 10 users, 8 active hours per tournament day, about 770 requests per hour per active client with adaptive polling (20% of the time at 1.5 s, 80% at 10 s).

| Resource | Estimate | Allowance | Tournament days/month |
|---|---|---|---|
| Invocations | ≈ 60k per tournament day (Edge Requests similar) | 1M | **≈ 16** |
| Neon CU-hours | 8 h at 0.25 CU = 2 CU-h/day | 100 | ≈ 50 |
| Provisioned memory (worst case) | One instance kept alive all day: 2 GB × 8 h = 16 GB-h/day | 360 GB-h | ≈ 22 |
| Active CPU | Small per request | 4 CPU-h | Not binding for sync alone |

For 2–4 tournament weekends a month this fits, but with limited headroom. Pro costs $20 per developer seat per month [V3].

---

## 7. Offline / PWA

### 7.1 Verified facts

- **Next.js 16:**
  - Turbopack is the default for `next dev` **and** `next build`. A custom webpack configuration makes `next build` fail unless you pass `--webpack` [N5].
  - The official PWA guide points to **Serwist** for service-worker offline caching, with Turbopack and webpack examples [N1].
  - An **experimental** `useOffline()` hook exists behind `experimental.useOffline`. It detects failed requests and `offline` events and retries blocked navigations and Server Actions. It is "not recommended for production" [N2].
- **Serwist 9.5.12:**
  - With webpack, use `@serwist/next` and `withSerwistInit({ swSrc, swDest })`.
  - With **Turbopack**, use `@serwist/turbopack`. The service worker is served by a Route Handler at `app/serwist/[path]/route.ts` (`createSerwistRoute`) and registered with `<SerwistProvider swUrl="/serwist/sw.js">`.
  - The service worker supports precaching (`self.__SW_MANIFEST`, `additionalPrecacheEntries`), `defaultCache` runtime caching, and `fallbacks` for offline documents [O1][O2].
- **Storage quotas [O3][O4]:**
  - Chrome: up to **60% of disk** per origin.
  - Firefox best-effort: min(10% of disk, 10 GiB group limit). Persistent: up to 50%.
  - Safari 17+ browser apps: ~60% per origin and 80% overall.
  - LRU eviction under pressure.
- **Safari ITP:** script-writable storage (including IndexedDB and service-worker caches) is deleted after **7 days of Safari use without user interaction**. "Web applications added to the home screen … have their own counter of days of use" and are not expected to lose data [O3][O5].
- **`navigator.storage.persist()`:** Chrome and Safari grant or deny silently based on engagement. Firefox prompts. `estimate()` returns approximate figures [O3]. Safari 17 supports `persist()` and `persisted()` [O4].
- **IndexedDB durability hints:** `strict` commits after flush to persistent storage. `relaxed` commits after handing data to the OS [O6].
- `navigator.onLine` "is inherently unreliable" [O7]. The Background Sync API has "limited availability" (not Baseline) [O8].

### 7.2 Approach [I]

1. Build the **round workspace as a client-rendered shell**. The page itself does no request-time data fetching. It loads everything from IndexedDB first, then syncs. Server Components that fetch at request time can't render offline.
2. **Precache** the workspace route, its JavaScript and CSS chunks, fonts, and an offline fallback. Use `NetworkFirst` with a 3 s timeout for the workspace document, and `StaleWhileRevalidate` for static chunks. Never cache `/api/sync/*`, `/api/auth/*`, or private Blob routes.
3. Before a tournament, the app "prepares for offline": it downloads every document in the user's active rounds, verifies they open from IndexedDB, calls `navigator.storage.persist()`, and shows the result. On iPad, prompt the user to install to the home screen.
4. Service-worker updates use a waiting-then-activate flow. Only prompt to reload when the outbox is empty and no speech timer is running.
5. Don't rely on Background Sync (not in Safari). Sync on `online`, `visibilitychange`, focus, and a timer.

### 7.3 Accurate save status (state machine) [I]

The indicator shows one of these states:

1. **Saving on this device…** (IndexedDB transaction pending)
2. **Saved on this device** (IndexedDB `complete`, outbox has N entries)
3. **Syncing…**
4. **Synced 10:42** (outbox empty; server-acked `headSeq`; time comes from the server)
5. **Offline: N changes saved on this device**
6. **Sync failed: {reason}** (401, 403, 409 protocol, 413, or 5xx after retries; never silent)

The outbox count is the single truth for "unsynced". Show a red badge if the outbox holds items older than 10 min while the device appears online.

---

## 8. Documents

### 8.1 DOCX parsing

**mammoth 1.12.3 [F1]:**
- It "aims to produce simple and clean HTML by using semantic information in the document, and ignoring other details". It doesn't try to copy styling such as font, text size, and colour.
- Underlines are ignored by default.
- Style-map matchers for underline and highlight only match *explicit* run formatting, "not … because of its paragraph or run style".
- The `transformDocument` API is "unstable".
- It warns about pathological CPU and memory use on crafted files.

**Local test on the three Verbatim sample files in `docs/research/samples`:**

| File | Raw OOXML | mammoth default HTML |
|---|---|---|
| Climate Tradeoff DA | 183 direct `w:highlight`, 141 direct `w:u`, 236 `w:sz`, 334 `w:rStyle` | **0 `<mark>`, 0 `<u>`, no sizes** |
| Fracking Neg Addendum | 785 highlights | 0 `<mark>` |
| States CP | 100 highlights | 0 `<mark>` |

- mammoth warned "Unrecognised run style: 'Style Underline' / 'Emphasis' / 'Style 13 pt Bold'".
- Its internal model did expose direct highlight, underline, and size, but `isUnderline` counts equalled only the *direct* `w:u` count (141). The 166 "Style Underline" and 138 "Emphasis" runs were **not** resolved as underlined [V-src].

**Recommendation [I]:** keep the existing direct parser (`src/server/ingest/docx.ts`: fflate + `word/document.xml` + `word/styles.xml`). Resolve properties in OOXML order:

1. `docDefaults`
2. The paragraph style chain (`basedOn`)
3. The character style chain
4. Direct run properties

Implement the **toggle-property rule**: bold, italic, caps, and similar properties XOR across table, paragraph, and character styles, and direct formatting wins [F2].

- If replacing the custom tokenizer, `fast-xml-parser` 5.x needs `preserveOrder: true` to keep run order [F3]. `saxes` 6.0.0 (2022) streams well but is effectively unmaintained [npm].
- `officeparser` 8.0.0 builds a formatting AST with booleans such as `underline` plus a `styleMap`, and has layout-aware PDF parsing. Its README implies consumers resolve inheritance themselves [F4]. Use it at most as a secondary check.
- **Hardening [I]:** cap uncompressed size (e.g. 50 MB) and entry count, reject external relationships, run parsing in a step with a time budget, and store the original in Blob.

### 8.2 DOCX generation (`docx` 9.7.2)

**Verified in docs, type definitions, and a local run [F2][V-src]:**
- `styles.paragraphStyles` and `styles.characterStyles` take explicit `id`, `name`, `basedOn`, and `run`/`paragraph` options.
- Runs reference styles with `style: '<id>'`. Size is in half-points. Underline has 17 types.
- `highlight` is limited to the OOXML `HighlightColor` set: black, blue, cyan, darkBlue, darkCyan, darkGray, darkGreen, darkMagenta, darkRed, darkYellow, green, lightGray, magenta, none, red, white, yellow. Arbitrary colours require `shading`.
- `externalStyles` imports a Word `styles.xml`. `patchDocument()` fills templates.
- The local run emitted `StyleUnderline`/`Emphasis` IDs, `<w:rStyle w:val="StyleUnderline"/>`, `<w:highlight w:val="cyan"/>`, `<w:sz w:val="16"/>`, and `<w:pStyle w:val="Heading4"/>` as expected.

**Gotcha (verified locally):** declaring `{ id: 'Heading1', … }` in `paragraphStyles` produced **duplicate `w:styleId="Heading1"` and `"Heading4"`** entries, because docx already ships the defaults. Using `styles: { default: { heading1: {...}, heading4: {...} } }` produced none.

**[I]** For Verbatim compatibility, take `styles.xml` from a real Verbatim file, pass it as `externalStyles`, and emit its IDs:
- Pocket, Hat, Block, and Tag map to Heading 1–4.
- `StyleUnderline`, `Emphasis`, and the cite style keep their IDs.

### 8.3 PDF text extraction

- **unpdf 1.8.1** is a serverless PDF.js build (PDF.js v5.6.205). It runs in Node, Workers, and browsers.
  - `extractText({ mergePages })` returns plain text.
  - **`extractTextItems`** returns coordinates, font sizes, and direction, "for table detection or positional parsing".
  - `renderPageAsImage` requires `@napi-rs/canvas` [F5].
- `pdfjs-dist` latest is 6.3.289 [npm].
- **[I] Columns:** cluster text items by x-gaps per page (XY-cut), then sort by y within each column. Fall back to OCR or vision when the text layer is empty or garbled (low character-per-page ratio, or many replacement glyphs).

### 8.4 OCR and vision options

| Option | Verified facts | Notes |
|---|---|---|
| **Claude native PDF** | 32 MB per request; **600 pages** (100 when the context is under 1M tokens). Each page is converted to an image and its text extracted. About **1,500–3,000 text tokens per page** plus image tokens. GA on all active models [F6]. | Best when AI is already involved. Output is still model-generated, so treat it as machine-transcribed. |
| **Gemini** | Up to 50 MB or 1,000 pages. **258 tokens per page**. Native embedded text is extracted and "not charged" [F7]. | Cheap for long scans. Adds a provider. |
| **Mistral OCR 4.1** | **$4 per 1,000 pages** (OCR), $5 per 1,000 (Document AI). Markdown output with tables [F8]. The pricing FAQ says batch processing "reduces the price by 50%". **[U]** Whether that applies to OCR isn't stated. | Strong structure. Adds a provider. |
| **Google Document AI Enterprise OCR** | Tiered table: 0–1,000 pages "$0.00 (Free)", then **$1.50 per 1,000 pages** up to 5M, $0.60 above. Layout Parser $10 per 1,000 [F9]. **[U]** The page as fetched didn't make clear that the tiers reset monthly. | GCP account and credentials needed. |
| **Tesseract.js 7.0.0** | WASM; **does not accept PDFs** (images only); Node ≥ 16 [F10]. | Free. Needs rasterizing first. Weaker on multi-column scans **[I]**. |

**Accuracy:** no official, comparable benchmarks were verified **[U]**. **[I]** For evidence integrity, store OCR text as `transcription_source = 'ocr:<engine>'`. Require a human "matches the page image" confirmation before any OCR'd text can become card text. Keep the page image beside it.

### 8.5 Verifying that exported DOCX renders correctly [I, built on verified tools]

1. **Round-trip unit test (Vitest):** export, parse with our own OOXML parser, and assert the per-run text, underline, highlight, size, and style ID match the source model.
2. **Schema validation:** Open XML SDK `OpenXmlValidator` (NuGet `DocumentFormat.OpenXml` 3.5.1) in a small .NET CI step [F13].
3. **Render check:** `soffice --headless --convert-to pdf --outdir out file.docx`. Use `-env:UserInstallation=file:///tmp/lo-N` for parallel runs [F11]. Then run `unpdf` on the PDF and compare text order. Optionally add pixel snapshots.
   - LibreOffice is **not listed** in GitHub's ubuntu-24.04 runner image [F12], so install `libreoffice-writer` or use a container. It is not installed on this Mac.
   - Keep this in CI, not on Vercel.
4. Once per template change, spot-check manually in Microsoft Word, because LibreOffice's rendering isn't Word's.

---

## 9. Testing

- **Playwright 1.63** (latest since 2026-09-04) [T4][npm]:
  - Run two partners per test with two `browser.newContext()` calls.
  - `context.setOffline(true/false)` [T1].
  - `context.routeWebSocket(url, ws => ws.close(...))` (added in v1.48) simulates networks that block WebSockets [T2].
  - The Clock API (since 1.45) drives polling and timer logic [T4].
  - **Service workers work only in Chromium.** `serviceWorkers: 'block'` disables them [T3].
  - Against protected previews, set `extraHTTPHeaders` to `x-vercel-protection-bypass` plus `x-vercel-set-bypass-cookie: true` [V11], or use Trusted Sources OIDC from GitHub Actions [V12].
  - **[U]** Whether `setOffline` also cuts service-worker fetches or already-open sockets isn't documented. Assert both behaviours in a spike.
- **PGlite 0.5.8** embeds **PostgreSQL 18.3** (confirmed from the shipped WASM) [V-src].
  - Runs in memory, on the filesystem, or on IndexedDB. It is "single user/connection".
  - Contrib extensions include pg_trgm, fuzzystrmatch, unaccent, uuid-ossp, pgcrypto, and citext. pgvector ships separately as `@electric-sql/pglite-pgvector` (0.0.9) [T5][npm].
  - Drizzle supports it through `drizzle-orm/pglite` and its migrator [Z3][V-src].
  - **[I]** It can't test PgBouncer transaction-mode restrictions, multi-connection row-lock contention, or the Neon HTTP driver. Run a small integration suite against a Neon branch (reset from parent) in CI.
- **Vitest 5.0** (released 2026-09-03; latest 5.0.1) requires **Vite ≥ 6.4.0 and Node ≥ 22.12.0** [T6]. The local Node is 22.23.2.
- **[I] Suggested suites:**
  1. Randomized Yjs sync property tests: two to three clients with random interleaving, drops, duplicates, reordering, compaction, and reconnect. Assert convergence and no lost characters.
  2. AI-suggestion staleness tests.
  3. DOCX golden-file tests on `docs/research/samples`.
  4. E2E: partner A goes offline and edits while partner B edits, then A reconnects. Assert both edits are present and the status sequence is Saved on this device → Syncing → Synced.
  5. E2E with WebSockets blocked, confirming nothing depends on them.
  6. Upload > 4.5 MB through the presigned flow.

---

## 10. Current versions (npm registry, 2026-09-25)

| Package | Latest (date) | Notes |
|---|---|---|
| next | 16.3.6 (2026-09-22) | Canary 16.4.0-canary.45 |
| react | 19.3.0 (2026-09-09) | The repo pins 19.2.8 |
| yjs | 13.6.33 (2026-09-23) | v14 RC is published as `@y/y` 14.0.0-rc.7 |
| @tiptap/* (core, collaboration, collaboration-caret) | 3.31.3 (2026-09-04) | |
| @tiptap/y-tiptap | 3.0.9 (2026-08-18) | Peer of collaboration. Add it explicitly. |
| y-indexeddb / y-protocols | 9.0.12 (2023-11-02) / 1.0.7 (2025-12-16) | |
| @hocuspocus/server | 4.7.0 | |
| @liveblocks/yjs | 3.24.2 | |
| y-partyserver | 2.2.0 | |
| @y-sweet/sdk | 0.9.1 (2025-09-16) | |
| better-auth / @better-auth/drizzle-adapter / auth (CLI) | 1.7.6 (2026-09-24) | |
| next-auth | 4.24.15; v5 = 5.0.0-beta.32 | |
| drizzle-orm / drizzle-kit | 0.45.3 / 0.31.11 (2026-09-21) | 1.0.0-rc.4 |
| @neondatabase/serverless | 1.1.0 (2026-04-17) | |
| pg | 8.23.0 | |
| @neondatabase/auth | 0.5.0-beta | |
| @vercel/blob | 2.8.0 | |
| @vercel/functions | 3.9.9 | |
| @vercel/queue | 0.7.0 | |
| workflow | 4.8.9 (2026-09-15) | 5.0.0-beta.56 |
| inngest / @trigger.dev/sdk / @upstash/workflow | 4.21.0 / 4.6.4 / 1.3.3 | |
| serwist, @serwist/next, @serwist/turbopack | 9.5.12 (2026-07-22) | 10.0.0-preview |
| mammoth | 1.12.3 | |
| docx | 9.7.2 (2026-09-23) | |
| fflate / jszip / fast-xml-parser / saxes | 0.8.3 / 3.10.2 / 5.11.1 / 6.0.0 | |
| officeparser | 8.0.0 | |
| unpdf / pdfjs-dist | 1.8.1 / 6.3.289 | |
| tesseract.js | 7.0.0 | |
| resend | 6.29.0 | |
| @playwright/test | 1.63.0 | |
| vitest | 5.0.1 | |
| @electric-sql/pglite | 0.5.8 (PG 18.3) | |

---

## 11. Open questions and unverified items

1. **[U]** Do Vercel Workflows/Queues push callbacks reach **protected preview** deployments without configuration? Test on the first preview deploy.
2. **[U]** Do school networks buffer or kill SSE or long responses? Design assumes polling first and treats SSE as an optional enhancement.
3. **[U]** Does Playwright `setOffline` affect service-worker fetches and open sockets?
4. **[U]** Exact Jamsocket shutdown date. The hosted site now redirects to Modal's blog [R13].
5. **[U]** Liveblocks behaviour when WebSockets are blocked (no documented fallback).
6. **[U]** The Hobby Blob advanced-operation rate limit: 900/min on the pricing page vs 1,500/min on the limits page.
7. **[U]** Whether the "large functions" beta (up to 5 GB) is usable on Hobby for LibreOffice. The recommendation keeps rendering in CI regardless.
8. **Decision for the user:** confirm the app qualifies as non-commercial Hobby use [V32]. Otherwise budget for Pro ($20 per developer seat per month [V3]).
9. **Decision for the user:** a domain for email (Resend), or launch with admin-provisioned accounts only.

---

## 12. Notes on the in-repo sync store (commit `0f0433a`, read 2026-09-25)

These come from reading `src/server/docs/store.ts`, `src/app/api/docs/[docId]/sync/route.ts`, and `drizzle/0001_init.sql` **[V-src]**. The impact assessments are **[I]**.

1. **The cursor is a global `bigserial`.**
   - `doc_updates.seq` is `bigserial`. `pull()` returns rows with `seq > since` and sets `headSeq` to the last row seen.
   - If two pushes overlap (both partners typing) and the later sequence number commits first, a concurrent pull can report `headSeq = 105` before 104 is visible. That client then never receives 104 unless a state-vector reconcile runs [PG1].
   - Fix options:
     - Assign per-document sequence numbers under a `documents` row lock (`SELECT … FOR UPDATE`, then insert with `head_seq + i`), as in §6.5.
     - At minimum, make the client send `wantStateVector` periodically and push whatever the server lacks.
2. **Compaction can orphan or delete an update.**
   - `compact()` reads rows outside a transaction, sets `upTo` to the maximum `seq` it read, and in a batch sets `snapshotSeq = upTo` and deletes `seq <= upTo`.
   - An update with a lower `seq` that commits late is either deleted without being merged, or left below `snapshotSeq`. `pull()` and `loadDoc()` never read below `snapshotSeq`, so that update disappears from every client's view.
   - Fix: compact under the same per-document lock used for inserts (with the neon-http driver, keep it to a single statement or use a TCP or WebSocket transaction). Also skip compaction while `pendingStructs` or `pendingDs` is non-null.
3. **Compaction doesn't garbage-collect.** `compact()` uses `Y.mergeUpdates`. Re-encoding through `new Y.Doc({ gc: true })` stores much less (experiment 6: 19.9 KB vs 534 B).
4. **Server-side AI writes.** `applyServerChange()` writes server-side mutations, such as AI output, into the document. If AI output goes through it, callers must apply the precondition check from §6.5 (anchors plus `base_text`). Otherwise a stale server view can clobber a partner's offline edits (experiment 9).

---

## Appendix A: Reproducing the local experiments

Run with Node 22 and `npm i yjs@13.6.33 docx@9.7.2 fflate@0.8.3 mammoth@1.12.3`.

```js
// yjs-experiments.mjs (condensed): experiments 1, 5, 9 from §6.2
import * as Y from 'yjs'
const sync = (a, b) => { const sa = Y.encodeStateVector(a), sb = Y.encodeStateVector(b)
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, sa)); Y.applyUpdate(b, Y.encodeStateAsUpdate(a, sb)) }
const para = (s) => { const p = new Y.XmlElement('paragraph'); p.insert(0, [new Y.XmlText(s)]); return p }

// 1: concurrent creation of a nested fragment under the same map key -> one side's text is lost
{ const a = new Y.Doc(), b = new Y.Doc()
  const fa = new Y.XmlFragment(); a.getMap('sections').set('s1', fa); fa.insert(0, [para('A offline')])
  const fb = new Y.XmlFragment(); b.getMap('sections').set('s1', fb); fb.insert(0, [para('B offline')])
  sync(a, b); console.log(a.getMap('sections').get('s1').toString()) } // only one paragraph survives

// 5: dropped + duplicated + reordered delivery, repaired by one state-vector exchange
{ const c = new Y.Doc(), s = new Y.Doc(), ups = []; c.on('update', (u) => ups.push(u))
  const t = c.getText('t'); t.insert(0, 'a'); t.insert(1, 'b'); t.insert(2, 'c')
  Y.applyUpdate(s, ups[2]); Y.applyUpdate(s, ups[0]); Y.applyUpdate(s, ups[0])
  console.log(s.getText('t').toString(), s.store.pendingStructs !== null)          // "a" true
  Y.applyUpdate(s, Y.encodeStateAsUpdate(c, Y.encodeStateVector(s)))
  console.log(s.getText('t').toString(), s.store.pendingStructs !== null) }        // "abc" false

// 9: AI replace vs concurrent human insert; origin-scoped undo
{ const a = new Y.Doc(), b = new Y.Doc(); a.getText('t').insert(0, 'The plan solves warming.'); sync(a, b)
  a.transact(() => { const t = a.getText('t'); t.delete(4, 4); t.insert(4, 'CP') }, 'ai')
  b.getText('t').insert(6, '[human]'); sync(a, b)
  console.log(a.getText('t').toString()) }                                          // "The [human]CP solves warming."
```

```js
// docx duplicate-style check (§8.2)
import { Document, Packer, Paragraph, HeadingLevel } from 'docx'
import { unzipSync, strFromU8 } from 'fflate'
const ids = async (styles) => [...strFromU8(unzipSync(new Uint8Array(await Packer.toBuffer(new Document({ styles,
  sections: [{ children: [new Paragraph({ text: 'x', heading: HeadingLevel.HEADING_1 })] }] }))))['word/styles.xml'])
  .matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1])
const dups = (a) => a.filter((x, i) => a.indexOf(x) !== i)
console.log(dups(await ids({ paragraphStyles: [{ id: 'Heading1', name: 'Heading 1', run: { size: 52 } }] }))) // [ 'Heading1' ]
console.log(dups(await ids({ default: { heading1: { run: { size: 52 } } } })))                            // []
```

The mammoth check (§8.1) counted `<w:highlight`, `<w:u `, `<w:sz `, and `<w:rStyle` in `word/document.xml`, and compared them with `<mark>` and `<u>` in `mammoth.convertToHtml()` output. It also used `mammoth.transforms.run()` to count which run properties mammoth's model exposes.

---

## Sources (all accessed 2026-09-25)

**Vercel**
- [V1] https://vercel.com/docs/functions/limitations
- [V2] https://vercel.com/docs/functions/configuring-functions/duration
- [V3] https://vercel.com/docs/plans/hobby
- [V4] https://vercel.com/docs/limits
- [V5] https://vercel.com/docs/cron-jobs/usage-and-pricing
- [V6] https://vercel.com/docs/functions/streaming-functions
- [V7] https://vercel.com/docs/functions/usage-and-pricing
- [V8] https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- [V10] https://vercel.com/docs/deployment-protection
- [V11] https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
- [V12] https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources
- [V13] https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
- [V14] https://vercel.com/changelog/deployment-protection-is-now-enabled-by-default-for-new-projects
- [V15] https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication
- [V16] https://vercel.com/docs/functions/websockets
- [V17] https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel
- [V18] https://vercel.com/docs/vercel-blob
- [V19] https://vercel.com/docs/vercel-blob/usage-and-pricing
- [V20] https://vercel.com/docs/vercel-blob/client-upload
- [V21] https://vercel.com/docs/vercel-blob/private-storage
- [V22] https://vercel.com/docs/vercel-blob/vercel-signed-urls
- [V23] https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- [V24] https://vercel.com/docs/workflows
- [V25] https://vercel.com/docs/workflows/pricing
- [V26] https://vercel.com/docs/workflows/concepts
- [V27] https://vercel.com/blog/a-new-programming-model-for-durable-execution (GA 2026-04-16)
- [V28] https://vercel.com/docs/queues
- [V29] https://vercel.com/docs/queues/pricing
- [V30] https://vercel.com/kb/guide/how-to-run-background-jobs-in-nextjs-on-vercel
- [V31] https://vercel.com/docs/skew-protection
- [V32] https://vercel.com/docs/limits/fair-use-guidelines
- [V33] https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute
- [V34] https://vercel.com/marketplace/inngest
- [V35] https://vercel.com/marketplace/upstash

**Workflow SDK**
- [W1] https://workflow-sdk.dev/docs/foundations/errors-and-retries
- [W2] https://workflow-sdk.dev/docs/foundations/streaming
- [W3] https://workflow-sdk.dev/docs/api-reference/workflow-api/get-run
- [W4] https://workflow-sdk.dev/docs/api-reference/workflow-api/start
- [W5] https://workflow-sdk.dev/cookbook/agent-patterns/agent-cancellation
- [W6] https://workflow-sdk.dev/docs/foundations/idempotency
- [W7] https://workflow-sdk.dev/docs/getting-started/next

**Next.js**
- [N1] https://nextjs.org/docs/app/guides/progressive-web-apps
- [N2] https://nextjs.org/docs/app/api-reference/functions/use-offline
- [N3] https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- [N4] https://nextjs.org/docs/app/guides/server-actions
- [N5] https://nextjs.org/docs/app/guides/upgrading/version-16
- [N6] https://nextjs.org/docs/app/api-reference/functions/after

**Neon, Drizzle, Postgres**
- [D1] https://neon.com/docs/introduction/plans
- [D2] https://neon.com/pricing
- [D3] https://neon.com/faqs/free-plan-limits-and-quotas
- [D4] https://neon.com/docs/introduction/scale-to-zero
- [D5] https://neon.com/docs/serverless/serverless-driver
- [D6] https://neon.com/docs/connect/connection-pooling
- [D7] https://neon.com/guides/pub-sub-listen-notify
- [D8] https://neon.com/docs/extensions/pg-extensions
- [D9] https://neon.com/docs/introduction/branching
- [D10] https://neon.com/docs/guides/vercel-managed-integration
- [D11] https://neon.com/docs/guides/vercel-branch-cleanup
- [D12] https://neon.com/docs/guides/vercel-connection-methods
- [D13] https://neon.com/docs/postgresql/postgres-version-policy
- [D14] https://neon.com/docs/auth/overview
- [D15] https://neon.com/docs/auth/roadmap
- [D16] https://neon.com/docs/auth/guides/plugins/organization
- [D17] https://neon.com/docs/auth/guides/customize-emails
- [Z1] https://orm.drizzle.team/docs/get-started/neon-new
- [Z2] https://orm.drizzle.team/docs/migrations
- [Z3] https://orm.drizzle.team/docs/connect-pglite
- [PG1] https://www.postgresql.org/docs/current/functions-sequence.html

**Auth and email**
- [A1] https://www.better-auth.com/docs/integrations/next
- [A2] https://www.better-auth.com/docs/adapters/drizzle
- [A3] https://www.better-auth.com/docs/concepts/rate-limit
- [A4] https://www.better-auth.com/docs/concepts/session-management
- [A5] https://www.better-auth.com/docs/plugins/organization
- [A6] https://www.better-auth.com/docs/plugins/magic-link
- [A7] https://www.better-auth.com/docs/authentication/email-password
- [A8] https://www.better-auth.com/docs/plugins/admin
- [A9] https://www.better-auth.com/docs/concepts/database
- [A10] https://better-auth.com/blog/authjs-joins-better-auth (2025-09-22)
- [A11] https://clerk.com/pricing
- [A12] https://resend.com/pricing
- [A13] https://resend.com/docs/knowledge-base/403-error-resend-dev-domain

**Real-time**
- [R1] https://docs.yjs.dev/api/document-updates
- [R2] https://docs.yjs.dev/api/y.doc
- [R3] yjs 13.6.33 package source and README (`src/utils/Snapshot.js`, `src/structs/Item.js`, `src/types/YArray.js`): https://www.npmjs.com/package/yjs
- [R4] https://tiptap.dev/docs/editor/extensions/functionality/collaboration
- [R5] @tiptap/extension-collaboration 3.31.3 source (`src/collaboration.ts`): https://www.npmjs.com/package/@tiptap/extension-collaboration
- [R6] @tiptap/y-tiptap 3.0.9 dist: https://www.npmjs.com/package/@tiptap/y-tiptap
- [R7] https://tiptap.dev/docs/editor/extensions/functionality/collaboration-caret and @tiptap/extension-collaboration-caret 3.31.3 source
- [R8] y-indexeddb 9.0.12 source: https://www.npmjs.com/package/y-indexeddb
- [R9] https://github.com/yjs/y-protocols and y-protocols 1.0.7 source (`awareness.js`, `sync.js`)
- [R10] https://liveblocks.io/pricing
- [R11] https://liveblocks.io/docs/api-reference/liveblocks-yjs
- [R12] https://liveblocks.io/docs/platform/websocket-infrastructure
- [R13] https://modal.com/blog/jamsocket-is-joining-modal (target of 302 redirects from jamsocket.com and docs.jamsocket.com)
- [R14] https://github.com/jamsocket/y-sweet (GitHub API: `archived:false`, latest release v0.9.1 2025-09-16)
- [R15] https://blog.cloudflare.com/cloudflare-acquires-partykit/ (2024-04-05)
- [R16] https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver
- [R17] https://developers.cloudflare.com/durable-objects/platform/pricing/
- [R18] https://tiptap.dev/docs/hocuspocus/getting-started/overview
- [R19] https://electric.ax/pricing and https://electric.ax/docs/integrations/yjs

**Offline / web platform**
- [O1] https://serwist.pages.dev/docs/next/getting-started
- [O2] https://serwist.pages.dev/docs/next/turbo
- [O3] https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- [O4] https://webkit.org/blog/14403/updates-to-storage-policy/
- [O5] https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- [O6] https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability
- [O7] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- [O8] https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API

**Documents**
- [F1] mammoth 1.12.3 README: https://github.com/mwilliamson/mammoth.js
- [F2] https://github.com/dolanmiu/docx/tree/master/docs/usage (styling-with-js.md, styling-with-xml.md, text.md, patcher.md) and docx 9.7.2 type definitions
- [F3] https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/docs/v4,%20v5/2.XMLparseOptions.md
- [F4] officeparser 8.0.0 README: https://www.npmjs.com/package/officeparser
- [F5] https://github.com/unjs/unpdf
- [F6] https://platform.claude.com/docs/en/build-with-claude/pdf-support
- [F7] https://ai.google.dev/gemini-api/docs/document-processing
- [F8] https://mistral.ai/pricing/api and https://docs.mistral.ai/capabilities/document_ai/basic_ocr/
- [F9] https://cloud.google.com/document-ai/pricing
- [F10] https://github.com/naptha/tesseract.js
- [F11] https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
- [F12] https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
- [F13] https://learn.microsoft.com/en-us/office/open-xml/word/how-to-validate-a-word-processing-document and https://api.nuget.org/v3-flatcontainer/documentformat.openxml/index.json

**Jobs**
- [J1] https://www.inngest.com/pricing
- [J2] https://trigger.dev/pricing
- [J3] https://trigger.dev/docs/how-it-works
- [J4] https://upstash.com/pricing/workflow

**Testing**
- [T1] https://playwright.dev/docs/api/class-browsercontext
- [T2] https://playwright.dev/docs/api/class-websocketroute
- [T3] https://playwright.dev/docs/service-workers
- [T4] https://playwright.dev/docs/release-notes
- [T5] https://pglite.dev/docs/, https://pglite.dev/extensions/, and https://github.com/electric-sql/pglite
- [T6] https://vitest.dev/blog/vitest-5.html

**Package versions**
- [npm] registry.npmjs.org via `npm view <pkg> dist-tags time`, run 2026-09-25.
