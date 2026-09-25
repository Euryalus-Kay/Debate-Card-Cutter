# Models and Providers: Research for the v2 Rebuild

Research date: **2026-09-25**. Every source listed in section 13 was accessed on 2026-09-25.

How to read this document:

- **[V]** means verified. The fact was read on an official page or endpoint fetched on 2026-09-25. The source ID follows it, for example `[V A2]`.
- **[U]** means unverified. I could not confirm it on an official page. Treat it as a lead, not a fact.
- **[I]** means inference or recommendation. It is the researcher's judgment, not something a document states.

Method: official docs were downloaded as raw Markdown and searched for exact wording. The sources were platform.claude.com `*.md`, developers.openai.com `*.md`, ai.google.dev `*.md.txt`, ai-sdk.dev `*.md` and vercel.com/docs `*.md`. Package versions came from the npm registry (`npm view`). Live model metadata came from the public Vercel AI Gateway catalog API. No model calls were made during this research. The model-access list in the brief comes from the user's own Models API check.

---

## 0. Executive summary

1. **v1 called endpoints that no longer exist** (already logged as P-03 in `docs/PROJECT_RECORD.md`).
   - `claude-opus-4-20250514` and `claude-sonnet-4-20250514` were retired on the Claude API on 2026-06-15 [V A11].
   - `gemini-2.0-flash` is listed as "Shut down" [V G1].
   - `@google/generative-ai` is a legacy SDK that is not actively maintained [V G9].
   - v2's `package.json` already pins the current versions: `ai@^7.0.114`, `@ai-sdk/anthropic@^4.0.63`, `@anthropic-ai/sdk@^0.128.0` and `zod@^4.6.5` [V V8].
2. **Minors rule out Gemini for production.**
   - The Gemini API Additional Terms require users to be 18 or older. They also forbid using the API in an app that is directed to, or likely to be accessed by, people under 18 [V G8].
   - Anthropic allows products that serve minors, with safeguards [V A34]. So does OpenAI [V O12].
   - For a high-school platform, the Gemini Developer API is therefore blocked for production unless a different contractual path is confirmed [I].
3. **The Anthropic lineup, by role:**
   - **Opus 5.5** is the docs' default starting point: $4/$20, 1M context, 128K output, thinking always on, default effort `medium` [V A1, A3, A10].
   - **Fable 5.1** is described as Anthropic's "most capable widely released model": $10/$50, "Slower" latency. It requires 30-day data retention and is not available under ZDR [V A10, A1, A31].
   - **Sonnet 5** costs $2/$10 and is rated "Fast". Its thinking can be turned off [V A7, A13].
   - **Haiku 4.5** costs $1/$5 and is rated "Fastest". Its context window is 200K [V A8].
4. **Anthropic's evidence features fit this product, with one catch.**
   - The `web_fetch` server tool returns the full fetched text inside the API response. PDFs come back as base64 [V A22].
   - Citations return exact `cited_text` with character offsets into your document. The docs guarantee these are valid pointers [V A26].
   - The catch: **Citations and structured outputs cannot be used in the same request**. Combining them returns a 400 [V A16, A26].
5. **Latency levers:**
   - The `effort` parameter [V A12].
   - Turning thinking off on Sonnet 5, or on Opus 5 at effort `high` or below [V A13].
   - Haiku 4.5.
   - Fast mode: research preview with a waitlist, Opus 5.5/5/4.8 only. It gives up to 2.5x output tokens per second but does not speed up time to first token [V A14].
   - Prompt caching: Opus 5.5 cache reads cost 0.05x the input price, and a 1-hour TTL is available [V A2, A17].
   - Priority Tier can no longer be purchased [V A15].
6. **Refusal risk.** Opus 5.5, Opus 5, Fable 5.1 and Fable 5 run safety classifiers. A declined request returns HTTP 200 with `stop_reason: "refusal"`. The categories are cyber, bio, frontier_llm, reasoning_extraction and general_harms [V A30]. Debate impacts routinely cover bioweapons, cyberattacks and war [I]. The design must handle refusals and fall back to another model, and these topics belong in the eval set [I].
7. **OpenAI's current lineup.**
   - GPT-6 Astra (flagship, released 2026-09-03) costs $10/$50.
   - GPT-6 Sol ($2/$10) and GPT-6 Luna ($0.10/$0.50) were released on 2026-09-22.
   - All three have 1.05M-token context windows.
   - A prompt over 272K input tokens reprices the whole request at 2x input and 1.5x output [V O2, O3, O4].
8. **Vercel AI SDK is on v7** (`ai@7.0.114`).
   - `generateObject` and `streamObject` were deprecated in v6. Use `generateText` or `streamText` with `output: Output.object(...)` instead.
   - v7 needs Node 22 or later and is ESM-only.
   - OpenTelemetry support moved to the separate `@ai-sdk/otel` package [V V2, V3, V4, V8].
9. **Vercel AI Gateway.**
   - Upsides: zero token markup (including BYOK), OIDC authentication on Vercel, model and provider fallbacks, request logs and budgets [V V9, V10].
   - BYOK requires purchased credits. If your own key fails, the gateway retries on Vercel's system credentials and bills your credits [V V14].
   - ZDR routing is available only on the Pro and Enterprise plans [V V16].
   - The gateway documents only these Claude features: cache control, thinking, structured outputs and `web_search_20250305`. Citations, `web_fetch`, fast mode and Files are not documented [V V18].
10. **Recommendation [I]: build Anthropic-first.**
    - Call Anthropic directly for routes that need citations, web fetch, the Files API or fast mode.
    - Use AI SDK 7 for UI streaming and for structured routes defined with Zod.
    - Use AI Gateway mainly for the multi-provider benchmark harness, plus optional production fallbacks pinned to Anthropic.

---

## 1. Anthropic (Claude API)

### 1.1 Verified model table (all models the user's key can access)

Prices are USD per million tokens. The latency column is Anthropic's published comparative rating [V A1]. "Batch 300K" means the batch API allows up to 300K output tokens with the `output-300k-2026-03-24` beta header [V A1].

| Model (Claude API ID) | Positioning | Context | Max output | Input / output | Cache: 5m write / 1h write / read | Batch input / output | Thinking; default effort | Latency | Reliable knowledge cutoff | Lifecycle | Sources |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Claude Opus 5.5 `claude-opus-5-5` | Long-running agentic coding and knowledge work. The docs' default starting point. | 1M | 128K (batch 300K) | $4 / $20 | $5 / $8 / **$0.20** (0.05x) | $2 / $10 | Adaptive, always on; `medium` | Moderate | Jun 2026 | Active (latest). Released 2026-09-22. Retirement no sooner than 2027-09-22. | A1, A2, A3, A4 |
| Claude Fable 5.1 `claude-fable-5-1` | Demanding reasoning and long-horizon agentic work; "most capable widely released model" | 1M | 128K | $10 / $50 | $12.50 / $20 / **$0.25** (0.025x) | $5 / $25 | Adaptive, always on; `high` | Slower | Jun 2026 | Active (latest). Released 2026-09-01. Retirement no sooner than 2027-09-01. | A1, A2, A5, A10 |
| Claude Opus 5 `claude-opus-5` | Legacy; the docs suggest migrating to Opus 5.5 | 1M | 128K (batch 300K) | $5 / $25 | $6.25 / $10 / $0.50 | $2.50 / $12.50 | Adaptive, on by default. Can be disabled only at effort `high` or below. Default `high` | n/a (legacy) | May 2026 | Legacy. Released 2026-07-24. Retirement no sooner than 2027-07-24. | A2, A6, A13 |
| Claude Sonnet 5 `claude-sonnet-5` | Best combination of speed and intelligence | 1M | 128K (batch 300K) | $2 / $10 (launch price made permanent) | $2.50 / $4 / $0.20 | $1 / $5 | Adaptive, on by default, **can be turned off**; `high` | Fast | Jan 2026 | Active (latest). Released 2026-06-30. Retirement no sooner than 2027-06-30. | A1, A2, A7, A13 |
| Claude Haiku 4.5 `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | Fastest, with near-frontier intelligence | **200K** | 64K | $1 / $5 | $1.25 / $2 / $0.10 | $0.50 / $2.50 | Manual extended thinking (`budget_tokens`); effort not supported | Fastest | Feb 2025 | Active. Retirement no sooner than **2026-10-15**. | A1, A2, A8 |
| Claude Fable 5 `claude-fable-5` | Previous Fable; listed as legacy, still available | 1M | 128K | $10 / $50 | $12.50 / $20 / $1 | $5 / $25 | Adaptive, always on; `high` | n/a | not checked | Retirement no sooner than 2027-06-09 | A1, A2, A9, A11 |
| Claude Opus 4.8 `claude-opus-4-8` | Legacy | 1M | 128K (batch 300K) | $5 / $25 | $6.25 / $10 / $0.50 | $2.50 / $12.50 | Adaptive, off until set; `high` | n/a | not checked | Retirement no sooner than 2027-05-28 | A2, A9, A11 |
| Claude Opus 4.7 `claude-opus-4-7` | Legacy. Fast mode returns an error on this model. | 1M | 128K (batch 300K) | $5 / $25 | $6.25 / $10 / $0.50 | $2.50 / $12.50 | Adaptive; `high` | n/a | not checked | Retirement no sooner than 2027-04-16 | A2, A9, A14 |
| Claude Sonnet 4.6 `claude-sonnet-4-6` | Legacy | 1M | 128K (batch 300K) | $3 / $15 | $3.75 / $6 / $0.30 | $1.50 / $7.50 | Adaptive (extended thinking deprecated); `high` | n/a | not checked | Retirement no sooner than 2027-02-17 | A2, A9 |
| Claude Opus 4.6 `claude-opus-4-6` | Legacy | 1M | 128K (batch 300K) | $5 / $25 | $6.25 / $10 / $0.50 | $2.50 / $12.50 | Adaptive (extended thinking deprecated); `high` | n/a | not checked | Retirement no sooner than 2027-02-05 | A2, A9 |
| Claude Opus 4.5 `claude-opus-4-5-20251101` | Legacy | 200K | 64K | $5 / $25 | $6.25 / $10 / $0.50 | $2.50 / $12.50 | Extended thinking; effort supported | n/a | not checked | Retirement no sooner than 2026-11-24 | A2, A9 |
| Claude Sonnet 4.5 `claude-sonnet-4-5-20250929` | Legacy | 200K | 64K | $3 / $15 | $3.75 / $6 / $0.30 | $1.50 / $7.50 | Extended thinking; effort not supported | n/a | not checked | Retirement no sooner than **2026-09-29** | A2, A9, A11 |

Notes on the table:

- **Release dates.** The docs give Opus 5.5 as 2026-09-22, Fable 5.1 as 2026-09-01 and Sonnet 5 as 2026-06-30 [V A3, A5, A7]. The brief's Models API dates are 1–4 days earlier (09-21, 08-28, 06-29). These are probably snapshot `created_at` timestamps rather than public release dates [I].
- **Tokenizer.** Claude 4.7 and later use a tokenizer that produces about 30% more tokens for the same text [V A2]. On the current tokenizer, 1M tokens is about 555K words [V A1]. So a 30–100K-token speech doc is roughly 17–55K words [I, arithmetic]. Use `count_tokens` for exact figures.
- **Long context has no surcharge on Claude.** On 4.6 and later models, the full 1M window is billed at the standard per-token rate [V A2]. Compare OpenAI, which charges more above 272K input tokens [V O2], and Gemini 3.1 Pro, which charges more above 200K [V G3].
- **Data residency.** Setting `inference_geo: "us"` multiplies every token category by 1.1x on 4.6 and later models [V A2].
- **Retirement risk.** Haiku 4.5 and Sonnet 4.5 have "not sooner than" dates close to today. Anthropic gives at least 60 days' notice before retiring a model, and no deprecation has been announced for either [V A11]. That means neither can be retired before roughly late November 2026 [I]. Keep every model ID in one registry (v2 decision D-05).
- **Tool overhead.** Adding tools inserts a tool-use system prompt of 286 tokens on Opus 5.5 and 354 tokens on Sonnet 5 (with `auto`/`none` tool choice) [V A2].

### 1.2 What "Fable" is, according to the docs

- Anthropic calls Fable 5.1 its most capable widely released model. The docs recommend it for demanding reasoning and long-horizon agentic work, or when evals on Opus 5.5 at higher effort still fall short [V A1, A10].
- The model-selection matrix pairs Fable with agent sessions that run for hours, multistep deep research, and analysis carried through to a finished document [V A10].
- Claude Mythos 5.1 has the same capabilities. It is invitation-only, through Project Glasswing [V A5].
- **Practical constraints on Fable:**
  - It costs 2.5x Opus 5.5 per token [V A2].
  - It has the slowest latency rating in the lineup [V A1].
  - It has its own, lower rate-limit bucket. On the Start tier that is 1,000 RPM, 500K ITPM and 100K OTPM, shared across Fable 5.1 and 5 [V A33].
  - It is a Covered Model: 30-day retention is required and ZDR is not available unless Anthropic expressly authorizes it [V A31].
  - Forced tool use returns a 400 [V A5].
  - It runs safety classifiers [V A30].
  - Priority Tier does not support it [V A15].

### 1.3 Thinking and effort

- **Opus 5.5** thinking cannot be turned off.
  - Sending `thinking: {type:"disabled"}` or `{type:"enabled", budget_tokens}` returns a 400.
  - Control depth with `output_config.effort`: `low | medium | high | xhigh | max`. The default is `medium`.
  - At a given effort level it tends to think more per turn than Opus 5 did [V A4, A12].
- **Fable 5.1** supports all five effort levels and defaults to `high` [V A12].
- **Sonnet 5** has thinking on by default, but it can be turned off. The docs recommend `low` effort for latency-sensitive work [V A12, A13].
- **Opus 5** accepts `thinking: {type:"disabled"}` only at effort `high` or below [V A12, A13].
- **Thinking display.** `display` can be `"omitted"`, `"summarized"` or `"updates"`.
  - `"omitted"` is the default on the 5.x models and Opus 4.7/4.8. It returns empty thinking text and gives faster time to first text token when streaming [V A13].
  - `"updates"` is in beta (header `thinking-display-updates-2026-08-18`). It returns the model's short progress notes between tool calls [V A13].
  - On Opus 5.5, text written between tool calls arrives inside thinking blocks, which are empty at the default display. A UI that streams those notes goes silent unless `display` is set [V A4].
- **Changing effort mid-conversation.** A per-message effort change is in beta (`mid-conversation-output-config-2026-07-01`) on Fable 5.1, Opus 5.5 and Opus 5. It preserves the prompt cache. Changing the top-level effort between requests invalidates the cache [V A12].
- **Breaking changes for anyone coming from older Claude code:**
  - Non-default `temperature`, `top_p` or `top_k` values return a 400 on 4.7 and later models [V A11, A7].
  - An assistant-message prefill returns a 400 on Opus 4.6 and later, including Opus 5.5 [V A37].
  - Forced `tool_choice` (`any` or `tool`) returns a 400 on Opus 5.5 and Fable 5.1. Use `auto` with `strict: true`, or structured outputs [V A4, A5].

### 1.4 Latency and speed

- **Documented latency figures are relative only**: Fastest (Haiku 4.5), Fast (Sonnet 5), Moderate (Opus 5.5), Slower (Fable 5.1) [V A1]. Anthropic publishes no absolute tokens-per-second numbers.
- **Fast mode:**
  - Up to 2.5x higher output tokens per second on Opus 5.5, Opus 5 and Opus 4.8. The gain is in output throughput, not time to first token [V A14].
  - Enable it with the `fast-mode-2026-02-01` beta header and `speed: "fast"`.
  - Pricing: Opus 5.5 is $8/$40; Opus 5 and 4.8 are $10/$50. Caching multipliers apply on top.
  - It is available on the Claude API only (not Bedrock, Google Cloud or Foundry).
  - It is a research preview: you need an account manager or the waitlist.
  - It has its own rate limit and is not available on the Batch API.
  - Switching between fast and standard speed invalidates the prompt cache [V A14, A2].
- **Priority Tier**: new commitments can no longer be purchased. It never supported Fable 5.1, Opus 5.5, Opus 5 or Sonnet 5 [V A15].
- **Live throughput snapshot**: see section 5 for observed latency from the Vercel AI Gateway.

### 1.5 Structured outputs

- **Status and support.** Generally available with no beta header. Supported on every model in section 1.1, including Haiku 4.5 [V A16].
- **How to turn it on.** Use `output_config.format = {type:"json_schema", schema}` for JSON responses, or `strict: true` on a tool definition. The old `output_format` parameter is deprecated [V A16].
- **TypeScript helper.** `client.messages.parse()` with `zodOutputFormat()` from `@anthropic-ai/sdk/helpers/zod` [V A16].
- **Hard limits per request [V A16]:**
  - At most 20 strict tools.
  - At most 24 optional parameters across all strict schemas.
  - At most 16 union-typed parameters. Note that `type: ["string","null"]` counts as a union.
  - Compilation times out after 180 seconds. An overly complex schema returns "Schema is too complex for compilation".
- **Schema features not supported:** recursive schemas, `minimum`/`maximum`, `minLength`/`maxLength`, complex types inside enums, and external `$ref`. `minItems` accepts only 0 or 1 [V A16].
- **Behaviors to plan for [V A16]:**
  - Required properties are emitted before optional ones.
  - The capitalization of string `enum` and `const` values is not guaranteed. Compare them case-insensitively.
  - A refusal or a `max_tokens` stop can produce output that does not match the schema.
  - The first request with a new schema is slower while the grammar compiles. Compiled grammars are cached for 24 hours.
  - Changing `output_config.format` invalidates the prompt cache.
- **Incompatible features:** Citations (400) and message prefilling [V A16].
- **Implication for flow schemas [I].** Keep fields required and use empty-string or empty-array sentinels instead of nullable unions. Link records by ID (flat arrays of arguments and responses with `parent_id`) rather than nesting, since recursion is not allowed.

### 1.6 Prompt caching

- **Two ways to cache.** Automatic caching uses a single top-level `cache_control`. Explicit caching places up to 4 breakpoints [V A17].
- **TTL and prices.** The default TTL is 5 minutes; set `{"type":"ephemeral","ttl":"1h"}` for one hour.
  - A 5-minute write costs 1.25x the input price and a 1-hour write costs 2x.
  - A cache read costs 0.1x, except Opus 5.5 (0.05x) and Fable 5.1 (0.025x) [V A2, A17].
- **Minimum cacheable prefix.** Shorter prefixes are silently not cached [V A17].
  - 512 tokens: Fable 5.1, Opus 5.5, Opus 5, Fable 5
  - 1,024 tokens: Opus 4.8, Sonnet 5, Sonnet 4.6, Sonnet 4.5
  - 2,048 tokens: Opus 4.7
  - 4,096 tokens: Opus 4.6, Opus 4.5, Haiku 4.5
- **Other rules.**
  - The lookback window is 20 blocks.
  - Caches are isolated per workspace on the Claude API.
  - Cache hits do not count toward ITPM rate limits on current models [V A17, A33].
  - `max_tokens: 0` pre-warms the cache. It does not work with streaming, structured outputs or batches [V A17].
- **Worked example: a 50K-token speech doc cached for a round** [I, computed from V A2 prices].

  | Model | Uncached input per call | 1h cache write (once) | Cache read per call |
  |---|---|---|---|
  | Opus 5.5 | $0.20 | $0.40 | $0.01 |
  | Sonnet 5 | $0.10 | $0.20 | $0.01 |
  | Haiku 4.5 | $0.05 | $0.10 | $0.005 |

  A 1-hour write pays for itself after two reads [V A2]. A round has many in-round calls against the same docs, so the 1-hour TTL fits [I].

### 1.7 Streaming and fine-grained tool streaming

- **Event types.** Server-sent events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `ping` and `error` [V A18].
  - The delta types are `text_delta`, `input_json_delta`, `thinking_delta`, `signature_delta` and `citations_delta`.
  - An `overloaded_error` can arrive mid-stream.
  - Handle unknown event types gracefully [V A18].
- **Large `max_tokens` requires streaming.** The SDKs require streaming for very large `max_tokens` values to avoid HTTP timeouts. `stream.finalMessage()` returns the assembled message [V A18].
- **Fine-grained tool streaming** is enabled per tool with `eager_input_streaming: true`, with no beta header.
  - It works on all models and on the Claude API, Bedrock, Claude Platform on AWS, Google Cloud and Foundry [V A19].
  - The trade-off: the API no longer buffers or validates the tool input, so you can receive partial or invalid JSON. Guard the parse, and return an `INVALID_JSON` error result [V A19].
- **Recovering an interrupted stream** on 4.6 and later models: send a user message containing the partial output and ask the model to continue. Assistant prefill is not allowed. Tool-use and thinking blocks cannot be partially recovered [V A18].

### 1.8 Batch API

- **Discount and volume.** 50% off input and output. Up to 100,000 requests or 256 MB per batch. Most batches finish within 1 hour [V A20, A2].
  - Batches that are not done within 24 hours expire.
  - Results stay available for 29 days.
  - Batches are scoped to a workspace [V A20].
- **Supported:** tools (including web search and fetch), extended thinking and most beta features.
- **Not supported:** `stream`, fast mode (`speed`), `max_tokens: 0` and the server-side `fallbacks` parameter [V A20, A30].
- **Caching inside batches** is best-effort. Anthropic reports hit rates of 30–98% and suggests a 1-hour TTL [V A20].
- **Retention.** Batch processing is not ZDR-eligible; data is retained for 29 days [V A31].
- **Fit [I].** Use batches for pre-tournament prep (bulk extraction, tagging, evidence audits), not for in-round work.

### 1.9 Server tools

**`web_search`** [V A21, A23, A2]

- Versions: `web_search_20250305` (basic), `_20260209` (adds dynamic filtering), `_20260318` (adds `response_inclusion`).
- Pricing: **$10 per 1,000 searches** plus tokens.
- Parameters: `max_uses`, `allowed_domains` or `blocked_domains` (not both), `user_location`.
  - Subdomains are included automatically.
  - Path filters work for search.
  - Wildcards are allowed only in the path.
- Citations are always on. Each citation carries `url`, `title`, `encrypted_index` and up to 150 characters of `cited_text`.
- **Search results contain only `url`, `title`, `page_age` and an `encrypted_content` blob. They do not include readable page text.**
- An administrator can disable web search org-wide in the Console.
- Availability: not on Bedrock; basic version only on Google Cloud.

**`web_fetch`** [V A22, A23]

- Versions: `_20250910` (basic), `_20260209` (adds dynamic filtering), `_20260309` (adds `use_cache`), `_20260318` (adds `response_inclusion`). No beta header is needed. Fetching costs nothing beyond tokens.
- **The full text is included in the response, so you can store it.**
  - `web_fetch_tool_result.content` is a `web_fetch_result` containing `url`, `retrieved_at` and a `document` block.
  - For HTML or text pages, the block carries `source: {type:"text", media_type:"text/plain", data: "<full text>"}` and a `title`.
  - For PDFs, the block carries `source: {type:"base64", media_type:"application/pdf", data: ...}`. You get the file, not extracted text.
- **Limits and caveats:**
  - Only URLs that already appear in the conversation can be fetched: user messages, client tool results, or earlier search/fetch results.
  - No JavaScript rendering.
  - Only text, HTML and PDF content types.
  - URLs are capped at 250 characters.
  - `max_content_tokens` truncates text content.
  - Results can come from Anthropic's cache; `use_cache: false` bypasses it on `_20260309` and later.
  - `robots.txt` and private addresses are refused.
  - Citations are optional and off by default.
- Availability: not on Bedrock or Google Cloud.
- **Dynamic filtering and ZDR.** The dynamic-filtering versions run code execution behind the scenes. That code execution is free when these tools are in the request [V A2]. These versions are not ZDR-eligible unless you set `allowed_callers: ["direct"]` [V A23].
- **Model-support inconsistency.** The web-fetch page's list of models with dynamic filtering does not include Opus 5.5 or Opus 5 [V A22]. The web-search page says "Claude 4.6 and later" [V A21]. **Test the fetch version you plan to use on Opus 5.5 before relying on it** [U].

**`code_execution`** [V A24, A2]

- Versions `_20250825`, `_20260120` and `_20260521`. The sandbox has no internet access.
- Pricing: 1,550 free hours per organization per month, then $0.05 per container-hour, with a 5-minute minimum.
- Container data is kept up to 30 days, and the tool is not ZDR-eligible [V A31].
- It is not needed for this product except as the engine behind dynamic filtering [I].

### 1.10 Citations and `search_result` blocks (quote verification)

**Citations** [V A26]

- Turn on `citations: {enabled: true}` for every document block in the request. Citations must be enabled on all documents or none. Every active model supports them.
- The location format depends on the document type:
  - Plain text: `char_location` with `start_char_index` and `end_char_index` (0-indexed, end exclusive).
  - PDF: `page_location` (1-indexed pages).
  - Custom content: `content_block_location`.
- Plain-text and PDF documents are chunked into **sentences**, so a citation covers one or more whole sentences. For finer granularity, supply custom-content documents with smaller blocks.
- The docs guarantee that citations point to valid locations in the provided documents. `cited_text` does not count toward output tokens.
- **Scanned PDFs with no extractable text cannot be cited.** Streaming delivers citations as `citations_delta` events.
- **Citations cannot be combined with structured outputs** (the request returns a 400).

**`search_result` blocks** [V A27]

- Use them to cite your own retrieved text, placed at the top level or inside tool results.
- The block shape is `{type:"search_result", source, title, content:[text blocks], citations}`. No beta header is needed.
- Citations come back as `search_result_location` with `search_result_index`, `start_block_index` and `end_block_index`.
- The citable unit is a whole text block.

**Implication for card cutting [I].** Citations are sentence-granular, while debate highlighting works at sub-sentence spans. Keep v2's plan: the model selects spans by offset over stored source text, and code verifies them deterministically. Use Citations (or `search_result` blocks) for claim-support checks ("does the source say what the tag claims?"), which runs as a separate step from structured output.

### 1.11 Files API and PDF input

**Files API** [V A28]

- Generally available with no beta header. Up to 500 MB per file and 1 TB per organization. File operations are free.
- File types map to content blocks: PDF and text use `document`, images use `image`, and datasets use `container_upload`.
- Files you upload cannot be downloaded again.
- **Files are visible to the whole workspace.** Never accept `file_id` values from end users.
- Not ZDR-eligible. Not available on Bedrock or Google Cloud.
- `.docx` must be converted to text or PDF first.

**PDF input** [V A29]

- Supply a PDF as base64, a URL or a `file_id`.
- Limits: 32 MB per request and 600 pages. The page limit drops to 100 when the request's context window is under 1M.
- **Each page is converted to an image, and the extracted text is supplied alongside it.** Charts and scanned pages are therefore understood visually.
- Cost: about 1,500–3,000 text tokens per page, plus image tokens.
- Password-protected or encrypted PDFs are not supported.

### 1.12 Refusals and fallback

- **Which models refuse.** Fable 5.1, Fable 5, Opus 5.5 and Opus 5 can decline a request. The response is HTTP 200 with `stop_reason: "refusal"` and a `stop_details.category` [V A30].
- **Billing.** A refusal before any output is billed if its category is `bio`, `frontier_llm` or `reasoning_extraction`. It is not billed for `cyber`, `general_harms` or a null category. Every refusal counts against rate limits [V A30].
- **Server-side fallback** (beta, Claude API only):
  - Send `fallbacks: "default"` with the header `server-side-fallback-2026-07-01`.
  - Alternatively, name up to three fallback models of your own.
  - It is not available on Batches, Bedrock, Google Cloud or Foundry.
  - On other platforms, use the SDK middleware `betaRefusalFallbackMiddleware` [V A30].
- **Debate-specific risk [I].** Evidence about bioterror, cyberwar, nuclear escalation and pandemics is ordinary in policy debate. Put these topics in the eval set and track the refusal rate for each model.

### 1.13 Data retention, ZDR, training, and minors

- **Training.** Anthropic's data retention page says retained data is never used for model training without your express permission [V A31].
- **Standard commercial retention.**
  - API inputs and outputs are deleted within 30 days.
  - If content is flagged, inputs and outputs can be kept up to 2 years and trust-and-safety scores up to 7 years.
  - Feedback submissions are kept 5 years [V A32, A31].
- **Zero data retention (ZDR).**
  - ZDR requires an arrangement with Anthropic sales and is enabled per organization.
  - It does not cover the Console, Managed Agents, the Batch API, the Files API, code execution or Agent Skills.
  - Covered Models (Fable 5.1, Fable 5 and the Mythos models) require 30-day retention. An organization under ZDR can enable 30-day retention for one workspace [V A31].
- **ZDR eligibility by feature** [V A31].
  - Eligible: the Messages API, citations, `search_result` blocks, PDF input, prompt caching, fast mode and fine-grained streaming.
  - Eligible with a caveat: structured outputs, because the schema itself is cached for up to 24 hours.
  - Eligible only in their basic versions: `web_search` and `web_fetch`.
- **Minors.** Anthropic permits API products for minors if the organization implements all of the following [V A34]:
  - age verification;
  - content moderation;
  - monitoring and reporting;
  - disclosure that users are talking to an AI;
  - compliance with COPPA and similar laws;
  - Anthropic's child-safety system prompt, when available.

  Anthropic may audit compliance.

### 1.14 Rate limits and usage tiers

- **Tiers and spend caps.** Tiers are Start, Build and Scale; the monthly spend caps are $500, $1,000 and $200,000. A Custom tier is available through sales [V A33].
  - New organizations may begin in an Evaluation tier with lower limits.
  - Limits use a token bucket. Short bursts can trip the per-minute limits.
  - When the cap is hit, requests return 429 with `enforced_spend_limit_reached` [V A33].
- **Per-minute limits** (RPM / ITPM / OTPM) [V A33]:

  | Model group | Start | Build | Scale |
  |---|---|---|---|
  | Opus 5.5 (own bucket) | 1,000 / 2M / 400K | 5,000 / 5M / 1M | 10,000 / 10M / 2M |
  | Opus 5 (own bucket) | 1,000 / 2M / 400K | 5,000 / 5M / 1M | 10,000 / 10M / 2M |
  | Sonnet 5 (own bucket) | 1,000 / 2M / 400K | 5,000 / 5M / 1M | 10,000 / 10M / 2M |
  | Haiku 4.5 | 1,000 / 2M / 400K | 5,000 / 5M / 1M | 10,000 / 10M / 2M |
  | Fable 5.x (5.1 and 5 combined) | 1,000 / 500K / 100K | 2,000 / 1.5M / 300K | 4,000 / 4M / 800K |

- **Other limits.**
  - Cached reads do not count toward ITPM on current models.
  - Fast mode has its own separate limit.
  - Batches: Start tier allows 1,000 RPM and 200K queued batch requests.
  - The Files API allows about 500 requests per minute [V A33, A28].

---

## 2. OpenAI (for cross-provider benchmarking)

| Model | Positioning | Context (max input) | Max output | Input / cached / cache write / output | Above 272K input | Reasoning effort | Knowledge cutoff | Released | Sources |
|---|---|---|---|---|---|---|---|---|---|
| `gpt-6-astra` | Most capable; hardest end-to-end work | 1.05M (922K) | 128K | $10 / $1 / $12.50 / $50 | Whole request at 2x input and cache, 1.5x output | `low`–`max`; **no `none`** | 2026-04-30 | 2026-09-03 | O1–O4 |
| `gpt-6-sol` | Complex coding and agentic workflows | 1.05M (922K) | 128K | $2 / $0.20 / $2.50 / $10 | Same | `none`–`max`, default `medium` | 2026-04-20 | 2026-09-22 | O2–O4 |
| `gpt-6-luna` | Most efficient; high-volume tasks | 1.05M (922K) | 128K | $0.10 / $0.01 / $0.125 / $0.50 | Same | `none`–`max`, default `medium` | 2026-05-18 | 2026-09-22 | O2–O4 |
| `gpt-5.6-sol` (alias `gpt-5.6`) | Previous flagship | 1.05M (922K) | 128K | $4 / $0.40 / $5 / $20 (promotional price at least through 2026-11-21) | 2x input, 1.5x output | `none`–`max` | 2026-02-16 | – | O2, O3 |
| `gpt-5.6-terra` | Balance of cost and intelligence (the old "mini" tier) | 1.05M (922K) | 128K | $2 / $0.20 / $2.50 / $12 | Same | `none`–`max` | 2026-02-16 | – | O2, O3 |
| `gpt-5.6-luna` | Cost-sensitive (the old "nano" tier) | 1.05M (922K) | 128K | $0.20 / $0.02 / $0.25 / $1.20 | Same | `none`–`max` | 2026-02-16 | – | O2, O3 |

- **Lineup guidance.** The models page tells new projects to start with GPT-6 Astra, and names GPT-5.6 Terra and Luna as the balance and cost picks [V O1]. That page may not yet reflect GPT-6 Sol and Luna, which launched on 2026-09-22 [V O4].
- **Processing tiers.**
  - Batch and Flex cost 50% of Standard.
  - **Fast mode is the old Priority processing, renamed on 2026-07-30.** Set `service_tier: "fast"` (or `"priority"`). It costs 2x Standard and claims up to 2.5x faster speed.
  - Fast mode for GPT-6 Astra comes with **no latency SLA**.
  - Fast mode shares the Standard rate limit. If traffic ramps too quickly, requests are downgraded to standard speed [V O2, O5].
  - Flex is in beta, with slower responses and occasional unavailability [V O6].
- **API surface.** The Responses API is the primary interface; the Assistants API shut down on 2026-08-26 [V O4].
  - GPT-6 Astra requires the Responses API for tool calling.
  - GPT-6 Sol and Luna support function calling in Chat Completions only when `reasoning_effort` is `none`.
  - When reasoning is on, `temperature`, `top_p` and logprobs must be removed [V O11].
  - GPT-6 Astra runs asynchronous misalignment monitoring, which can stop a conversation for review [V O4].
- **Structured outputs.** Use `text.format` with `{type:"json_schema", strict:true}`.
  - Every field must be required. Emulate optional fields with a union that includes `null`.
  - `additionalProperties: false` is mandatory.
  - Limits: up to 5,000 object properties, 10 levels of nesting and 1,000 enum values.
  - The first request with a new schema has extra latency [V O7].
- **Web search.** The `web_search` tool in the Responses API costs $10 per 1,000 calls plus content tokens [V O2, O8].
  - Answers carry `url_citation` annotations (URL, title and start/end indices into the answer), plus an optional `sources` list of URLs.
  - **No documented field returns the retrieved page text.**
  - Domain filters allow up to 100 allowed or blocked domains.
  - The search context window is capped at 128K [V O8].
- **Data.**
  - API data has not been used for training since 2023-03-01 unless you opt in.
  - Abuse-monitoring logs are kept up to 30 days.
  - The Responses API stores application state for 30 days by default. Set `store: false` to avoid this.
  - ZDR and Modified Abuse Monitoring require OpenAI's approval [V O9].
- **Minors.** Products for users under 18 are allowed with safeguards. Personal data of children under 13 must not be processed without first implementing ZDR [V O12].
- **Usage tiers.**
  - Tier 1 requires $5 paid and allows $100 per month; Tier 5 requires $1,000 paid [V O10].
  - At Tier 1, GPT-6 Astra and Sol get 500 RPM and 500K TPM [V O3].

---

## 3. Google Gemini (production-blocked for this product; see 3.3)

### 3.1 Current models (Gemini Developer API)

| Model (code) | Status | Input / output limit | Paid price, per 1M tokens (Standard) | Notes | Sources |
|---|---|---|---|---|---|
| `gemini-3.8-flash` | Stable, newest (Sep 2026) | 1,048,576 / 65,536 | $0.75 / $3.75 through 2026-12-31, then $1.50 / $7.50 | Thinking levels `low`/`medium`/`high` (`minimal` returns an error). Structured output, search grounding and URL context supported. Batch and Flex cost 50%; Priority costs about 1.8x. | G1, G2, G3 |
| `gemini-3.7-flash` | Stable (Aug 2026) | 1,048,576 / 65,536 | Same as 3.8 Flash | Previous generation | G2, G3 |
| `gemini-3.5-flash` | Stable ("legacy Flash") | not checked | $1.50 / $9.00 | – | G1, G3 |
| `gemini-3.5-flash-lite` | Stable (Jul 2026) | 1,048,576 / 65,536 | $0.30 / $2.50 | The fastest and cheapest 3.5 model | G2, G3 |
| `gemini-3.1-flash-lite` | Stable (May 2026) | 1,048,576 / 65,536 | $0.25 / $1.50 | – | G2, G3 |
| `gemini-3.1-pro-preview` | **Preview**, the only Pro model listed | 1,048,576 / 65,536 | $2 / $12 up to 200K tokens; $4 / $18 above 200K | No free tier | G1, G2, G3 |

### 3.2 Features

- **APIs.** The new Interactions API is in **beta** and is the recommended starting point for new projects. `generateContent` remains fully supported [V G7].
  - Interactions are stored by default (`store=true`): 55 days on the paid tier and 1 day on the free tier.
  - Set `store=false` to opt out [V G7].
- **SDK.** The current SDK is `@google/genai`; `@google/generative-ai` is legacy [V G9].
- **Structured output.** Set `response_format` with a JSON schema, which can be generated from Zod or Pydantic. `anyOf` and `$ref` work, and the docs include a recursive `$ref: "#"` example [V G6].
- **Grounding with Google Search** [V G3, G4]:
  - The first 5,000 search queries per month are free, shared across Gemini 3.x; after that it is $14 per 1,000 queries. Each query is billed individually.
  - The response gives the queries run, `search_suggestions` HTML, and `url_citation` annotations. An annotation links a span of the model's answer to a URL and title.
  - **It returns no source text, only URLs, titles and indices into the answer.**
- **Grounding terms** [V G8]:
  - Grounded results may not be cached, analyzed, trained on or used to build an index.
  - Storage is allowed for up to 2 years only in narrow cases, such as a user's own chat history.
  - Search Suggestions must be displayed.
  - These terms make grounding unsuitable for building an evidence library [I].
- **URL context tool** [V G5]:
  - Up to 20 URLs per request and 34 MB of content per URL.
  - Supports text, images and PDFs. It does not support paywalled pages, YouTube or Google Workspace files.
  - Content comes from an index cache, with a live fetch as fallback.
  - The response returns `url_citation` annotations and `url_context_result` status metadata. Retrieved content is billed as input tokens.

### 3.3 Data and age terms (decisive)

- **Paid services.** Prompts and responses are not used to improve Google's products. They are logged for a limited period to detect abuse [V G8, G3].
- **Unpaid services.** Content is used to improve Google products, and human reviewers may read it [V G8].
- **The age clause.** Users must be 18 or older. The API may not be used in an application that is directed to, or likely to be accessed by, people under 18 [V G8]. **This excludes Gemini Developer API from a high-school product.**
- **Possible alternative [U].** Whether Google Cloud Vertex AI (the "Gemini Enterprise Agent Platform") is governed by different terms was not checked. It would need legal review.

---

## 4. Other providers (only where verified current and plausibly useful)

| Provider | What is current | Why consider it | Concerns | Sources |
|---|---|---|---|---|
| Groq | `openai/gpt-oss-120b`: about 500 tokens/s, $0.15 / $0.60, 131K context, 65K max completion. `gpt-oss-20b`: about 1,000 tokens/s, $0.075 / $0.30. | Sub-second, very high-throughput micro-tasks (classification, reformatting) | Open model with lower capability. 131K context is tight for a 100K-token speech doc plus instructions [I]. | X1 |
| Cerebras | `gpt-oss-120b`: about 3,000 tokens/s, context 65K free / 131K paid. `qwen-3.8-27b`: about 1,850 tokens/s. | The fastest raw decode found | Same as above. The gateway's metadata for its gpt-oss endpoint shows `has_zdr: false` [V V19]. | X2, V19 |
| DeepSeek | `deepseek-flash` (V4.1-Flash) and `deepseek-v4-pro`: 1M context, up to 384K output. Peak prices: $0.30 / $1.20 and $1.32 / $3.96; off-peak is half. | Very cheap long-context experiments | The privacy policy says personal data is processed and stored in the People's Republic of China. **Do not send student data to DeepSeek's own API** [I]. The same open weights are hosted by US providers through the gateway. | X3, X4, V19 |
| xAI (docs now branded "SpaceXAI") | `grok-4.7` flagship: 500K context, $2 / $6 | Cheap second opinion or judge | Not evaluated further; data terms not reviewed [U] | X5 |

All of these, plus Kimi, GLM, Qwen and Mistral, are reachable through Vercel AI Gateway with one credential [V V19]. That makes the gateway the cheapest way to include one or two of them in the benchmark [I].

---

## 5. Live latency snapshot (indicative only)

Source: the Vercel AI Gateway public endpoints API, `GET https://ai-gateway.vercel.sh/v1/models/{id}/endpoints`, fetched 2026-09-25 at about 08:16 UTC. The fields are `latency_last_1h` (p50/p95, in ms) and `throughput_last_1h` (p50, tokens/s) [V V19].

**Caveats.** The API response does not define "latency"; it is probably time to first token, including thinking [U]. Traffic is a mix of real workloads over a one-hour window. **This is not a benchmark.** Use it only to pick benchmark candidates.

| Model (gateway slug) | Provider route | Latency p50 / p95 (ms) | Throughput p50 (tokens/s) | 1-day uptime |
|---|---|---|---|---|
| anthropic/claude-haiku-4.5 | anthropic | 428 / 462 | 97 | 99.97% |
| anthropic/claude-sonnet-5 | anthropic | 2,307 / 7,131 | 98 | 99.98% |
| anthropic/claude-opus-5 | anthropic | 888 / 3,257 | 252 | 99.97% |
| anthropic/claude-opus-5.5 | anthropic | 2,559 / 7,186 | 265 | 99.99% |
| anthropic/claude-opus-5.5 | bedrock / vertexAnthropic / claudeaws | 4,001 / 2,932 / 4,119 (p50) | 99 / 117 / 151 | – |
| anthropic/claude-fable-5.1 | anthropic | 4,137 / 9,000 | 76 | 99.99% |
| openai/gpt-6-luna | openai | 1,715 / 4,917 | 196 | 99.97% |
| openai/gpt-6-sol | openai | 2,437 / 6,593 | 122 | 99.99% |
| openai/gpt-6-astra | openai | 2,004 / 9,409 | 54 | 99.98% |
| google/gemini-3.8-flash | google | 1,756 / 8,659 | 189 | **86.96%** |
| google/gemini-3.5-flash-lite | google | 583 / 1,328 | 417 | 99.95% |
| openai/gpt-oss-120b | groq / cerebras | 261 / 128 (p50) | 458 / not reported | – |

Two readings of this snapshot [I]:

- For Opus 5 and Opus 5.5, the direct Anthropic route showed about 2.3–3.5x the throughput of the Bedrock and Vertex routes. For Sonnet 5 and Haiku 4.5, the routes were similar (Bedrock was slightly faster for Haiku). If you use the gateway, pin Opus routes to `anthropic`, and pin Anthropic-only features to `anthropic` regardless of model.
- Opus 5 and Opus 5.5 decode about 2.5x faster than Sonnet 5 in this window. Sonnet's "Fast" rating is not guaranteed to hold for long outputs, so measure it yourself.

---

## 6. Vercel AI SDK

- **Versions on npm** as of 2026-09-24/25 [V V8]:
  - `ai@7.0.114` (7.0.0 released 2026-06-25; 6.0.0 released 2025-12-22)
  - `@ai-sdk/anthropic@4.0.63`, `@ai-sdk/gateway@4.0.92`, `@ai-sdk/openai@4.0.75`, `@ai-sdk/google@4.0.80`, `@ai-sdk/react@4.0.117`
  - For comparison: `@anthropic-ai/sdk@0.128.0`, `openai@7.23.0`, `@google/genai@2.24.0`, `zod@4.6.5`
- **Breaking changes in v7:** Node 22 or later is required (24 LTS preferred); packages are ESM-only [V V2]. v2's `package.json` already satisfies both.
- **Structured output:**
  - Use `generateText` or `streamText` with `output: Output.object({ schema })`, where the schema is Zod, Valibot or JSON Schema.
  - Stream partial objects with `partialOutputStream`; the client hook is `useObject` [V V1].
  - `generateObject` and `streamObject` were **deprecated in v6** (PR #10754) and "will be removed in a future version" [V V3]. The v7 docs no longer have a `generateObject` reference page; the URL serves a "Page Not Found" page. The v7 migration guide still mentions both functions in passing [V V1, V2].
  - `experimental_output` was removed in v7 [V V2].
- **Controls on `streamText`** [V V4]:
  - `abortSignal`.
  - `maxRetries`, default 2.
  - `streamRetries`, default 0. It retries provider errors that occur after streaming has started.
  - `timeout` as a number, or as `{ totalMs, stepMs, firstChunkMs, chunkMs, toolMs }`. **`firstChunkMs` fits the in-round latency targets.**
  - `reasoning`: `'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`.
  - `onError`, `onFinish`, `onAbort`.
- **Telemetry.** OpenTelemetry moved to `@ai-sdk/otel`. Call `registerTelemetry(new OpenTelemetry())` in `instrumentation.ts`. Once registered, telemetry is on by default for every call [V V2]. The helper `stepCountIs` was renamed `isStepCount` [V V2].
- **Anthropic provider (`@ai-sdk/anthropic`)** [V V5]:
  - For `claude-opus-5-5` and `claude-fable-5-1`, the default `structuredOutputMode: "auto"` uses the native `output_config.format`.
  - Forced or required `toolChoice` is downgraded to `auto`, with a warning.
  - `providerOptions.anthropic` accepts `effort`, `thinking: {type:'adaptive', display:'summarized'|'omitted'|'updates'}` (the SDK adds the updates beta header), `cacheControl` including `ttl: '1h'`, and `speed`.
  - Provider tools include `anthropic.tools.webFetch_20260318(...)` and web search.
  - PDFs go in as `file` parts. Batch support is marked experimental.
  - **Gaps [V V5]:**
    - The fast-mode section still names `claude-opus-4-6` as the example. Per Anthropic, Opus 4.6 no longer supports fast mode [V A14].
    - **Document Citations (`char_location`) are not documented.** A search of the docs found no page for it.
    - Treat both as untested until verified in code [U].

---

## 7. Vercel AI Gateway

- **What it is.** One endpoint for about 390 catalog entries [V V19], with request logs, budgets, provider and model fallbacks, and spend tracking. Your app does not have to run on Vercel [V V9].
- **Pricing.** **No markup or platform fee on tokens, including BYOK** [V V10, V11]. Paid-tier credits expire one year after purchase [V V11].
  - Add-ons: Custom Reporting ($0.075 per 1,000 writes; $5 per 1,000 queries), team-wide provider allowlist ($0.10 per 1,000 requests, Pro and Enterprise), team-wide ZDR ($0.10 per 1,000 requests, Pro and Enterprise; per-request ZDR is free), and trace drains ($0.05 per 1,000 traces plus $0.50/GB, Pro and Enterprise) [V V10].
- **Free tier** [V V10, V11, V12, V15]:
  - A monthly included credit, not an expiring trial.
  - Covers only a subset of models, with lower per-model rate limits.
  - **Using the free credits requires a valid payment method on the team.**
  - The first credit purchase moves the team to the paid tier, and the monthly free credit stops.
  - Unverified details [U]:
    - The dollar amount of the free credit is not stated on the docs pages fetched. It is commonly reported as $5.
    - The pricing docs say "every Vercel team account" gets the free tier, but do not mention Hobby specifically.
    - Which models are in the free subset could not be read from the API; the `freeTier` query parameter is ignored.
- **Paid tier.** The gateway itself applies no rate limits; the provider's limits still apply [V V15].
- **Authentication** [V V6, V13]:
  - `AI_GATEWAY_API_KEY` is a team-scoped key that works from any environment.
  - On Vercel deployments, **OIDC** works automatically.
  - For local development, run `vercel link` and then `vercel env pull` to get `VERCEL_OIDC_TOKEN`.
  - **OIDC tokens are valid for 12 hours.** `vercel dev` refreshes them automatically; otherwise re-run `vercel env pull`.
  - If an API key is present, it is used instead of OIDC, even when the key is invalid.
- **BYOK** [V V14]:
  - Available on the paid tier only.
  - Credentials are scoped to the whole team.
  - **If a request with your own key fails, the gateway retries it with Vercel's system credentials** and bills your credits.
  - BYOK spend is not counted in budgets.
  - A request-scoped variant exists: `providerOptions.gateway.byok`.
- **Routing and fallbacks** [V V17, V6]:
  - `providerOptions.gateway.models: [...]` sets model fallbacks.
  - `order` and `only` control provider routing.
  - Provider-specific options pass through under the provider's own key, for example `anthropic: {...}`.
  - Claude models are served by several routes: `anthropic`, `bedrock`, `vertexAnthropic` and `claudeaws` [V V19].
- **Claude features through the gateway** [V V18]:
  - The Anthropic Messages API is available at `https://ai-gateway.vercel.sh`; set it as `ANTHROPIC_BASE_URL`.
  - Documented: streaming, tool calling, extended thinking, structured outputs, images, `count_tokens`, `cache_control` passthrough (and `caching: 'auto'`), and `web_search_20250305`.
  - **Not documented through the gateway [U]:** Citations, `search_result` blocks, `web_fetch`, the Files API, the fast-mode beta header, server-side `fallbacks`, and per-message effort.
  - The gateway's own notes say some provider-executed tools may not work through it and may need BYOK [V V6].
- **Gateway model slugs** [V V19]:
  - `anthropic/claude-opus-5.5`, `anthropic/claude-opus-5.5-fast` (priced $8 / $40), `anthropic/claude-fable-5.1`, `anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4.5`, `anthropic/claude-opus-5`
  - `openai/gpt-6-astra`, `openai/gpt-6-sol`, `openai/gpt-6-luna`
  - `google/gemini-3.8-flash`
  - The catalog does not tag `claude-opus-5.5` as `structured-output`; this is probably a metadata lag [U].
  - Whether the `-fast` slug bypasses Anthropic's fast-mode waitlist is unverified [U].
- **Data handling.**
  - The gateway does not keep prompt or response content, and Vercel does not train on it.
  - It logs metadata only; routing-attempt details are kept for 30 days [V V11].
  - ZDR routing (`zeroDataRetention: true`) is **Pro and Enterprise only**. A request fails if no ZDR-compliant provider exists for the model [V V16].
  - Fable 5.1's gateway endpoints report `has_zdr: false`, so ZDR routing would fail for Fable [V V19].
- **Vercel plan limits relevant here** [V V20]:
  - **Hobby is for non-commercial, personal use only.**
  - Function max duration is 300 seconds on Hobby, and 800 seconds on Pro (1,800 seconds in an extended beta).
  - Long Fable or Opus drafting runs need background jobs or batches rather than a single request handler [I].

---

## 8. Candidate matrix (what to benchmark live, per product task)

The latency targets below are **proposals** to be confirmed with coaches and debaters [I]. The configurations to test are also [I]. The capability facts they rely on are cited in sections 1–7.

| # | Task (latency target) | Candidates and configurations to benchmark | Why these | Notes and risks |
|---|---|---|---|---|
| T1 | **Speech-doc extraction and argument identification** (30–100K tokens; p95 under 30 s with streamed progress) | 1. **Sonnet 5**, effort `low`/`medium`. 2. **Haiku 4.5**, thinking off. 3. **Opus 5.5**, effort `low`. 4. **GPT-6 Luna**, `reasoning: none`/`low`, as a cross-provider baseline. | Sonnet 5 is cheap, "Fast", 1M context and supports structured outputs [V A7, A16]. Haiku 4.5's 200K window fits a single doc [V A8]. Opus 5.5 sets the quality ceiling at low effort, with $0.20 cache reads [V A2]. Luna is the cheapest 1M-context strict-schema model [V O2]. | v2 parses OOXML deterministically, so the model should **label pre-parsed blocks by ID rather than retype text** [I]. Watch schema limits (24 optional, 16 union parameters) [V A16]. Haiku needs at least 4,096 tokens to cache [V A17]. |
| T2 | **Automatic flowing**: link responses to arguments across speeches (p95 under 60 s after a doc arrives) | 1. **Opus 5.5**, effort `medium`. 2. **Sonnet 5**, effort `high`/`medium`. 3. **GPT-6 Sol**, effort `medium`. 4. **Fable 5.1**, effort `high`, **as a gold-label generator only**. | This is the hardest reasoning task in the structured routes; a cross-provider check guards against same-family bias [I]. | Use flat ID-linked schemas because recursion is not allowed [V A16]. Fable is kept out of production: it is slower, $10/$50, needs 30-day retention and has smaller rate limits [V A1, A31, A33]. |
| T3 | **Fast targeted revisions** in round, for example re-tag, shorten or re-highlight (p95 TTFT under 1.5 s; completion under 6 s for outputs up to 300 tokens) | 1. **Haiku 4.5**, no thinking. 2. **Sonnet 5**, thinking disabled, effort `low`. 3. **Opus 5**, thinking disabled at effort `high` or below, optionally with fast mode. 4. **GPT-6 Luna**, `reasoning: none`. Optional: **gpt-oss-120b on Groq or Cerebras** for trivial transforms only. | Haiku is the fastest Claude model; the snapshot shows about 0.43 s p50 [V A1, V19]. Sonnet 5 and Opus 5 can run with thinking off; **Opus 5.5 cannot** [V A13, A4]. Fast mode raises output speed, not TTFT [V A14]. | Cache the speech doc with a 1-hour TTL [V A17]. Set AI SDK `timeout.firstChunkMs` and fall back to Haiku on timeout [V V4]. Fast mode needs the waitlist [V A14]. For open models: quality and data concerns (section 4). |
| T4 | **Line-by-line responses** (first useful content in under 5 s; complete in under 45 s) | 1. **Opus 5.5**, effort `medium` then `high`. 2. **Sonnet 5**, effort `high`. 3. **GPT-6 Sol**, effort `medium`/`high`. 4. **Fable 5.1** as the ceiling. | This is the core quality task and where tuning effort matters most [V A10, A12]. | Stream thinking with `display: "updates"`/`"summarized"` so the UI does not sit silent [V A13]. Track the refusal rate on bio, cyber and nuclear topics [V A30]. |
| T5 | **Complete constructive drafting** (offline; minutes are acceptable) | 1. **Fable 5.1**, effort `high`. 2. **Opus 5.5**, effort `high`/`xhigh`. 3. **GPT-6 Astra**, effort `medium`/`high`. 4. **Sonnet 5**, effort `high`, as the budget option. | Long-horizon synthesis is Fable's stated use case [V A10]. Astra is OpenAI's flagship [V O1]. | **Cards must come from stored, verified sources.** The model writes tags, analytics and structure only [I, and see PROJECT_RECORD]. Hobby's 300 s function limit means a background job or the Batch API [V V20, A20]. |
| T6 | **Rebuttal strategy and synthesis** (under 60–90 s, inside prep time) | 1. **Opus 5.5**, effort `medium`/`high`. 2. **Fable 5.1**, effort `high`, when time allows. 3. **GPT-6 Sol**, effort `high`. 4. **Sonnet 5**, effort `high`. | Needs reasoning across the whole flow; 1M context at standard price on Claude [V A2]. | Use the per-message effort beta to raise effort without losing the cache [V A12]. |
| T7 | **Evidence evaluation and citation checking** (background; seconds to minutes) | Step 0: **deterministic checks, no model** (normalized substring match of card text against stored source; required citation fields). 1. **Haiku 4.5 with Citations** as a cheap first pass. 2. **Sonnet 5 with Citations**. 3. **Opus 5.5**, effort `medium`, for hard cases (power-tagging, context). 4. **GPT-6 Sol** as a cross-family judge. | Citations give exact `cited_text` and offsets, guaranteed valid [V A26]. `web_fetch` returns full text to store [V A22]. | Citations and structured output cannot share a request [V A16]. Citations are sentence-granular [V A26]. Scanned PDFs are not citable [V A26]. Web search results contain no page text [V A21]. |
| T8 | **Long-context comprehension** (single 30–100K docs up to a full round's docs) | 1. **Opus 5.5**. 2. **Sonnet 5**. 3. **GPT-6 Sol** (note the surcharge above 272K). 4. **Fable 5.1** as the ceiling. | 1M context on all four [V A1, O3]. | Haiku 4.5 only up to 200K [V A8]. Test at 100K, 300K and 600K tokens with cross-speech questions [I]. |
| T9 | **Structured output reliability** (cross-cutting) | Anthropic `output_config.format` on **Sonnet 5, Opus 5.5 and Haiku 4.5**, compared with OpenAI strict `json_schema` on **GPT-6 Sol and Luna** | Both use constrained decoding [V A16, O7]. | Measure: schema-valid rate; semantic validity (IDs resolve, spans exist); truncation on refusal or `max_tokens`; and first-call grammar-compile latency [V A16]. |

**Gemini 3.8 Flash** would otherwise be a strong candidate for T1, T3 and T8 on price and speed [V G3]. It is **excluded from production** by the under-18 clause [V G8]. Benchmark it only if a compliant contractual path is confirmed [I].

---

## 9. Integration recommendations

| Option | Strengths | Weaknesses |
|---|---|---|
| **A. Direct Anthropic SDK** (`@anthropic-ai/sdk@0.128.0`, already in v2 [V V8]) | Full feature surface: Citations, `search_result` blocks, `web_fetch` full text, Files API, fast-mode and fallback beta headers, per-message effort, `count_tokens`, batches, and the refusal-fallback middleware [V A14, A16, A22, A26, A27, A28, A30]. Exact `usage` data, including cache tokens and `speed`. | Anthropic only. You write your own UI streaming glue. No cross-provider failover. |
| **B. AI SDK 7 with `@ai-sdk/anthropic`**, using a direct Anthropic key | Unified streaming for React (`useChat`, `useObject`). Zod schemas through `Output.object`. `abortSignal`, `timeout.firstChunkMs`, `streamRetries`, OpenTelemetry. Model swaps for benchmarking are trivial [V V1, V4, V5]. | Provider docs lag Anthropic (fast mode, document Citations) [V V5]. Anthropic-only features must be verified one by one. Some response details only reach you through `providerMetadata` [I]. |
| **C. AI Gateway** (AI SDK model strings or the Anthropic-compatible endpoint) | One credential for every provider, which is ideal for the eval harness. OIDC on Vercel means no key is stored. Zero markup, fallbacks, logs with latency and cost, budgets [V V9–V17]. | BYOK needs paid credits and **falls back to Vercel's system credentials** when your key fails [V V14]. May route Claude traffic to Bedrock, Vertex or Claude-on-AWS, where `web_fetch`, Files and fast mode are unavailable or different [V A14, A22, A28]. Claude features beyond caching, thinking, structured outputs and web search are undocumented through it [V V18]. ZDR routing is Pro and Enterprise only [V V16]. |

**Recommended architecture [I]:**

1. **Production AI calls go directly to Anthropic** under the team's own organization, so its retention settings and minors compliance apply.
   - Use **AI SDK 7 with `@ai-sdk/anthropic`** for chat and streamed structured routes: T1–T4, T6 and T9.
   - Use the **raw Anthropic SDK** for evidence routes that need Citations, `search_result` blocks, `web_fetch` or Files (T7, and the source-ingest side of T5), and for fast mode or server-side fallbacks.
   - Both already sit in `package.json`.
2. **Use AI Gateway for the benchmark harness.** Call OpenAI, Google and open models with one key, and read latency and cost from its logs.
   - It is optional as a production fallback. If used there, set `only: ['anthropic']` on Anthropic-only routes, and keep BYOK off until the silent fallback to Vercel's system credentials is acceptable.
3. **Keep one model registry** (v2 decision D-05), and resolve models per task through it. That lets the matrix above feed straight into configuration.
4. **Refusal handling everywhere.** Check `stop_reason === "refusal"` and route to a fallback model, either server-side with `fallbacks: "default"` or client-side with the middleware [V A30].
5. **Upgrade the Vercel plan to Pro before commercial launch.** Hobby is non-commercial only, and Pro allows longer functions [V V20].

---

## 10. Credentials and setup

| Provider | Sign-up or console | Minimum to start | Environment variables | Notes |
|---|---|---|---|---|
| Anthropic | https://platform.claude.com/ (API keys at https://platform.claude.com/settings/keys) | Pay-as-you-go credits. New users get a small amount of free credit [V A2]. Tiers are Start, Build and Scale; new organizations may start in an Evaluation tier [V A33]. | `ANTHROPIC_API_KEY`, used by both `@anthropic-ai/sdk` and `@ai-sdk/anthropic` [V V5] | Fast mode needs the waitlist or an account manager [V A14]. Fable needs 30-day retention, which is only an issue if the organization is on ZDR [V A31]. Follow the guidelines for organizations serving minors [V A34]. The user's key already reaches all the models listed in the brief. |
| OpenAI | https://platform.openai.com/ (create a key in the dashboard [V O14]; automated checks got a 403 on the exact key path) | Tier 1 needs $5 paid [V O10] | `OPENAI_API_KEY` [V O14, V7] | Minors: safeguards required; ZDR required before processing personal data of children under 13 [V O12]. Set `store: false` on Responses [V O9]. |
| Google Gemini | https://aistudio.google.com/apikey [V G10] | The paid tier needs a Cloud project with active billing [V G8] | `GEMINI_API_KEY` or `GOOGLE_API_KEY` (`GOOGLE_API_KEY` wins if both are set) for `@google/genai` [V G10]. `GOOGLE_GENERATIVE_AI_API_KEY` for `@ai-sdk/google` [V V7]. | **Not for production** (18+ terms) [V G8] |
| Vercel AI Gateway | https://vercel.com/signup | Free tier needs a payment method. Paid tier means buying credits. BYOK needs the paid tier. ZDR needs Pro or Enterprise [V V10, V12, V14, V16]. | `AI_GATEWAY_API_KEY`, or OIDC through `VERCEL_OIDC_TOKEN` (`vercel link`, then `vercel env pull`; valid 12 hours; `vercel dev` refreshes it) [V V13, V6] | Use OIDC in deployed environments so no gateway key is stored [I] |
| Groq (optional) | https://console.groq.com/keys | Developer plan limits apply per model [V X1] | `GROQ_API_KEY` [V X1] | Benchmark only |
| Cerebras (optional) | https://cloud.cerebras.ai/ | Free trial or pay-as-you-go [V X2] | not verified [U] | Benchmark only |

**Security.** `PROJECT_RECORD.md` notes the repository is public and that its history contains secrets [V].

- Keep keys only in Vercel environment variables or a gitignored `.env.local` [I].
- Rotate any key that has ever been committed [I].
- Prefer OIDC over stored keys for the gateway [I].

---

## 11. Evaluation methodology (brief and practical)

Official guidance I verified:

- Anthropic says evals should be task-specific, automated where possible, and should favor more cases with automated grading over fewer hand-graded ones [V A35].
- Anthropic ranks grading methods as code-based first (fastest and most reliable), then LLM-based, with human grading used sparingly [V A35].
- Anthropic's advice for LLM judges: give them detailed rubrics, have them output a discrete label or a 1–5 score, and let them reason before scoring [V A35].
- OpenAI says to calibrate LLM judges against human labels [V O13].
- OpenAI warns about position bias and verbosity bias in judges [V O13].
- OpenAI prefers pairwise or pass/fail judging, advises controlling for length, and recommends running evals on every change [V O13].

Plan for this product [I]:

1. **Gold set.** Use 30–50 real speech docs from `docs/research/samples/` and team files, plus coach-made flows and responses.
   - Stratify by task (T1–T9) and by hard cases: very long docs, bad formatting, and bio, cyber or nuclear impacts that could trip refusals.
   - Hold out a test split.
2. **Programmatic checks first.** These are cheap, deterministic and required before any judge runs:
   - schema validity;
   - IDs that resolve;
   - quoted or highlighted spans that are exact substrings of the stored source after normalization;
   - no card text changed;
   - every card carries a source URL, date and author, and the URL was actually fetched;
   - length and time budgets per speech;
   - refusal and truncation rates.
3. **Rubric-based LLM judge** for subjective quality: line-by-line coverage, answering the actual warrant, and strategic prioritization.
   - Use pass/fail criteria per rubric item and let the judge reason first.
   - Use a judge from a different model family than the candidate, to reduce self-preference [I].
   - Randomize answer order and control for length.
   - Calibrate against 50–100 coach labels. Target agreement of at least 80% before trusting it at scale.
4. **Blinded pairwise human review** by experienced debaters or coaches on a stratified sample, for the final choice between the top two configurations per task. Never let the LLM judge make the final call on its own.
5. **Latency protocol.**
   - Measure time to first *text* token, which excludes pings and empty thinking blocks.
   - Measure time to last token and output tokens per second.
   - Test cold and warm cache, and read `usage.cache_read_input_tokens` to confirm cache hits [V A17].
   - Test at concurrency 1, 5 and 20, with at least 100 samples per cell. Report p50, p95 and p99.
   - Record 429 and 529 rates and rate-limit headers [V A33], `usage.speed` for fast mode [V A14], and the region (the Vercel default is `iad1` [V V20]).
   - Run at several times of day; the provider-reported latencies in section 5 show wide spreads between p50 and p95.
6. **Cost per completed task**, not cost per request, including retries, fallbacks and cache writes.

---

## 12. Open questions to settle with live tests or the user

1. Does `web_fetch` with dynamic filtering (`_20260209` and later) work on Opus 5.5 and Opus 5? The two docs pages disagree (section 1.9) [U].
2. Does document-level Citations (`char_location`) work through `@ai-sdk/anthropic` via `providerOptions`? It is undocumented [U].
3. Do Citations, `web_fetch`, `search_result` blocks, the fast-mode header and server-side `fallbacks` pass through AI Gateway's Anthropic endpoint [U]?
4. What is the AI Gateway free credit amount, and which models are in the free subset? Does it apply to a Hobby team [U]?
5. Is the organization on Anthropic's fast-mode waitlist? Does `anthropic/claude-opus-5.5-fast` on the gateway work without it [U]?
6. What is the real refusal rate of Opus 5.5 and Fable 5.1 on routine policy-debate evidence (bio, cyber, nuclear) [I, test]?
7. Is there any Google Cloud or Vertex path that permits a minors-facing app (legal review) [U]?
8. Perplexity, which v1 used, was not researched here. v1's key is out of quota and leaked (`PROJECT_RECORD.md` EXT-02).

---

## 13. Sources (all accessed 2026-09-25)

**Anthropic**

- A1 Models overview: https://platform.claude.com/docs/en/about-claude/models/overview
- A2 Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- A3 Claude Opus 5.5 overview: https://platform.claude.com/docs/en/models/opus-5-5/overview
- A4 What's new in Claude Opus 5.5: https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5
- A5 Claude Fable 5.1 overview: https://platform.claude.com/docs/en/models/fable-5-1/overview
- A6 Claude Opus 5 overview: https://platform.claude.com/docs/en/models/opus-5/overview
- A7 Claude Sonnet 5 overview: https://platform.claude.com/docs/en/models/sonnet-5/overview
- A8 Claude Haiku 4.5 overview: https://platform.claude.com/docs/en/models/haiku-4-5/overview
- A9 Legacy model pages: https://platform.claude.com/docs/en/models/{fable-5,opus-4-8,opus-4-7,opus-4-6,sonnet-4-6,opus-4-5,sonnet-4-5}/overview
- A10 Choosing a model: https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
- A11 Model deprecations: https://platform.claude.com/docs/en/about-claude/model-deprecations
- A12 Effort: https://platform.claude.com/docs/en/build-with-claude/effort
- A13 Thinking: https://platform.claude.com/docs/en/build-with-claude/thinking
- A14 Fast mode: https://platform.claude.com/docs/en/build-with-claude/fast-mode
- A15 Service tiers: https://platform.claude.com/docs/en/api/service-tiers
- A16 Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- A17 Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- A18 Streaming: https://platform.claude.com/docs/en/build-with-claude/streaming
- A19 Fine-grained tool streaming: https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
- A20 Batch processing: https://platform.claude.com/docs/en/build-with-claude/batch-processing
- A21 Web search tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- A22 Web fetch tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- A23 Server tools: https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools
- A24 Code execution tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
- A25 Tool reference: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference
- A26 Citations: https://platform.claude.com/docs/en/build-with-claude/citations
- A27 Search results: https://platform.claude.com/docs/en/build-with-claude/search-results
- A28 Files API: https://platform.claude.com/docs/en/build-with-claude/files
- A29 PDF support: https://platform.claude.com/docs/en/build-with-claude/pdf-support
- A30 Refusals and fallback: https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
- A31 API and data retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- A32 Commercial data retention (privacy center): https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- A33 Rate limits: https://platform.claude.com/docs/en/api/rate-limits
- A34 Guidelines for organizations serving minors: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors
- A35 Define success criteria and build evaluations: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
- A36 Reducing latency: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency
- A37 Migrating to Claude Opus 5.5 (prefill and sampling-parameter rules): https://platform.claude.com/docs/en/models/opus-5-5/migration-guide

**OpenAI**

- O1 Models: https://developers.openai.com/api/docs/models
- O2 Pricing: https://developers.openai.com/api/docs/pricing
- O3 Model pages: https://developers.openai.com/api/docs/models/{gpt-6-astra,gpt-6-sol,gpt-6-luna,gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna}
- O4 Changelog: https://developers.openai.com/api/docs/changelog
- O5 Fast mode: https://developers.openai.com/api/docs/guides/fast-mode
- O6 Flex processing: https://developers.openai.com/api/docs/guides/flex-processing
- O7 Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- O8 Web search: https://developers.openai.com/api/docs/guides/tools-web-search
- O9 Your data: https://developers.openai.com/api/docs/guides/your-data
- O10 Rate limits: https://developers.openai.com/api/docs/guides/rate-limits
- O11 Using GPT-6 (latest model guide): https://developers.openai.com/api/docs/guides/latest-model
- O12 Under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- O13 Evaluation best practices: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- O14 Quickstart: https://developers.openai.com/api/docs/quickstart

**Google**

- G1 Models: https://ai.google.dev/gemini-api/docs/models
- G2 Model pages: https://ai.google.dev/gemini-api/docs/models/{gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.1-pro-preview}
- G3 Pricing: https://ai.google.dev/gemini-api/docs/pricing
- G4 Grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search
- G5 URL context: https://ai.google.dev/gemini-api/docs/url-context
- G6 Structured output: https://ai.google.dev/gemini-api/docs/structured-output
- G7 Interactions API: https://ai.google.dev/gemini-api/docs/interactions
- G8 Gemini API Additional Terms of Service: https://ai.google.dev/gemini-api/terms
- G9 Libraries: https://ai.google.dev/gemini-api/docs/libraries
- G10 API keys: https://ai.google.dev/gemini-api/docs/api-key

**Vercel**

- V1 AI SDK, Generating structured data: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data (the `generateObject` reference returns "Page Not Found")
- V2 AI SDK 7 migration guide: https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0
- V3 AI SDK 6 migration guide: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
- V4 `streamText` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- V5 AI SDK Anthropic provider: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- V6 AI SDK AI Gateway provider: https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
- V7 AI SDK OpenAI and Google providers: https://ai-sdk.dev/providers/ai-sdk-providers/openai, https://ai-sdk.dev/providers/ai-sdk-providers/google
- V8 npm registry (`npm view <pkg> version time`): https://www.npmjs.com/package/ai and the other packages listed in section 6
- V9 AI Gateway overview: https://vercel.com/docs/ai-gateway
- V10 AI Gateway pricing: https://vercel.com/docs/ai-gateway/pricing
- V11 AI Gateway FAQ: https://vercel.com/docs/ai-gateway/faq
- V12 AI Gateway getting started: https://vercel.com/docs/ai-gateway/getting-started
- V13 AI Gateway OIDC: https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc
- V14 AI Gateway BYOK: https://vercel.com/docs/ai-gateway/authentication-and-byok/byok
- V15 AI Gateway rate limits: https://vercel.com/docs/ai-gateway/rate-limits
- V16 AI Gateway ZDR: https://vercel.com/docs/ai-gateway/security-and-compliance/zdr
- V17 AI Gateway model fallbacks: https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks
- V18 AI Gateway Anthropic Messages API: https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-messages-api and https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-messages-api/advanced
- V19 AI Gateway catalog API: https://ai-gateway.vercel.sh/v1/models and https://ai-gateway.vercel.sh/v1/models/{id}/endpoints (snapshot about 08:16 UTC)
- V20 Vercel Hobby plan: https://vercel.com/docs/plans/hobby ; Functions limitations: https://vercel.com/docs/functions/limitations

**Other providers**

- X1 Groq supported models: https://console.groq.com/docs/models
- X2 Cerebras model catalog: https://inference-docs.cerebras.ai/models/overview
- X3 DeepSeek models and pricing: https://api-docs.deepseek.com/quick_start/pricing
- X4 DeepSeek privacy policy: https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
- X5 xAI ("SpaceXAI") models and pricing: https://docs.x.ai/docs/models

---

## 14. Update (2026-09-25, later): Gemini 3.8 Flash tested; highlighting benchmark

**Terms re-checked** (ai.google.dev/gemini-api/terms, "Last updated 2026-04-28 UTC"): "You must be 18 years of age or older to use the APIs." and "You also will not use the Services as part of a website, application, or other service … that is directed towards or is likely to be accessed by individuals under the age of 18." Free ("Unpaid") tier: Google "uses the content you submit … to provide, improve, and develop Google products" and "human reviewers may read, annotate, and process your API input and output". A Google forum answer (discuss.google.dev, 2025-05-01) says the age restrictions "apply regardless of how the API is accessed — including via Vertex AI". The builder being an adult does not change this: the clause is about who uses the app. **Decision: Gemini stays out of the product; used only for benchmarks and as a second-family judge.**

**Models the user's Gemini key reaches** (live list): `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash(-lite)`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`, `gemma-4-31b-it`, and others.

**Highlighting benchmark** (`scripts/bench/highlight.ts`, results `docs/evals/results/highlight-bench-run1.json`): 16 real human-highlighted cards from the user's Verbatim files; marks removed; each model re-highlights to the same read length the human chose; every version (human included) scored blind 1–10 by two judges from different families (Claude Opus 5.5, Gemini 3.8 Flash).

| Model | Avg score (both judges) | Paired diff vs Opus 5.5 low | Time | Cost/card |
|---|---|---|---|---|
| Opus 5.5 · medium | 7.55 | +0.19 ± 0.13 (tie) | 9.3 s | $0.029 |
| Gemini 3.8 Flash · medium | 7.42 | +0.05 ± 0.10 (tie) | 23.3 s | $0.030 |
| **Opus 5.5 · low** | **7.36** | — | **7.4 s** | $0.025 |
| Sonnet 5 · thinking off | 7.12 | −0.24 ± 0.16 | 7.5 s | $0.013 |
| Sonnet 5 · low | 7.09 | −0.27 ± 0.15 | 8.6 s | $0.015 |
| Gemini 3.8 Flash · low | 6.60 | −0.76 ± 0.30 (worse) | 2.5 s | $0.003 |
| Haiku 4.5 | 6.10 | −1.27 ± 0.28 (worse) | 6.7 s | $0.006 |
| Human (original college file) | 5.98 | −1.38 ± 0.26 | — | — |

All models land within ±10% of the target length (read-plan alignment). Human highlighting in these college files is deliberately choppy (24 fragments per 100 read words vs 8 for Opus), which the fluency-oriented rubric penalizes. **Decision: highlighting and card cutting stay on Opus 5.5 · low** (ties the best quality, fastest of the top tier). Sonnet 5 (thinking off) is the budget fallback at half the cost.
