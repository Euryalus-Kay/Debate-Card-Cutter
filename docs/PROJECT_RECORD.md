# Project Record — Clash (policy debate workspace)

Living record for the v2 rebuild. Keep it short and current. Detailed research lives in `docs/research/`.

- Repo: `github.com/Euryalus-Kay/Debate-Card-Cutter` (branch `rebuild/v2`)
- Local working copy: `~/Projects/Debate-Card-Cutter` (moved off the iCloud-synced Desktop — see P-01)
- Backups of pre-rebuild state: `~/Projects/debate-backups/` (never committed; repo is public)

---

## 1. Audit of the v1 application (2026-09-25)

### What v1 was
Next.js 16 app (`src/`), ~860 KB of TypeScript, ~30 API routes, ~15 pages (card cutter, argument builder,
library/folders, rounds + flow + speech generation, CX, blocks, judge, coach, drills, timer, toolkit,
impact calculator, strategy). Supabase (anon key, from server routes) for storage, Claude for all AI,
Perplexity for search, Gemini for one page. It was never deployed on Vercel: it ran locally and was
exposed through a Cloudflare tunnel (`zaincardcutter.xyz`).

### Current state: v1 is completely non-functional
| Dependency | Finding | Evidence |
|---|---|---|
| Supabase project `fhislyruzuypfxkqudyn` | Domain returns **NXDOMAIN** on public DNS (8.8.8.8, 1.1.1.1): the project is paused past its restore window or deleted. Every read/write fails. | `dig @8.8.8.8 fhislyruzuypfxkqudyn.supabase.co` |
| Claude models | v1 hard-codes `claude-opus-4-20250514` / `claude-sonnet-4-20250514`; both return `not_found_error` (retired). Every AI feature fails. | live API call 2026-09-25 |
| Perplexity | Key returns `insufficient_quota`. All research fails. | live API call |
| Gemini | `GEMINI_API_KEY` never configured. Strategy page fails. | `.env` |

### Root causes of "unreliable storage"
1. **Supabase free-tier auto-pause** (7 days of inactivity) followed by expiry. This is the most likely cause of the
   intermittent failures before the total outage.
2. **Code writes to tables/columns that the schema never creates**: `build_jobs`, `card_folders`, `card_folder_items`,
   `frontline_blocks`, `sort_profiles`, and `arguments.argument_type/strategy_overview/components`.
   Insert errors are usually not checked, so saves fail silently.
3. **Destructive regeneration**: flow regeneration deletes all `flow_entries` and reinserts them, which destroys manual corrections.
   `iterate-speech` rewrites the whole speech HTML, overwriting edits. There are no revisions.
4. **No concurrency control**: last write wins everywhere. Partners overwrite each other.
5. **In-memory state in serverless routes**: timer sharing uses a per-process `Map`, so it breaks across instances or restarts.
6. **No offline handling**: a network drop mid-request loses the work.

### Security findings
- **Repo is PUBLIC, and git history contains secrets**: the Perplexity key currently in `.env` (commit `0726f57`), the Supabase URL,
  and the anon key. (The Anthropic key in history is an old one; the current key is not in history.) → rotate/revoke.
- No authentication: users pick a name from a list (stored in `localStorage`). Anyone can impersonate anyone.
- All RLS policies are `USING (true) WITH CHECK (true)`. Combined with the public anon key, anyone could read, modify, or delete all data.
- Admin "approval" passcode `8867` is hard-coded in client JS.
- PostgREST filter built from unsanitized input (`.or(\`user_name.eq.${user},...\`)`).

### Evidence-integrity findings (critical for the product's purpose)
- The card generator asks the model to **retype 6–25 paragraphs "verbatim"**. Nothing deterministically checks the output against the source.
- If the scrape returns under 200 characters, **the Perplexity AI answer is used as "full source text"**, which lets the AI summary be quoted as evidence.
- The model is told to fill in "every credential the source supports" without any verification, so qualifications can be invented.
- The speech generator takes the *first* search result without evaluating it.
- DOCX import goes through mammoth (loses highlight colors and font sizes), then an LLM re-types the whole file into cards. That is slow, costly, and can alter text.

### Debate-logic findings
- Speech order and times are hard-coded (8/3/5), with no prep time and no format configuration.
- Parsed arguments get throwaway IDs (`gen-0`…), so nothing stable links flow ↔ speech ↔ cards.
- There is no distinction between documented, delivered, and inferred content. `is_dropped` is set by the model.
- Speech planning sends *every shared card in the database* to the model.

### Retain / repair / replace / migrate
| Item | Decision |
|---|---|
| Next.js + TypeScript + Vercel | **Retain** (upgrade to current versions) |
| Supabase (dead) | **Replace** with Neon Postgres (already installed on the Vercel team) — see D-02 |
| Name-picker "auth" | **Replace** with real accounts + team membership authorization |
| Card generation pipeline | **Replace**: span-selection over stored source text + deterministic verification |
| DOCX import (mammoth + LLM retype) | **Replace**: direct OOXML parser that preserves Verbatim structure |
| Speech/flow model (JSON blobs, destructive regen) | **Replace**: structured round graph with stable IDs + CRDT drafts |
| Prompt knowledge (highlighting guidance, judge paradigms, debate knowledge) | **Salvage** where consistent with research |
| Practice features (drills, coach, impact calc) | **Defer**; not core to the three purposes |
| Timer | **Rebuild** inside the round workspace (shared via DB, not memory) |
| v1 data (cards, arguments, rounds) | **Migrate if recoverable**: an importer is ready, but it needs the Supabase backup (EXT-01) |

---

## 2. Problems log
| ID | Problem | Status |
|---|---|---|
| P-01 | Desktop folder is iCloud-synced; git objects evicted ("dataless") → `git log` hangs | Worked around: fresh clone in `~/Projects` |
| P-02 | Supabase project unreachable (NXDOMAIN) | Replaced (D-02); data recovery needs user (EXT-01) |
| P-03 | Retired Claude model IDs | Fixed in v2 (model registry, D-05) |
| P-04 | Perplexity key leaked + out of quota | User action (EXT-02) |
| P-05 | Public repo with secrets in history | User action recommended (EXT-03) |
| P-06 | Global sequence numbers could let a client skip a concurrently committed update | Fixed (D-04a); verified by `scripts/sync-stress.ts` on Neon |
| P-07 | Pull read snapshot pointer and rows in two statements → updates hidden by concurrent compaction (stress test: a puller ended with 87/200 items) | Fixed: single-statement pull; 5/5 stress runs pass |
| P-08 | Concurrent creation of the same keyed nested Y.Map loses fields | Fixed (D-04b); unit-tested |

## 3. Architecture decisions
| ID | Decision | Rationale (evidence) |
|---|---|---|
| D-01 | Rebuild on current Next.js 16 / React 19 / TypeScript, deployed to Vercel project `clash-debate` | Retain the familiar stack; v1 code kept on `main` for reference |
| D-02 | **Neon Postgres** (Vercel Marketplace, already installed) instead of Supabase | Supabase free tier pauses after 7 days idle and v1's project expired. Neon scales to zero but resumes automatically, and needs no new account. Trade-off: no built-in realtime/auth/storage, so those are handled below |
| D-03 | Better Auth (email + password) for accounts; **custom teams + hashed invite links** (no email dependency) | Self-hosted, current (1.7.6). Team authorization is simple SQL checked on every route (`server/authz.ts`) |
| D-04 | **Yjs CRDT documents** for speech drafts, library files, and round state, synced over **plain HTTPS** (adaptive polling, no WebSockets) | School/tournament networks may block WebSockets; every hosted Yjs backend requires them (infrastructure.md §6.4). CRDT merge means no lost edits; IndexedDB outbox gives offline recovery |
| D-04a | Per-document `head_seq` bumped under the row lock in a single statement; `pull` is a single statement | Found by research review + reproduced by stress test: a global bigserial and two-statement pull could skip updates (P-06, P-07) |
| D-04b | Keyed shared records (slots, strategy) use flat Y.Map keys | Concurrent creation of the same nested Y.Map loses one side's fields (infrastructure.md §6.2) |
| D-05 | One model registry; task-specific routing. Anthropic-first: AI SDK 7 + `@ai-sdk/anthropic` for streamed/structured work; raw Anthropic SDK for evidence retrieval (`web_fetch` returns full text) | models-and-providers.md §9. Gemini excluded: API terms forbid apps likely used by under-18s |
| D-06 | Evidence text is never produced by a model: models select spans/phrases; code copies verbatim text from stored sources and verifies it (`domain/verify.ts`) | Core integrity requirement; v1 let the model retype sources |
| D-07 | Direct OOXML parser for DOCX import; hand-written OOXML writer for export (Verbatim style IDs: Heading1–4 = Pocket/Hat/Block/Tag; character styles for cite/underline/emphasis) | mammoth drops highlights and style-based underline (verified on real files, infrastructure.md §8.1) |
| D-08 | Card text is protected in the editor (marks editable, text not) and sections can be locked; enforced by ProseMirror transaction filters | Human control + integrity; tested in `shared/__tests__/editor.test.ts` |
| D-09 | AI output is stored as a proposal tied to the hashes of its inputs; humans apply it, and stale proposals are flagged | Never overwrite newer human work |

## 4. External dependencies requiring user action
| ID | What | Status |
|---|---|---|
| EXT-01 | Recover v1 data from Supabase dashboard (restore or download backup) | Requested |
| EXT-02 | Revoke leaked Perplexity key | Requested |
| EXT-03 | Consider making the GitHub repo private | Recommended |

## 5. Test results
Each entry is marked **verified**, **partially verified**, or **unverified**.

| Date | Area | Result | Status |
|---|---|---|---|
| 09-25 | Domain logic: formats, timing/calibration, citations, quote verification, coverage, contradictions | 39 unit tests pass | verified |
| 09-25 | DOCX export → import round trip (headings, cites, underline/emphasis/highlight spans, omissions) | pass | verified (synthetic fixture; real Verbatim files pending) |
| 09-25 | Editor integrity guards (card text protected, marks editable, locks, id de-duplication) | 7 tests pass (happy-dom) | verified |
| 09-25 | Doc store on PGlite: convergence, dedupe, compaction, server-side changes | 4 tests pass | verified |
| 09-25 | Client sync: offline edits survive restart, lost response no duplicate, concurrent merge, repair handshake | 5 tests pass | verified |
| 09-25 | **Neon concurrency stress**: 4 writers × 50 updates, 3 pullers, concurrent compaction | 5/5 runs: all pullers converge to 200/200 | verified |
