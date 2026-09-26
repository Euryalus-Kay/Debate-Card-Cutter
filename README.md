# Clash

A policy debate workspace for two partners: cut and organize evidence, flow the round (typed notes included), and prepare speeches with AI help that never changes a speech until you accept it. Decisions, problems found, and test results are in [docs/PROJECT_RECORD.md](docs/PROJECT_RECORD.md).

## What it does

- **In the round:** type what you hear (or paste or upload a transcript, or listen to a Zoom or NSDA Campus tab), and it goes on the flow; "what the next speech must answer" updates as they speak. Drafts answer every argument, and updates change only what's new. Selection edits and @AI comments work on a few words. Partners see each other's AI work live. There's cross-ex help, a scorecard for what to go for in the 2NR or 2AR, and a reminder of what this opponent ran before.
- **Evidence:** import whole files (up to 50 MB; Verbatim files parse exactly, others are split by a small model that only labels paragraphs). Cut new cards from real sources; every word is checked against the source. The library is checked first, and a card is offered only where a model rates it as proving what the speech needs. Imported cards can be checked against their sources in bulk.
- **One library for everyone:** every account on the site shares one library. Each card is labeled with what it proves and where it fits (and a checked, clearer tag when the file's tag is just "Extend Shepherd 22"); the analytics in imported files are saved by block for drafts to adapt. **Explain** puts any card, argument or whole position into plain words. **Gaps & ideas** reviews the library against the topic and links each missing card to the card maker.
- **Whole arguments:** a speech that runs a position reads its whole shell from your files (pick it under "Run from your files"), later speeches extend it from your blocks, a card is read once per speech, and a repair pass answers anything a draft would otherwise drop.
- **Files:** build a whole file for an argument (1NC or 1AC through the last rebuttal), with analytics written and cards found in the library or cut from sources. Missing cards are marked "Card needed", never invented. It downloads as a Verbatim Word file.
- **Spend:** Settings shows this month's AI cost by feature, and the owner sets a monthly budget; AI requests stop at the budget, and everything else keeps working.

## Run it

```bash
npm install
npm run db:migrate
npm run dev
```

Configuration lives in `.env.local` (never committed). The app needs `APP_DATABASE_URL` or `DATABASE_URL` (Postgres), `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, and `BLOB_READ_WRITE_TOKEN`. `OPENAI_API_KEY` is optional: it turns on server speech-to-text (without it, live listening uses Chrome's on-device recognition). Production values are set in the Vercel dashboard, not in files.

## Tests

- `npm test`: unit and integration tests (PGlite; no network).
- `npm run typecheck` and `npm run lint`.
- End to end, against a dev server started with `ENABLE_DEV_LOGIN=1`:
  - With the deterministic fake model (no API cost): start the server with `AI_FAKE=1`, then run `E2E_FAKE=1 npx playwright test`.
  - With the real model (costs API credits): `E2E_AI=1 npx playwright test ai`.
- Benchmarks with the real models (cost API credits) are in `scripts/bench/`; results (counts only) are in `docs/evals/results/`. The QA report is [docs/QA_REPORT.md](docs/QA_REPORT.md).

## Using Clash with students

Clash is built for a high-school debater whose parent owns the team and the API accounts.
- **Accounts:** they are invite-only. Sign-up asks the student to confirm they are 13 or older and that a parent or guardian knows they use Clash.
- **AI disclosure:** Clash says where AI is involved. AI-written sections are marked, and every AI output arrives as a suggestion to review.
- **AI prompts:** every prompt tells the model it is helping students and must stay appropriate and on the debate task.
- **Providers:**
  - Anthropic (Claude) runs all AI features. Anthropic's usage policy allows products used by minors when the builder adds safeguards like these.
  - Google's Gemini API is not used: its terms bar apps likely to be used by people under 18.
  - Speech-to-text, when enabled, uses an OpenAI account owned by the parent (OpenAI accounts are 18+).
- **Tournament rules:** they differ on AI during rounds (NSDA's device rules bar outside help; Ohio bans generative AI in rounds). Each round picks a rule set, and turning in-round AI off keeps the flow, checks, timers, and export working without it.
- **Recording:** audio features require everyone recorded to agree first, and audio is deleted once it has been transcribed.
