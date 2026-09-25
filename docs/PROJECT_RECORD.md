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
| P-09 | Verbatim imports: 50/53 real cites came out "Unknown author ND" | Fixed: Cite char-style detection, year formats ('19, 2K, m/d/yy); 53/53 cites and years parse |
| P-10 | Sonnet 5 at low effort took >20 s to first output on drafting | Re-benchmarked; drafting routed to Opus 5.5 (D-05a) |
| P-11 | Section hashes differed between browser and server for any section containing a card (synced doc writes `attrs: {}` on marks and omits nulls), so AI revisions of card sections were always "stale" | Fixed: server round-trips through the editor schema; hash ignores nulls/empty attrs; regression test fails on old code |
| P-12 | Vercel project framework preset was "Other": first production deploy served 404 everywhere | Fixed: `vercel.json` pins `framework: nextjs`, region iad1 |
| P-13 | One `DATABASE_URL` shared by Production, Preview, and Development: local testing wrote to what would be the production DB | Fixed without deleting anything: new isolated `clash_prod` database (D-10) |
| P-14 | Research job made 5 cards when 3 were requested (parallel workers didn't count in-flight cuts) | Fixed; verified 2/2 |
| P-15 | Fit-to-time plan cut 2.5 min when 1.3 min was needed (model had no words-per-second budget) | Fixed: prompt gives measured rates and a cut budget; lands within 10 s of target |
| P-16 | Drafts ran short (fast 2AC 4:26–6:49 of 8:00): models write ~25–40% fewer words than a fast speaker needs for their own time budgets | Mitigated: card read times + word targets in the prompt; "Fill to time" with a rate-exact top-up writer lands at the 95% target (6:49 → 7:36) |
| P-17 | Export/deliver/AI read the server copy, so edits typed in the last moment could be missing | Fixed: flush pending edits first (found by E2E) |
| P-18 | "Add section" split the current paragraph and could leave keyboard focus on a toolbar/lock button (a typed space toggled a lock) | Fixed: insert after the current section, focus synchronously, select the heading; toolbar keeps editor focus (found by E2E on the production build) |
| P-19 | Judge-paradigm reading: Haiku 4.5 misread "won't judge kick unless told to" as "no"; "slow down on tags" read as overall slow | Fixed: Sonnet 5 (thinking off) + explicit value definitions; stable over 3 runs |
| P-20 | The AI cutter over-highlighted: it read 53% of short (~118-word) excerpts, while real camp-file cards (2021 Open Evidence files, not the user's) read ~17% of ~600 words (≈100 words, 80% of read sentences keep a verb) | Fixed (D-20): longer excerpts with context, read length set in seconds, highlighting written as sentences; measured on 16 real cards |
| P-21 | Drafts missed the time limit: deep (medium) 2AC drafts ran 472–542 s of 480; a fast 1AR ran 252 s of 300 | Fixed (D-21): automatic trim/fill to time after every draft |
| P-22 | First Opus low-vs-medium drafting test was invalid: judges saw only selected cards while drafters also saw library cards, so judges called a real library card (Roper '15) "fabricated" | Fixed in run 2 (judges get the drafters' exact evidence); run 1 marked flawed in its results file |
| P-23 | Automatic fill overshot (fast 2AC filled 5:39 → 8:06 of 8:00, found by the AI E2E test); the word allocator dropped small changes entirely; dense trims needed more than one pass | Fixed: fills are accepted most-important-first only while the speech stays under 98% of the limit; small changes are concentrated in fewer sections; up to three trim passes, each aiming lower (unit tests + 6 live drafts + E2E) |
| P-24 | Qualifier protection could pull words from a skipped clause into the read ("The plan, which would cost $5B, solves" → "The plan would solves"; "regulation, not subsidies, because" → "regulation not because") | Fixed: research-based head rules (D-20a); regression tests with the research's synthetic examples |
| P-25 | Tag-number check flagged ranges: tag "7–9%" vs card "7%–9%" | Fixed: a trailing % covers the whole range; unit test |
| P-26 | Typed-notes lines next to a flowed line showed as "edited" (a mark's end boundary counted as touching the next line) | Fixed: half-open line ranges; unit tests |
| P-27 | Extensions linked to their argument ("extend our 2AC 4 against their 2NC 7") didn't count as answering it: the 1AR showed 7 unanswered when 5 were answered, and the update model's correct "link" suggestions were then filtered out (found in a live update run) | Fixed: such an extension answers their argument; only our arguments count as extended; test |
| P-28 | Editing a typed line that was already on the flow created a duplicate argument in an "unsorted" position and left the line "not on the flow" for good; the AI quoted only the new words and was rejected (found live) | Fixed: an edited line is re-read in place (same ids; undo restores the old reading); the AI is told the line was edited; a new line joins the position of the flowed line above it; a line flowed again after an undo comes back; 3 tests |
| P-29 | The "bare perm" check fired on sections defending the perm against their perm answers | Fixed: only sections that make a perm are checked |
| P-31 | The suggestion layer crashed the page (maximum call stack): the editor-state hook deep-compares what its selector returns, and it was given the whole ProseMirror document | Fixed: the selector returns the transaction count |
| P-32 | After accepting an AI comment's suggested words, the thread's highlight shrank to one word (its anchor sat on replaced text); an AI reply could sort above the question that asked for it (same millisecond) | Fixed: the thread re-anchors to the new words; AI replies are timed after the last message |
| P-33 | The E2E "synthetic" 1NC fixture actually contained five real 2021 camp-file cards (article text); the camp sample files themselves were correctly git-ignored and never committed | Fixed: `scripts/make-fixtures.ts` writes a fully invented fixture (fictional authors, sources marked as test sources) with the same shape; all E2E tests pass on it |
| P-34 | Marking a card "not read" protected the whole argument from later AI refinement; "Confirm read as documented" didn't mark the arguments delivered; quick-added arguments recorded the author as "me"; re-delivering a draft could delete an argument a person had corrected; inserting a file block dropped each analytic's explanation | Fixed: field-level protection for single human choices; confirm/undo updates delivery; real user ids; human-corrected arguments survive re-delivery; analytic explanations are inserted; tests |
| P-35 | AI operations couldn't be stopped, and one whose server function died stayed "running" forever | Fixed: Stop (either partner; the running request aborts within about 3 s); operations silent for 6 minutes are marked interrupted |
| P-36 | A fast 2AC took 98 s on production: the draft itself is about 46 s (as before), but the automatic fill to time rewrote 10 sections in one sequential call (about 31 s); progress read "section 19 of 19" because the model's outline listed only the positions | Fixed: rewrites run in up to three parallel batches (fill about 15 s; total 78 → 62 s locally); the section count uses what the speech must answer as a floor |
| P-37 | The AI splitter mislabeled large unstyled files: tags labeled as headings right above a citation, long runs of article text labeled "cite", a tag and its cite swallowed into card text, and article subheadings splitting a card | Fixed: the model sees a few lines before its chunk, and layout rules repair its labels (whatever sits right above a citation is its tag; a citation is at most two lines; subheadings between card text stay in the card); Blockchain aff recall 0.79 → 0.88 |
| P-38 | The import benchmark scored a merged card (two cards joined) as a match, and undercounted files that repeat a card in several blocks | Fixed (run 5): a match needs similar length, and each side is scored on its own; runs 1–4 are not comparable with run 5 |
| P-39 | Re-importing the same file created copies: stored formatting came back from Postgres with its keys in a different order, so identical cards looked different | Fixed: duplicates compare the tag and formatting spans as values |
| P-40 | The Verbatim parser folded a card whose tag lacked the Tag style (bold, pasted in) into the previous card's text | Fixed (D-36): 58 more cards found across 23 camp files (1,426 → 1,484), spot-checked |
| P-41 | Pasting a transcript was unavailable in rounds whose rules forbid recording, though pasting text isn't recording | Fixed: only live capture and audio uploads follow the recording rule |
| P-42 | Security: speech-to-text accepted any storage URL for an uploaded recording and deleted it afterward, and the upload, import and transcription routes checked only a path prefix, which `..` segments could escape once the path became a URL (a member of one team could read or delete another team's file if they knew its name) | Fixed before deploying: one check (`isTeamIncomingPath`) refuses anything outside the team's upload folder, including dot segments, encodings and doubled slashes; recordings are read by path from the round's own team only; tests + production smoke step |
| P-43 | Inside a round, AI proposals, the evidence panel, files and round research used the team picked in the sidebar, not the round's team: someone on two teams would have had cards fetched from, and research saved to, the wrong team (found by the library reuse E2E test, which uses a second team) | Fixed: everything inside a round is scoped to the round's team (`TeamScope`) |
| P-44 | The library check on Haiku 4.5 offered the other side's cards (States CP solvency, federal follow-on) as answers to that CP: they share its topic. Telling it our side and the file headings removed half | Fixed: the check first classifies every card's side and code drops the opponent's; Sonnet 5 (thinking off) offered only aff answers in 2 of 2 runs (D-37) |
| P-30 | A proposal restored from history could sit above the one just requested; server-applied flow updates took the panel's pending-proposal slots | Fixed: newest first; flow updates excluded; updates with nothing to change are closed automatically |

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
| D-05a | Model routing from live benchmarks: drafting and flow interpretation on Opus 5.5 (low effort for fast mode, medium for deep); card cutting on Opus 5.5 low; quick section rewrites on Sonnet 5 (thinking off); fit-to-time on Opus 5.5 low. Every task has fallbacks | `docs/evals/results/draft-latency-2ac-run1.json`, `card-cut-run1.json`, `card-cut-run3.json`: Opus 5.5 low had the fastest first output (2–3 s), kept authors' hedges in tags, had zero unmatched phrases and no lint errors; Sonnet 5 (thinking off) dropped hedges; Haiku 4.5 missed phrases |
| D-10 | Production uses its own database (`clash_prod`, same Neon project) via `APP_DATABASE_URL` (Production only); previews and local development use the original database | Isolated resources without touching existing data; created by `scripts/create-prod-db.ts` (non-destructive) |
| D-11 | Research pipeline: search results are leads only. Every source is fetched and stored in full (robots.txt respected; Anthropic `web_fetch` as fallback for bot-walled sites), the model picks one contiguous passage + exact phrases, code copies and verifies the text, and citation fields come only from page metadata or text it can point to | NSDA 7.1–7.2; user requirement "no fabricated quotes, sources, or qualifications" |
| D-12 | Durable jobs without extra infrastructure: checkpoint after every step, 90 s lease, resume when a status poll finds the lease expired, cancel flag checked at each checkpoint | Survives Vercel timeouts/deploys; verified on production |
| D-13 | Accounts are invite-only in production (first account exempt) | A public URL with open signup would let strangers spend the team's AI budget |
| D-14 | Offline: service worker caches app code, visited pages, and round data; edits queue in IndexedDB; sign-out flushes, warns about unsent edits, and clears the device | Tournament Wi-Fi; shared computers |
| D-15 | Judge profiles: every preference must quote the paradigm (unquoted values reset to unknown); used in AI context and to cap time estimates at the judge's pace (TIME-6) | JUD-1..3; avoid inventing judge preferences |
| D-16 | Speaker assignment per round and per speech (FMT-2); each speech is timed at its speaker's calibrated pace in the UI and in AI requests | Partners speak at different speeds; rebuttals are sometimes swapped |
| D-17 | Cross-ex notes are separate shared texts (one per CX), never flow arguments, labeled as CX in AI context (SEQ-4) | CX answers matter only when a speech uses them |
| D-18 | Prep overage is shown as time over; the round can apply the tournament rule "deduct from the next speech" | KSHSAA / NDT rules differ by tournament |
| D-19 | Backfiles stay browsable as files: the round's Evidence tab lists each file's pockets/hats/blocks and inserts a whole block (cards linked to their library copies) after the current section | Debaters use prepared blocks, not single cards, in rounds |
| D-20 | Highlighting engine: the model writes the words to read aloud as sentences (short read = highlight, long read = underline) using only the card's words in order; code aligns them onto the verbatim text with a fewest-fragments search, adds back any skipped negation or hedge ("not", "may", "unless" …), measures readability (fragments per 100 words, one-word pieces, dangling function words, sentences with a verb), and repairs once if off target or choppy. Read length is chosen in seconds at the speaker's card pace (Re-highlight: 10/20/30 s or custom) | Debaters need highlighted text that reads as sentences and keeps the author's meaning. Blind test on 16 real camp-file cards (2021 Open Evidence files from the Internet Archive; earlier notes wrongly called them the user's): Opus 5.5 low 7.4/10 vs the original human highlighting 6.0 (both judges), all models within ±10% of the target length (`highlight-bench-run1.json`) |
| D-20a | Highlight safeguards from `docs/research/highlighting.md` §6 (28 sources; measured on 31 camp cards and 2,695 open-source cards), applied after alignment, adding or dropping only the card's own words: a skipped negator is restored when the word it governs is read (not for "not only", "not X but Y", "X, not Y", "or not"); a hedge or scope word (may, could, likely, suggests, some, most, often, rarely …) is restored with the words up to the one it governs; a read number keeps its bound ("as much as", "up to", "nearly"), magnitude ("billion", "percent") and symbol (%, $); an article that no longer fits the next read word gets its skipped adjective back; a read sentence doesn't stop on "the/of/and"; an attribution ("Some analysts argue that") is read when the author's rebuttal is read. Notes shown to the debater: a skipped limiting clause (although/unless), a skipped rebuttal sentence, a skipped baseline ("from 52 … to 38"). Reading an attributed view whose rebuttal is skipped (straw man), or skipping a figure the tag cites, triggers one redo | Faithfulness first, then grammar, then brevity (research §6 ordering). Benchmark on 16 real cards: 7.36 → 7.44 average judge score, 8.4 → 6.8 fragments per 100 read words, dangling phrase ends 5% → 2% (`highlight-bench-run2.json`) |
| D-21 | Every draft is brought to time before it is shown: if it runs over the limit (or leaves more than 10% unused), code computes an exact analytic word count per section from the speaker's measured pace (lower-priority sections give up more; floors and caps per section) and one Sonnet 5 call rewrites those sections to length. Cards are never touched; the panel says what was trimmed or filled | Models budget words loosely (P-16, P-21); an over-time speech isn't deliverable. Word allocation is unit-tested (`length-plan.test.ts`) |
| D-23 | Each round picks a tournament rule set (NSDA, UIL/Texas, Ohio, tournament allows AI, practice) that sets in-round AI and recording. The team default is "AI allowed" (the user's decision after seeing the NSDA, UIL and Ohio rules), with the NSDA outside-assistance rule shown as a reminder. With AI off, typed notes still reach the flow through the built-in parser | COMP-1; `src/domain/rules.ts` |
| D-24 | "What I heard": each partner types the other team's speech (analytics included) in their own shared pad; lines are anchored with Yjs relative positions, so partners never overwrite each other and edited lines are detected. The AI turns lines into arguments only as exact quotes of the line (checked in code: substring, coverage, novelty); the no-AI parser covers offline, AI-off rounds, and anything the AI misses | Opponents' analytics are never in their speech doc; `src/shared/heard-apply.ts`, `src/domain/flow-extract.ts` |
| D-25 | Speech checks ("drop nothing") are one pure function run in the browser and on the server: the 2AC must answer every 1NC off-case position, the 1AR every position the block extended, and final rebuttals every unanswered argument on the flows they go for (critical); plus the research norms (double turns, bare perms, warrants, "even if", ballot sentence). Any section can be linked to the arguments it answers | `docs/research/speech-strategy.md`; `src/domain/speech-checks.ts` |
| D-26 | Patch, don't regenerate: when a draft has content, "Update this draft" is the default (a full rebuild goes into a new draft tab). Code computes what changed: new arguments nothing answers, answers whose argument's words changed (each AI section stores a hash of the arguments it was written against), and links to arguments no longer on the flow. The model proposes only additions, links, and minimal edits; code checks every id, drops second answers to answered arguments, and decides where each answer goes (under that position; after it when locked; a new position section otherwise). The browser syncs first, claims the update so partners never apply it twice, and applies with lock, staleness and "partner is typing here" checks and deterministic ids. Live pre-drafting (a shared switch): after each flow update during their speech, one update of our next speech's draft, at most once a minute | User request: "live change just the few elements and rewrite just where necessary"; `src/domain/patch.ts`, `patchSpeech` in `src/server/ai/ops.ts` |
| D-27 | Every AI job reports its stage, parts done, and time left. Drafts list their outline before writing, so "section k of n" is known; time left is the job's own pace once a part is done, else the median of the task's last 30 runs (telemetry). Shown in the AI panel and as a small bar next to "Build / revise"; the flow pad shows the flow update's stage | User request: "a good status indicator to show how close the AI is to finishing"; `src/server/ai/progress.ts`, `src/features/rounds/ai-progress.tsx` |
| D-28 | Partners together (A7): every AI job the browser runs is written to a shared activity map in the round document (who, what, stage, time left); the partner sees it live, fetches the finished proposal at once, and a proposal applied or dismissed by one partner closes for the other | User request: "my partner can seamlessly and simultaneously work in my round, see things I generate and use AI to edit" |
| D-29 | Precise AI edits: select your own words (never card text) and "Ask AI" (sharpen, shorten, add the warrant, answer their argument, plain English, fix grammar, or an instruction). The words are anchored with Yjs relative positions, so the suggestion stays on them while the partner edits; it shows a word diff and changes nothing until accepted, and refuses to apply over words changed meanwhile. Anything the new words add that the section, its cards, and the flow don't contain (an author, a date, a number) is flagged | Evidence integrity + "AI editing of very specific parts … seamless"; `src/features/rounds/editor/span-ai.tsx`, `editSpan` |
| D-30 | Comments live in the draft's own Y.Doc (flat keys, so simultaneous replies merge), anchored to words, shared live and offline. "@AI" in a comment makes the AI answer in the thread and optionally suggest new words, which apply only to the commented words (and re-anchor the thread to them) | `src/shared/comments.ts`, `src/features/rounds/comments.tsx` |
| D-31 | Internal ids never reach debaters: a prompt rule plus code that strips id-like tokens from every AI text shown or inserted (drafts, updates, fits, revisions, edits, comment replies) | Found live: an @AI reply quoted a section id |
| D-32 | Big files (B1): the browser uploads straight to Vercel Blob (up to 50 MB), and an import job processes the file in steps it checkpoints (240 s per run, a lease against double work, resumed by the next poll), with progress. Files with Verbatim styles parse without AI; files without structure (Google Docs exports, PDFs, text) are split by Haiku 4.5, which only labels paragraphs (heading, tag, cite, card text, analytic, other). Code builds every card from the file's own paragraphs, so card text and formatting are the file's by construction | User request: "a cheap AI like Haiku will break it down into the highlighted cards"; evidence integrity. `src/server/library/` |
| D-33 | Library labels: Haiku 4.5 reads each imported card's headings, tag, cite and read text and records side, argument type, position, role, and a one-line claim (about $0.50 per 1,000 cards). Labels are searchable (weighted below the tag and cite) and never change the card | So speeches can find the right card (B2) |
| D-34 | Duplicates and variants: the same text with the same tag and formatting is skipped on import; the same text cut differently (another tag or highlighting) is kept as a variant of the first | Camp files repeat cards across blocks |
| D-35 | Speech-to-text (Phase C) is optional; typed notes stay primary. Live capture of a browser tab (Zoom web, NSDA Campus), the Zoom app (screen and system audio), or the microphone, in 20 s pieces transcribed by OpenAI `gpt-transcribe` when `OPENAI_API_KEY` is set (audio deleted as soon as the text returns); without the key, Chrome's on-device recognition. Transcripts (WebVTT, SRT, Otter, text) can be pasted or uploaded. All of it lands in the speech's transcript pad and goes onto the flow like typed notes. Recording needs everyone's agreement first (consent dialog; Illinois law), is off under tournament rule sets that forbid it, and identifies no one by voice. The browser may use the microphone and screen capture only on the app's own pages | User request: "voice memo … upload for transcript or audio … if it's on Zoom it can record the computer … generate without or with"; `docs/research/audio.md` |
| D-36 | Parser: a bold line directly above a citation line is a tag even without the Tag style (unless it is itself a short cite, or the next line is also all bold) | Found by the import benchmark (P-40) |
| D-37 | Library retrieval (B2): for each argument the speech must still answer (up to 30), Postgres finds candidates (full text over tag, cite, labels and card text, plus tag similarity; cards our side reads), and Sonnet 5 (thinking off) first says which side reads each card, then lists only the pairs that fit (2 = helps, 3 = proves it) with what the card proves there. The opponent's cards never fit, nor copies of evidence they read this round. Only fitting cards reach the drafter, each with its FITS line, under a rule to read one only where it is the best support. Checks are cached per argument while the library is unchanged, and run in the background once their speech reaches the flow, so a draft usually finds them ready | User request: "use some of the cards there already … it should not use existing cards for the sake of it, just if its relevant and necessary". Haiku 4.5 failed the side test (P-44); Sonnet costs about $0.07 for a cold check of 18 arguments ($0.02 on Haiku), about 6–8 s, 0.1 s cached |
| D-38 | Re-tagging (B3): a draft or update may give a library card a new tag for this speech (`cardTags`). Code keeps it only when it says nothing the card's words don't (no new author–year, number or name; no certainty the read text hedges), only for library cards the speech reads; the team's own picks keep their tags, and the library keeps the card's own tag. The proposal shows the new tag beside the library's, and any refused tag with the reason | User request: "changing taglines on other if the evidence works"; evidence integrity |
| D-22 | Models after the drafting benchmark: fast drafts on Opus 5.5 low, deep drafts on Opus 5.5 medium (wins about 70% of blind comparisons against low, at about twice the time); Gemini 3.8 Flash not used (loses on drafting, ties on highlighting only at 3× the time, and its terms bar apps used by under-18s). No Gemini key in any deployment | `docs/research/models-and-providers.md` §14–15; `draft-quality-run2.json`, `draft-quality-run3.json` |

### Measured AI cost and latency (telemetry, standard API prices; `scripts/ai-costs.ts`)
| Operation | Model | Avg time | Avg cost |
|---|---|---|---|
| Deep speech draft | Opus 5.5 (medium) | 117 s | $0.31 |
| Fast speech draft | Opus 5.5 (low) | 47 s | $0.14 |
| Fit / fill to time (+ top-up) | Opus 5.5 (low) + Sonnet 5 | 28 s | $0.12–0.15 |
| Flow interpretation | Opus 5.5 (low) | 18 s | $0.07 |
| Cut one card | Opus 5.5 (low) | 8 s | $0.05 |
| Re-highlight one card | Opus 5.5 (low) | 7 s | $0.025 |
| Trim/fill a draft to time (when needed) | Sonnet 5 (thinking off) | 5–15 s | $0.01–0.05 |
| Section rewrite | Sonnet 5 (thinking off) | 5 s | $0.03 |
| Judge paradigm | Sonnet 5 (thinking off) | 7 s | $0.01 |
| Web discovery (per research job) | Sonnet 5 + web search | 18 s | ≈ $0.08 |
A typical round (two or three drafts, a fit, a few rewrites, one research job) costs roughly $1–2.

## 4. External dependencies requiring user action
| ID | What | Status |
|---|---|---|
| EXT-01 | Recover v1 data from Supabase dashboard (restore or download backup) | Withdrawn at the user's request (2026-09-25): all data lives on Vercel (Neon Postgres + Vercel Blob). The unreachable Supabase project was left untouched |
| EXT-02 | Revoke leaked Perplexity key | Requested |
| EXT-03 | Consider making the GitHub repo private | Recommended |
| EXT-05 | Speech-to-text key: an OpenAI API key from a parent-owned account (18+) with a monthly spend limit, added as `OPENAI_API_KEY` in the Vercel dashboard (never in chat) | Optional: without it, live listening uses Chrome's on-device recognition and transcript paste/upload works |
| EXT-06 | Library import to production: migration `0003_library_meta` | Done 09-25 (applied before deploying; production had 0 users and 0 cards) |
| EXT-07 | Library checks cache: migration `0004_evidence_checks` on production | Done 09-25 (applied before deploying) |
| EXT-04 | Optional search keys (Tavily/Exa) to widen discovery beyond Anthropic web search + OpenAlex | Optional; research works without them |

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
| 09-25 | Real Verbatim files: import formatting and cites | 53/53 cards, cites, and years | verified |
| 09-25 | Security: outsider gets 404 on 15 read/write/sync/AI/upload/delete endpoints; no session → 401; research APIs same | pass | verified (local + production) |
| 09-25 | Two clients editing one draft (browser + partner bot) | converged, 0 pending | verified |
| 09-25 | AI 2AC draft (fast) | first output 2.3 s, total 37–45 s | verified (local + production) |
| 09-25 | Card cutting on 7 real sources × 4 models | 100% of cut cards verbatim-verified; all models refused cards from contradicting sources | verified (`card-cut-run1/3.json`) |
| 09-25 | Research jobs: search mode (12 leads → 2 or 3 cards), URL mode, pasted text; blocked sites reported with a "paste the text" fix | pass | verified |
| 09-25 | In-round research: section → cut card → insert in place of its "Needs evidence" note | pass | verified |
| 09-25 | AI policy "off" blocks research for that round (403) | pass | verified |
| 09-25 | Fit to time (1AR, 6:16 → 4:54 planned; 5:19 → 4:51 planned and measured after apply) | pass | verified |
| 09-25 | Draft history: save, preview, restore (pre-restore version saved) | pass | verified |
| 09-25 | Offline (local production build, server stopped): cached round loads, edit queued, survives reload, syncs on reconnect | pass | verified |
| 09-25 | Invite-only signup | unit test + production | verified |
| 09-25 | **Production smoke test** (`scripts/e2e/prod-smoke.ts`): signup/invite gate, access control, Blob upload + flow import, two-client sync, AI draft, background research job, DOCX export | 14/14 (twice; QA data removed after) | verified (`docs/evals/results/prod-smoke-*.json`) |
| 09-25 | Unit/integration suite | 98 tests, 13 files | verified |
| 09-25 | Judge profile extraction (synthetic paradigm): quotes enforced, judge-kick/speed categories stable over 3 runs; pace cap applied in UI | pass | verified |
| 09-25 | Delivered arguments numbered per position (integration test) | pass | verified |
| 09-25 | **E2E suite** (`npx playwright test`, installed Chrome): sign-in gate; round creation; partners co-editing; section lock blocks partner; offline edit syncs after reconnect; outsider 404; missing speech never a concession; Verbatim import; Word export with just-typed text; speaker reassignment changes 1AR timing; CX notes shared live | 9/9 on dev server and 9/9 twice on the local production build (service worker active) | verified |
| 09-25 | AI E2E (`E2E_AI=1`): AI 2AC → apply → Fill to time (6:49 → 7:36 of 8:00) | pass | verified |
| 09-25 | Word export rendered by macOS Quick Look: Verbatim headings, bold 13 pt cites, underline/emphasis, unread text shrunk | pass; highlights are present in the file (`w:highlight`, same markup as Verbatim) but Quick Look/TextEdit don't display Word highlights | partially verified: confirm highlight display once in Word or Google Docs |
| 09-25 | Insert a block from an imported backfile into a speech (E2E) | pass | verified |
| 09-25 | Highlighting benchmark: 16 real human-highlighted camp-file cards (2021 Open Evidence; not the user's), 7 model settings + the human version, two blind judges from different families | Opus 5.5 low 7.36 (ties Opus medium and Gemini 3.8 Flash medium; faster); human 5.98; all models within ±10% of target length | verified (`highlight-bench-run1.json`) |
| 09-25 | Highlight safeguards (research checks H-4/5/7/8/9/10) | 19 alignment tests incl. the research's synthetic examples; Opus low re-benchmarked 7.44 (no regression) | verified (`highlight-bench-run2.json`) |
| 09-25 | Re-highlight in the library (browser): Short preset → 52 words (~10 s), bounds and % signs kept, 5.7 s | pass | verified |
| 09-25 | Card cutter end to end on a synthetic source (negations, "at most", attribution) | verified card, 34 words read, 6.9 s | verified |
| 09-25 | Drafting quality, Opus 5.5 low vs medium, blind, two judge families | medium wins 75% (1AR) and 67% (2AC); 2–2.5× slower | verified (`draft-quality-run3.json`) |
| 09-25 | Drafting quality, Gemini 3.8 Flash (low/medium) vs Opus 5.5 low | Gemini wins 17–33%; Claude judge 0% | verified (`draft-quality-run2.json`) |
| 09-25 | Automatic trim/fill to time: 6 live drafts (2 fills, 2 trims, 2 already in range) and a padded 1AR (7:05 → 4:42) | all end within the limit | verified |
| 09-25 | Unit/integration suite | 130 tests, 17 files | verified |
| 09-25 | Production (after each deploy): smoke test 14/14; QA data removed; 0 users. Vercel holds only ANTHROPIC_API_KEY (no Gemini key) | pass (last: 09:43, commit 8e7bb5a) | verified |
| 09-25 | Typed notes → flow (browser, real model): their 2NC typed in the pad | 5/5 lines on the flow; typed labels kept; the 1AR's obligations included the typed analytics | verified |
| 09-25 | Linking a hand-written section to an argument (target picker) | its critical check cleared; unanswered 8 → 7 | verified |
| 09-25 | **Update, don't regenerate** (browser, real model, Opus 5.5 low): 1AR with 17 sections and 2 unanswered analytics | 2 answers added under their positions (States CP, Case); the 17 existing sections unchanged byte for byte; 16 s | verified |
| 09-25 | An edited 2NC line → update | the line re-read in place (no duplicate); the update proposed one edit changing 23% of one answer (adds tribal water claims, keeps the rest); the other 18 sections unchanged | verified |
| 09-25 | Live pre-drafting: a new 2NC line ("perm is severance") | flowed onto States CP; an automatic 1AR update 5 s later proposed one answer placed under States CP (7.3 s) | verified |
| 09-25 | Unit/integration suite (incl. update placement, locks, double-apply, partner-typing and stale edits on a real editor; the update op on PGlite with the fake model) | 185 tests, 25 files | verified |
| 09-25 | Progress indicator on a real fast 1AR draft ("New version") | "Reading the round · about 35 s" → "Planned n sections" → "Writing section 7 of 15 · about 20 s" → "Trimming to fit · about 10 s" → ready (5:42 trimmed to 4:50) in about 50 s | verified |
| 09-25 | Unit/integration suite | 188 tests, 26 files | verified |
| 09-25 | Selection edit in the browser (real model): "Sharpen" on 6 words of a 1AR analytic | suggestion under the words with a word diff and a note; accepting changed only those words | verified |
| 09-25 | @AI comment in the browser (real model) | the AI answered in the thread with a critique and suggested words; accepting replaced exactly the commented words | verified (the reply quoted an internal id → D-31) |
| 09-25 | **Two partners using AI at once** (E2E, fake model): A asks for an update; B sees A's AI working and the proposal; B applies it; A gets the sections and its copy shows applied; B's selection edit and A's @AI comment reach both; documents identical | pass (20 s) | verified (`tests/e2e/partners-ai.spec.ts`) |
| 09-25 | **Core loop** (E2E, fake model): typed 1NC analytics reach the flow → the 2AC answers them in one click → one more typed line → exactly one new section, every other section unchanged | pass (14 s) | verified (`tests/e2e/heard-loop.spec.ts`) |
| 09-25 | Full E2E suite on the fake-model server | 12 passed, 1 skipped (real-model test) | verified |
| 09-25 | Unit/integration suite | 197 tests, 30 files | verified |
| 09-25 | **Production after deploying A0–A7 + A6** (commit fff8dc9): smoke test extended with typed notes → flow (6.1 s), a draft update (36.8 s, answers placed by position), a selection edit (3.2 s), and a partner stopping a running job (stopped in 2.7 s) | 19/19; QA data removed; 0 users | verified (fast 2AC draft took 98 s here vs 37–45 s earlier → P-36) |
| 09-25 | A6 sweep: fake model for every AI task; draft → add → revise → fill to time (E2E, fake model); skipped cards leave the flow; minors' safeguards (13+ confirmation and AI disclosure at sign-up, README policy note) | 13/13 E2E pass on the fake-model server (1 real-model test skipped); 207 unit/integration tests | verified |
| 09-25 | **Library import benchmark, run 5** (Haiku 4.5; 3 real camp files with every style stripped, scored against the parser's cards; recall / precision / exact tags) | 1AC 100% / 100% / 100% ($0.02); K file 97% / 97% / 97% ($0.04); Blockchain aff, 2,883 paragraphs and 204 cards, 88% / 92% / 91% ($0.24, 11.5 s with parallel chunks). Labels: about $0.50 per 1,000 cards | verified (`library-import-run5.json`; the ground truth is itself a parse, so some "misses" are parser errors) |
| 09-25 | Library import on PGlite (fake model): a Verbatim file becomes cards; re-importing it gives only duplicates; unstyled text is split; a re-cut card is kept as a variant. Label repair rules (8 tests) and untagged-bold-tag parsing (2 tests) | pass | verified |
| 09-25 | Big-file import in the browser (E2E, fake model): upload → job with progress → cards in the library | pass (5.3 s) | verified (`tests/e2e/library-import.spec.ts`) |
| 09-25 | Transcripts: WebVTT, SRT, Otter and plain text parse into flow lines (4 tests); pasted captions and an uploaded .txt reach the transcript pad and the flow (E2E, fake model) | pass | verified (`tests/e2e/transcript.spec.ts`) |
| 09-25 | Live listening (tab, Zoom app, microphone) and audio transcription | not run: needs `OPENAI_API_KEY` (EXT-05) and a person to grant capture in Chrome | unverified |
| 09-25 | **Production after deploying B1 + C** (commits ad3d378, 690198f; migration 0003 applied first): smoke test adds a library import (browser-style upload straight to Blob → split → labeled → re-import finds only duplicates → searchable; a path outside the team's folder refused) in 7.3 s, and speech-to-text gating (another team's file refused; no key → "not set up") | 21/21; QA data and 4 files removed; 0 users | verified |
| 09-25 | **Library retrieval with the real model** (dev round on the 2021 water topic, 69 library cards, 1AR with 18 open arguments): offered 7 cards, all aff answers ("interstate compacts fail", "most states lack programs", non-unique), each with what it proves; the opponent's CP solvency cards excluded. Cold 7.9 s; cached 0.1 s; two new arguments 6 s | pass | verified (`evidence-fit-run1/2.json`, counts only) |
| 09-25 | Library retrieval and re-tags on PGlite (fake model): fits from our side only, unlabeled cards found, cards in the speech skipped, no cross-team results, cache reused and made stale by a new card; new tags kept only when the card's words support them | 12 tests pass | verified |
| 09-25 | **Library reuse in a draft** (E2E, fake model, a fresh team): our blocks in the library → the 2AC reads the fitting cards under the right answers with checked new tags; the unrelated card isn't read; the proposal shows what fit and the new tags | pass | verified (`tests/e2e/library-reuse.spec.ts`) |
| 09-25 | Unit/integration suite; E2E suite on the fake-model server | 234 tests (37 files); 16 passed, 1 skipped (real model) | verified |
| 09-25 | **Production after deploying B2/B3** (commit 5326a7c + smoke change; migration 0004 applied first): the 2AC draft ran the library check against a library holding only the opponent's imported 1NC and read none of it | 21/21; QA data and 4 files removed; 0 users | verified |

