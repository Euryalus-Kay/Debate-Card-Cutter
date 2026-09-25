# Clash

A policy debate workspace for two partners: cut and organize evidence, flow the round (typed notes included), and prepare speeches with AI help that never changes a speech until you accept it. Decisions, problems found, and test results are in [docs/PROJECT_RECORD.md](docs/PROJECT_RECORD.md).

## Run it

```bash
npm install
npm run db:migrate
npm run dev
```

Configuration lives in `.env.local` (never committed). The app needs `APP_DATABASE_URL` or `DATABASE_URL` (Postgres), `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, and `BLOB_READ_WRITE_TOKEN`. Production values are set in the Vercel dashboard, not in files.

## Tests

- `npm test`: unit and integration tests (PGlite; no network).
- `npm run typecheck` and `npm run lint`.
- End to end, against a dev server started with `ENABLE_DEV_LOGIN=1`:
  - With the deterministic fake model (no API cost): start the server with `AI_FAKE=1`, then run `E2E_FAKE=1 npx playwright test`.
  - With the real model (costs API credits): `E2E_AI=1 npx playwright test ai`.

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
