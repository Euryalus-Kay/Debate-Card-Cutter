# Clash — Final QA Report (Phase G)

Date: 2026-09-25. Branch `rebuild/v2`. Production: https://clash-debate.vercel.app (0 users; every QA account and file removed after each check).
Decisions, problems and the full test log are in [PROJECT_RECORD.md](PROJECT_RECORD.md). Each result below is marked **verified**, **partly verified**, or **not verified**.

## 1. Summary

**Ready and verified:**
- The mid-round loop: typed notes or transcripts reach the flow, drafts answer everything, and updates change only what's new. Partners can work on the same speech at the same time, each using AI.
- Evidence: big-file import, cutting and checking cards against sources, library reuse with fit checks.
- The file builder, and the 2026–27 starter set built with it.
- CX help, the last-rebuttal scorecard, opponent memory, the analytics bank.
- Spend visibility, a monthly budget, and rate limits.

Every automated suite passes. Production passes a 23-step smoke test with real models.

**Not verified here:**
- Live speech-to-text: it needs the parent's `OPENAI_API_KEY` in Vercel and a person to allow audio capture in Chrome. Transcript paste and upload are verified.
- Importing the user's own files into their production library: the production account doesn't exist yet.
- The real-model end-to-end suite (`E2E_AI=1`): not re-run in this pass. The production smoke test exercises the same real-model paths.

## 2. Automated suites

| Suite | Result | Status |
|---|---|---|
| Unit and integration tests (PGlite, no network) | 267 tests in 47 files pass | verified |
| TypeScript and ESLint | clean | verified |
| Production build (local, separate worktree) | builds | verified |
| End-to-end, fake model (`E2E_FAKE=1`) | 22 passed. 2 skipped by design: the real-model test and the screenshot walkthrough. One run failed on a timeout while a real-model build was running on the same machine; the next two runs passed | verified |
| Production smoke test (`scripts/e2e/prod-smoke.ts`, real models) | 23/23 steps (see §11) | verified |

The end-to-end suite covers:
- sign-in gate, round creation, partners co-editing, locks, offline edits;
- outsiders, CX notes, the missing-speech rule, Verbatim import, Word export, inserting blocks;
- the typed-notes → flow → draft → update loop;
- two partners using AI at once, and the fake-model AI flows;
- library import, library reuse, the file builder, transcripts, CX help, opponent memory;
- team isolation and accessibility.

## 3. Benchmarks against their gates (real models)

| Area | Gate | Result | Status |
|---|---|---|---|
| Flow extraction: shorthand notes → arguments (`flow-extract-run1..4`) | recall ≥ 95% | 100%, 95.8%, 95.8%, 100% over 4 runs; 0 unflowed lines; 8–13 s a speech | verified |
| Updating instead of regenerating | untouched sections stay identical | 2 answers added; the other 17 sections identical byte for byte | verified |
| Drafting quality (`draft-quality-run3`, blind, two judge families) | informs the model choice | Opus medium beats low in 67–75% of comparisons; low is used for fast drafts | verified |
| Highlighting (`highlight-bench-run1/2`, 16 real cards) | at least as good as human | Opus low 7.36–7.44 vs human 5.98 | verified |
| Card cutting | 100% word-for-word | 100% of cut cards verified against their source. By speech (`card-use-run1/2`): 1AC reads 79–84 words (median 88), 1AR 64–66 (median 57) | verified |
| Library import splitter (`library-import-run5`; styles stripped) | — | recall / precision: 1AC 100% / 100%; K 97% / 97%; a 2,883-paragraph aff 88% / 92% | verified |
| Library retrieval (`evidence-fit-run1/2`) | only our side's cards, only where they fit | 5–7 cards offered, all aff answers, each with what it proves; 0.1 s when cached | verified |
| File quality vs a real camp file (`file-vs-camp-k`) | at least comparable | Blind judge, both orders: the built Capitalism K beat the Harvard 2025 camp K excerpt (7–8 vs 3–5 on each dimension). Caveats: camp releases are often unhighlighted with incomplete cites, and the judge is the same model family | partly verified |
| Speech-to-text argument recall | — | not run (needs `OPENAI_API_KEY`) | not verified |

## 4. Evidence integrity

- **Red-team with real models** (`redteam-run1`), 3 of 3 refused:
  - A draft told to cite and quote an invented study names no such study. It asks whether the team has a real card.
  - A selection edit told to add a statistic and an expert adds neither.
  - "@AI quote the author word for word" says no provided card says that.
- **Guards in code** (unit-tested):
  - Card text is never written by a model.
  - The import splitter only labels paragraphs.
  - Quotes from typed notes must be substrings of the line.
  - Drafts may reference only provided cards.
  - Cite-without-card checks.
  - New tags for library cards refuse new numbers, names, author-years, or unhedged claims.
  - Ids are stripped from AI text.
  - Missing file evidence is written as "Card needed — [claim]".
- **Imported cards checked against their live sources** (`source-check-run1/2`, 36 camp cards):
  - 9 match word for word.
  - 9 match except for small differences, such as datelines.
  - 18 couldn't be checked (paywalls, previews).
  - 0 false "mismatch" flags (after P-45).

## 5. Concurrency

| Check | Result | Status |
|---|---|---|
| Two partners, one draft: edits, locks, offline edits | converge; locks hold | verified (E2E) |
| Two partners using AI at once | activity, proposals, updates, selection edits and @AI comments reach both; documents identical | verified (E2E) |
| Neon stress test: 4 writers × 50 updates, 3 readers, compaction | all converge | verified (earlier pass) |

## 6. Resilience

| Check | Result | Status |
|---|---|---|
| Model failures (mock models): error, stall before the first output, refusal, all failing | falls through to the next model; plain error when all fail | verified |
| Stopping a running AI job; jobs silent for 6 minutes marked interrupted | stopped in about 3 s on production | verified |
| Long jobs (research, imports, file builds) after the page closes | runs continue themselves through a signed route; on production, a file build's research ran in its own function | verified |
| Offline edits survive reload and sync on reconnect | pass | verified (earlier pass) |

## 7. Security

| Check | Result | Status |
|---|---|---|
| Team isolation sweep: 28 routes, called by someone on another team | all 403/404 (after P-46) | verified |
| Secrets in browser code: 39 files of a production build | no secret values or key patterns | verified |
| Upload paths | "`..`" and encoding tricks refused on upload, import and transcription (P-42) | verified |
| Rate limits per user; the team's monthly AI budget | 429 with plain messages; the budget is owner-only (a partner gets 403) | verified (tests + production) |
| Invite-only sign-up; 13+ confirmation; AI disclosure | pass | verified |

## 8. Performance

**AI operations, last 7 days** (development and benchmarks; median / 90th percentile seconds, median cost):

| Operation | Median | p90 | First output | Cost |
|---|---|---|---|---|
| Fast speech draft (Opus low) | 35.8 s | 55.0 s | 1.8 s | $0.085 |
| Deep speech draft (Opus medium) | 83.5 s | 115.3 s | 30.7 s | $0.18 |
| Draft update | 7.9 s | 16.2 s | 4.7 s | $0.14 |
| Typed notes → flow | 9.8 s | 12.0 s | 1.3 s | $0.014 |
| Selection edit / @AI comment | 4.5 s | 7.8 s | 1.8 s | $0.05 |
| Library fit check | 3.7 s | 7.5 s | 1.3 s | $0.006 |
| Cross-ex help | 19.9 s | — | 2.4 s | $0.047 |
| Cutting a card (cut step) | 7.1 s | 11.5 s | 1.6 s | $0.015 |
| Planning a file | 62.5 s | 66.4 s | 12.1 s | $0.13 |

- **Production smoke timings (last run):** typed notes → flow 5.6 s; fast 2AC draft 60.8 s including fit to time; update 30.0 s; selection edit 3.1 s; research job 11.3 s; one-card file build 81.5 s (plan 56 s, research 25 s); CX help about 20 s.
- **Sync:** partners see each other within about 1–3 s over HTTPS polling (E2E).

## 9. Accessibility

axe-core (WCAG 2.1 A/AA) scanned 8 main pages in light and dark mode: 0 serious or critical violations, after P-47 (contrast tokens, tab panels, names for icon buttons and fields). **Verified.**
Not tested: screen-reader walkthroughs by a person.

## 10. Cost audit

**Measured per operation:**
- Researched card ≈ $0.22 (search $0.08, page read $0.06, cutting $0.08).
- File plan ≈ $0.13.
- Fast draft ≈ $0.09.
- Update ≈ $0.14.
- Flow update ≈ $0.01.
- Library fit check ≈ $0.01.

**Files:** a whole file costs $0.64–2.06; the 7-file starter set cost $7.51, plus about $5.60 for a first build that was replaced.

**A typical round:**
- Three drafts, a few updates, ten flow updates, CX help: roughly $1–2.
- Research spend comes on top.

Settings shows the month's spend by feature. The team's monthly budget defaults to $50; AI stops at the budget and everything else keeps working. **Verified.**

## 11. Production

Each deploy was preceded by its migrations (0003–0006), applied while production had 0 users. After the last deploy (commit 8681ce2):
- **Smoke test:** 23/23 steps, covering:
  - sign-up and invites, access control, Blob upload and flow import;
  - library import and dedupe, speech-to-text gating, two-client sync;
  - typed notes → flow, the fast draft, the update, a selection edit, stopping a job;
  - a background research job, a one-card file build (plan 56 s, card 25 s);
  - CX help (10 questions), the spend view, the budget (a partner can't change it), and opponent memory;
  - Word export, and outsider checks.
- **Cleanup:** QA accounts and files removed; production has 0 users, teams, rounds, and cards.
- **Environment:** Vercel holds `ANTHROPIC_API_KEY` and no Gemini key. `OPENAI_API_KEY` is not set, so server speech-to-text is off.

## 12. Walkthrough (fake model, synthetic data)

`tests/e2e/walkthrough.spec.ts` (run with `WALKTHROUGH=1`) goes through the app as a debater would, taking a screenshot at each step:

1. [Their 1NC: typed notes on the flow](qa/screens/01-their-1nc-notes-and-flow.png)
2. [A 2AC proposal with library use and new tags](qa/screens/02-2ac-proposal.png)
3. [The 2AC draft](qa/screens/03-2ac-draft.png)
4. [The flow](qa/screens/04-flow.png)
5. [Cross-ex help](qa/screens/05-cx-help.png)
6. [The library](qa/screens/06-library.png)
7. [Reviewing a file plan](qa/screens/07-file-plan-review.png)
8. [The card maker](qa/screens/08-card-maker.png)
9. [Settings: spend and budget](qa/screens/09-settings-spend.png)

## 13. Open items and user actions

- **Speech-to-text:** add `OPENAI_API_KEY` in the Vercel dashboard, from a parent-owned OpenAI account with a spend limit. Then try Listen once in Chrome, with everyone's consent.
- **Your library:** create your production account, then import:
  - the camp files: Library → Import files; up to 50 MB each; several at once are fine;
  - the starter set, from `~/Projects/debate-corpus/nhi-2026-starter/`.
  - Afterwards, run "Check them word for word" to re-verify the imported cards against their sources.
- **Import corner case, fixed (P-50):** a note line between a tag and its cite ("---also AT: …") no longer hides the cite; the note joins the tag.
- **Blind file comparison:** only one file type has been compared (the K), with the caveats above.
