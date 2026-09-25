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

## 3. Architecture decisions
(see section entries D-xx below; rationale kept brief)

## 4. External dependencies requiring user action
| ID | What | Status |
|---|---|---|
| EXT-01 | Recover v1 data from Supabase dashboard (restore or download backup) | Requested |
| EXT-02 | Revoke leaked Perplexity key | Requested |
| EXT-03 | Consider making the GitHub repo private | Recommended |

## 5. Test results
(to be filled as tests run; each entry marked **verified / partially verified / unverified**)
