# Search, Retrieval, and Source APIs: Research for the v2 Rebuild

Research date: **2026-09-25**. Every source in section 11 was accessed on 2026-09-25.

This document uses the same conventions as `models-and-providers.md`:

- **[V]** verified. Read on an official page or endpoint fetched on 2026-09-25. The source ID follows, for example `[V R2]`.
- **[O]** observed. Seen in a live probe run from the developer's Mac (residential IP, honest bot User-Agent) on 2026-09-25. Section 5 gives the method. These are single runs with a small N. They are evidence, not a benchmark.
- **[U]** unverified. I could not confirm it on an official page. Treat it as a lead, not a fact.
- **[I]** inference or recommendation. This is the researcher's judgment.

**Method.** Where vendors publish raw docs (`llms.txt`, `*.md` pages, OpenAPI YAML), I downloaded them and searched for exact wording. Pricing pages were scraped to text. Keyless public endpoints were called directly with `curl` and Node, using the libraries already in v2's `package.json`.

What was not done:
- No LLM API calls.
- No paid API calls.
- No vendor accounts created.
- The user's existing Anthropic and Perplexity keys were not used.

Nothing in this document requires a secret, and none is included. The repo is public.

---

## 0. Summary

### Verified facts

1. **Perplexity Sonar is being retired, so v1's research path cannot be revived as written.**
   - A notice on Perplexity's pricing and rate-limit pages says Sonar Chat Completions has been folded into the Agent API, with Sonar supported only through September 27, 2026 [V R27, R29]. That is two days after this research.
   - The separate Perplexity **Search API** costs $5 per 1,000 requests, or $1 per 1,000 in "fast" mode [V R27]. It returns ranked results with query-relevant extracted content, sized by `search_context_size` or `max_tokens_per_page` [V R28].
   - Its domain filter holds at most 20 entries [V R31].
2. **Most search APIs return snippets, not source text.** The table in section 2.1 separates the two groups.
   - **Can return full page text:** Exa (search contents, `/contents`), Tavily (`include_raw_content`, `/extract`), Parallel (`/extract` with `full_content`), You.com (`full_page`, `/contents`), Linkup (`/fetch`), Kagi (Extract), Jina Reader, Firecrawl, Diffbot, and Anthropic `web_fetch`.
   - **Snippets or answers only:** Anthropic `web_search` (encrypted), OpenAI web search, Gemini grounding, Brave (snippets and LLM Context chunks), Serper, and SerpApi.
3. **Anthropic `web_fetch` returns the full document in the API response, so it can be stored** [V R1].
   - HTML or text arrives as a text document. PDFs arrive as the raw PDF (base64).
   - It costs nothing beyond tokens [V R1, R4]. It honors robots.txt and does not render JavaScript. It can fetch only URLs already present in the conversation [V R1, R7].
   - `web_search` costs $10 per 1,000 searches [V R2, R4]. It returns only `url`, `title`, `page_age` and encrypted content, plus citations of up to 150 characters [V R2].
4. **Storage rights constrain the architecture.**
   - **Parallel:** Customer Terms §2(b) keep each query's output for a single End Customer. It may not be copied, cached, stored or shared with other End Customers, and §2(c) bars using outputs to build databases [V R37]. v1 shares cards across all users, so this conflicts.
   - **Brave:** storing results requires a plan that explicitly grants storage rights [V R24].
   - **Exa:** ToS §4.2(a) bars copying, reproducing or publishing information obtained through the Services, unless the Terms or Exa in writing expressly permit it [V R15].
   - **Google grounding:** the terms forbid caching or storing grounded results. They also forbid using the returned links to find pages to crawl or scrape [V R52].
   - **Tavily:** its terms (last updated May 4, 2026) place no explicit restriction on storing Output that I found. They do let Tavily retain and train on inputs and AI outputs [V R22].
5. **An honest fetcher is blocked by many of the best debate sources.** With a truthful bot User-Agent, the following returned HTTP 403 [O]:
   - cbo.gov (pages, PDFs, and even robots.txt), www.gao.gov, and rand.org (pages and PDFs).
   - congress.gov HTML, SSRN, tandfonline.com, direct.mit.edu, cbpp.org, amacad.org, and nytimes.com.

   congress.gov's robots.txt separately disallows `/` for `anthropic-ai`, `Claude-User`, `ClaudeBot`, `ChatGPT-User`, `GPTBot`, `PerplexityBot`, `Perplexity-User`, `TavilyBot`, `FirecrawlAgent` and others [O R76].
6. **Official APIs close much of the government gap.**
   - **Congress.gov API:** has a CRS reports endpoint, with 14,143 reports on 2026-09-25. Each report lists authors, a publish date, and PDF and HTML URLs [O R71]. The PDF URL downloaded fine (HTTP 200, 22 pages); the HTML URL returned 403 [O].
   - **Federal Register API:** needs no key. Its `raw_text_url` returns the full text with page markers such as `[Pages 29459-29460]` [O].
   - **GovInfo, GAO RSS and CBO RSS:** all responded [O].
7. **Scholarly metadata is cheap, but no longer entirely free of limits.**
   - **OpenAlex** gives $0.10/day of usage without a key and $1/day with a free key. Search costs $1 per 1,000 calls. Cached open-access PDFs cost $10 per 1,000 downloads [V R60–R62].
   - **Crossref's** polite pool allows 10 requests per second with 3 concurrent [V R65].
   - **Semantic Scholar** without a key returned 429 on the first call [O].
   - **Unpaywall** now runs on OpenAlex's database [V R63]. It rejected a placeholder email [O].
8. **Smoke test: 4 queries, 32 URLs taken from Tavily keyless results** [O, section 5]:

   | Retrieval path | URLs with ≥1,500 chars of main text |
   |---|---|
   | Our honest direct fetcher | 16 of 32 |
   | Tavily's `raw_content` | 22 of 32 |
   | Either path | 23 of 32 |
   | Neither path | 9 of 32 |

   The 9 failures include **all 4 cbo.gov URLs** and two paywalled or bot-protected journal articles.

### Recommendations [I]

9. **Staged pipeline.** Section 6 gives the details.
   - **Discover:** 1–2 web search APIs picked by benchmark, plus OpenAlex/Crossref, plus Congress.gov, GovInfo, the Federal Register and RSS feeds.
   - **Retrieve:**
     1. Official or open-access route first.
     2. Then our own honest fetcher: robots check, Readability, and `unpdf` per page. Raw bytes are hashed and stored privately.
     3. Then vendor extraction, only where the vendor's terms allow storage.
     4. Then user upload.
   - **Evaluate:** credibility, qualifications, relevance.
   - **Cut:** select spans by offset over the stored text. `src/domain/verify.ts` verifies them. Citations run as a separate claim-support check.
   - **Synthesize:** only from verified card IDs.
10. **Benchmark shortlist.**
    - **Discovery:** Exa, Tavily, Parallel, Brave, You.com, Linkup and Anthropic `web_search`. Add Perplexity Search only if the account is funded.
    - **Retrieval fallback:** Tavily extract, Anthropic `web_fetch`, Exa contents, Parallel extract, Linkup fetch, Firecrawl and Jina Reader.
    - **Exclude:**
      - Gemini grounding, because of its terms. See also the minors restriction in `models-and-providers.md` §3.3.
      - Serper and SerpApi, because they return Google SERP scrapes: snippets only, with legal risk (R49).
11. **Free to test today with no account:**
    - Tavily keyless; Parallel's anonymous Search MCP; Jina Reader (`r.jina.ai`).
    - OpenAlex (keyless budget), Crossref, arXiv, the Federal Register API, and Congress.gov and GovInfo (with `DEMO_KEY`).
    - CORE (metadata only), NCBI E-utilities, the ORCID public API, and GAO and CBO RSS [O].

    Section 7.7 lists which services need keys.

---

## 1. What changed since v1 was built

| Date | Change | Source |
|---|---|---|
| 2025-07-01 | Cloudflare began **blocking AI crawlers by default** for its customers and launched "pay per crawl" (private beta). | [V R74] |
| 2025 | JSTOR's Constellate text-mining platform was sunset (retrospective posted 2025-07-31). JSTOR offers text-analysis support by request instead. | [V R70] |
| 2025-12-19 | Google sued SerpApi, alleging circumvention of Google's anti-scraping protections. | [V R49] |
| 2026 (season topic) | The 2026–27 policy resolution calls for the US federal government to establish national health insurance in the United States. A third-party summary dates the NFHS announcement to 2026-01-10 [U]. | [V R75] |
| 2026-02-12 | Brave launched an **LLM Context** endpoint: extracted chunks, $5 per 1,000 requests on the Search plan. | [V R25] |
| 2026-04-01 | Exa retired `/research`, replacing it with `/search` `type: "deep-reasoning"`. `startCrawlDate` and `endCrawlDate` are now ignored. | [V R13] |
| 2026-06-16 | Exa launched the Exa Agent API. | [V R13] |
| 2026-07-23 | Exa replaced the `research paper` category with **`publication`** (a 350M-publication index). The `pdf`, `github` and `tweet` categories are deprecated. | [V R13] |
| 2026 (current docs) | Anthropic `web_fetch_20260318` and `web_search_20260318` add `response_inclusion`. `web_fetch_20260309` adds `use_cache`. | [V R1, R2] |
| 2026 (current docs) | OpenAlex moved to usage-based pricing: $1/day free with a key, $0.10/day without. | [V R61] |
| 2026 (current docs) | Tavily added **keyless** access to `/search` and `/extract`. | [V R19] |
| 2026-09-27 | Last day of Perplexity Sonar support. | [V R27] |

---

## 2. Search and discovery APIs

### 2.1 Capabilities and price

"Full text" means the response itself contains the whole main text of the page, not an excerpt.

| Service | List price | Free tier | Full text in response? | PDFs | Domain filter | Date filter | Rate limit | Latency |
|---|---|---|---|---|---|---|---|---|
| **Exa** `/search` + `/contents` | Search $7/1k requests, including up to 10 results *with contents at no extra charge*. $1/1k extra results. Deep modes $12–15/1k. `/contents` $1/1k pages per content type. [V R8, R10] | $10 credit, reset monthly, no card; plus a one-time $10 onboarding bonus [V R11] | **Yes.** `text` returns the cleaned page body (`maxCharacters` up to 1,000,000); highlights and summaries are optional [V R9, R10] | Yes. The docs say Contents handles JS-rendered pages and PDFs [V R10] | `includeDomains`/`excludeDomains`, up to 1,200 entries each; hostname, path prefix or `*.sub` [V R9] | `startPublishedDate`/`endPublishedDate` [V R9] | `/search` 10 QPS; deep modes 5 QPS; `/contents` 100 QPS [V R11] | instant ~250 ms, fast ~450 ms, auto ~1 s, deep 4–15 s, deep-reasoning 12–40 s [V R16, R8] |
| **Tavily** | Search 1 credit (`basic`/`fast`/`ultra-fast`) or 2 (`advanced`). Extract 1 credit per 5 URLs (2 advanced). Pay-as-you-go $0.008/credit. Plans $30/4k to $500/100k credits. [V R17] | 1,000 credits/month, no card. **Keyless** `/search` and `/extract` (rate-limited) [V R17, R19] | **Yes.** `include_raw_content` returns the parsed page (markdown or text); `/extract` takes 1–20 URLs [V R20, R21] | Undocumented [U]. A RAND PDF came back as 201,714 chars [O] | `include_domains` ≤300, `exclude_domains` ≤150 [V R20] | `time_range`, `start_date`/`end_date`; `topic: news` [V R20] | Dev 100 RPM, prod 1,000 RPM; research 20 RPM [V R18] | 1.1–2.1 s wall-clock, keyless basic, N=7 [O] |
| **Brave** Search API | $5/1k requests. Answers $4/1k + $5/M tokens [V R24] | $5 credit every month [V R24] | **No.** Snippets plus up to 5 `extra_snippets`. LLM Context returns ranked, pre-extracted chunks [V R25, R26] | n/a (index returns snippets) | Goggles (custom rerank/filter) [V R24, R26]; `site:` operator [U] | `freshness` pd/pw/pm/py or a date range [V R26] | Search 50 QPS; Answers 2 QPS [V R24] | LLM Context under 500 ms at p90 (vendor claim) [V R25] |
| **Perplexity Search API** | $5/1k; fast $1/1k [V R27] | None found [U] | **Partial.** Query-relevant extracted content per page; `max_tokens` up to 1,000,000 total [V R28] | PDFs appear in results [V R28]; extraction quality untested | `search_domain_filter` ≤20, allow **or** deny [V R31] | `search_after_date_filter`, `search_before_date_filter`, `last_updated_*`, `search_recency_filter` [V R32] | 50 query units/s [V R29] | not stated |
| **Perplexity Agent API** (Sonar successor) | Model tokens + `web_search` $0.0025/call ($0.001 fast) + `fetch_url` $0.0005/call [V R27] | none found [U] | `fetch_url` returns extracted content, best-effort [V R30] | The docs warn PDFs may return limited or unrelated content [V R30] | via tools [U] | via tools [U] | Tier 0: 1 QPS … Tier 5: 33 QPS [V R29] | not stated |
| **Parallel** Search / Extract | Search $1/1k (`turbo`/`fast`) or $5/1k (`basic`/`advanced`), 10 results included. Extract $1/1k URLs [V R34] | Up to 5,000 free requests per month; up to $80 of signup credit plus $5 of free credit monthly. Anonymous **Search MCP** is free [V R34, R38] | Search: excerpts. **Extract `full_content`: yes** (markdown) [V R38] | Yes. The docs say Extract handles JS-heavy pages and PDFs [V R38] | `source_policy` include/exclude: domain, path prefix or TLD such as `.gov`; ≤200 entries total [V R36] | `after_date` (Search) [V R36] | 600/min each for Search and Extract [V R35] | turbo ~200 ms, fast ~700 ms, basic ~1 s, advanced ~3 s; Extract 1–20 s [V R34] |
| **You.com** | Search $5/1k calls (up to 100 results). Live full-page crawl $1/1k pages (cached pages free). Contents $1/1k pages. Research $12–1,200/1k [V R39] | $100 credit, no card [V R39]. Free MCP profile, 100 queries/day [V R41] | **Yes.** `extraction_mode: "full_page"` returns markdown/HTML; `/contents` [V R41] | Undocumented [U] | `include_domains`, `exclude_domains`, `boost_domains` [V R41] | `freshness` [V R41] | 10 rps per endpoint [V R40] | Research tiers: lite <10 s, standard ~10–30 s [V R39] |
| **Linkup** | Search $0.005 (flash/fast/standard) or $0.05 (deep). Fetch $0.001–0.011 [V R42] | $20 credit, topped up monthly (requires a professional email) [V R42] | Search: results/snippets. **Fetch: full markdown** [V R44] | Yes: HTML and PDF, PDFs up to 100 MB [V R44] | `includeDomains`/`excludeDomains` [V R44] | `fromDate`/`toDate` [V R44] | 10 QPS per organization [V R43] | flash: a few hundred ms; fast: about 1 s (vendor docs) [V R44] |
| **Kagi** | Search $12/1k. Extract $4/1k pages [V R45] | none [U] | The pricing page says search extra snippets carry the full, cleaned page content; Extract returns markdown [V R45] | [U] | lenses, domain ranking, custom URL rules [V R45] | [U] | [U] | [U] |
| **Jina** `s.jina.ai` | Token-metered, ≥10,000 tokens per request [V R46]. Token price not captured [U] | 10M tokens with a new key [V R46] | Returns search results as LLM-ready text [V R46] | Reader handles PDFs [V R46] | [U] | [U] | 100 RPM (free/paid), 1,000 premium [V R46] | 2.5 s average (vendor figure) [V R46]. **Needs a key:** 401 without one [O] |
| **Serper** (Google SERP) | $50/50k ($1.00/1k) down to $3,750/12.5M ($0.30/1k); credits valid 6 months [V R47] | 2,500 queries [V R47] | No (SERP snippets) | n/a | Google operators [U] | [U] | 50–300 QPS by pack [V R47] | 1–2 s (vendor claim) [V R47] |
| **SerpApi** (Google, Scholar) | $25/mo for 1k searches up to $2,750/mo for 500k [V R48] | 250 searches/month [V R48] | No | n/a | operators | Scholar year filters [U] | 50–100,000 per hour by plan [V R48] | [U] |
| **Anthropic `web_search`** | $10/1k searches + tokens [V R2, R4] | small new-account credit [V R4] | **No.** `encrypted_content` only; `cited_text` ≤150 chars [V R2] | n/a | `allowed_domains` or `blocked_domains` (not both); subdomains included; paths allowed; no wildcard domains [V R3] | **none** | org-level web search limit shown in the Console [V R2] | not stated |
| **Anthropic `web_fetch`** | tokens only. Examples: 10 kB page ≈2.5k tokens; 500 kB PDF ≈125k tokens [V R1, R4] | same as above | **Yes.** `document.source.data` holds the full text [V R1] | **Yes, the raw PDF as base64** [V R1] | `allowed_domains`/`blocked_domains`, matched on the domain only [V R3] | n/a | [U] | not stated |
| **OpenAI** web search | $10/1k calls + content tokens at model rates. Non-reasoning preview: $25/1k [V R50] | none [U] | No: answer text with `url_citation` annotations and a `sources` list [V R50] | n/a | `filters.allowed_domains` ≤100 [V R50] | none documented [V R50] | model's tier limits [V R50] | not stated |
| **Gemini** grounding / URL context | Gemini 3.x: 5,000 free/month, then $14/1k. Gemini 2.5: 1,500 RPD free, then $35/1k. URL context billed as tokens [V R51] | as listed | No: answer + citations. URL context returns metadata, not text [V R51] | URL context reads PDFs (≤34 MB, ≤20 URLs) [V R51] | [U] | [U] | [U] | [U] |

### 2.2 Terms, retention, and crawler behavior

| Service | Can we **store** what it returns? | Data retention and ZDR | Crawler behavior (robots, paywalls, CAPTCHAs) |
|---|---|---|---|
| Exa | **Restricted unless permitted.** ToS §4.2(a) bars downloading, copying, reproducing or publishing information obtained through the Services. The exceptions are temporary browser caching and uses the Terms or Exa in writing expressly permit. The ToS PDF is dated 2025-03-04 and was still linked from exa.ai on 2026-09-25 [V R15]. **Get written permission before persisting Exa text** [I]. | ZDR on Enterprise only, for Search, Contents and Agent [V R12]. ToS §1.2(c) grants Exa a license to User Input and Output [V R15]. | Exa's crawler (`ExaSearchBot`) follows robots.txt and does not try to get past logins, paywalls or CAPTCHAs [V R14] |
| Tavily | No explicit restriction on storing Output found. The terms define "Services" to exclude Output and allow integration into customer applications [V R22]. **Confirm in writing** [I]. | §6.5 lets Tavily and its AI providers retain and use Customer Input and AI-generated Outputs to train and improve models [V R22]. The FAQ advertises zero data retention [V R23]; which plans get it is unverified [U]. | Tavily's crawl best-practices doc tells users to respect robots.txt [V R23]. Extract's own robots behavior is undocumented [U]. |
| Brave | **No** by default. Storing results requires a plan that explicitly grants storage rights. The FAQ also says the API grants no rights in third-party page content [V R24]. | Enterprise plan offers full-funnel ZDR [V R24] | n/a (own index) |
| Perplexity | Terms page returned 403 to automated fetch [U] | The privacy page states a zero-data-retention policy for the Chat Completions API [V R33]. The Search API is not covered by that statement [U]. | `fetch_url` does not bypass access controls and reports robots-policy blocks as failures [V R30] |
| Parallel | **Restricted.** Customer Terms §2(b) (effective 2026-08-11) keep each query's output primarily for one End Customer; it may not be copied, cached, stored or shared with other End Customers or third parties. §2(c)(vi) bars using outputs to build databases [V R37]. | §4(b) lets Parallel use Customer IP to train its models [V R37]. ZDR via a separate Google Cloud Marketplace offering [V R38]. | [U] |
| You.com | [U] | [U] | [U] |
| Linkup | [U] | [U] | [U] |
| Jina (Elastic) | [U] | [U] | robots.txt checking is **opt-in** via the `X-Robots-Txt` header [V R46]. Keyless Reader returned a Cloudflare challenge page as content with HTTP 200 [O]. |
| Firecrawl | [U] | ZDR option, +1 credit/page [V R53] | Respects robots.txt (matching `FirecrawlAgent` and `*`); `ignoreRobotsTxt` is Enterprise-only [V R53] |
| Anthropic `web_search`/`web_fetch` | The fetched text is returned in *your* API response [V R1]. Publisher copyright still applies [I]. | Basic `_20250305`/`_20250910` are ZDR-eligible. Dynamic-filtering versions are not, unless `allowed_callers: ["direct"]` [V R3, R5]. | User-directed fetches use the `Claude-User` agent. Anthropic's bots honor robots.txt and do not try to get past CAPTCHAs [V R7]. Error `url_not_allowed` covers robots.txt blocks [V R1]. |
| Gemini grounding | **No.** No caching or storing grounded results, except narrow cases such as chat history for up to 2 years. The returned links may not be used to find pages to crawl or scrape [V R52]. | Google stores prompts and outputs for grounding [V R52] | n/a |
| Serper / SerpApi | Google SERP data. Google alleges SerpApi circumvents SearchGuard [V R49]. Scholar's robots.txt disallows `/scholar` for all agents [O R77]. | [U] | Scrapes Google [V R48] |

### 2.3 Notes that did not fit in the tables

- **Exa** [V R9, R10, R13, R16]
  - Use `category: "publication"` for scholarly queries; it returns structured metadata (authors, venue, citation counts).
  - Use `maxAgeHours: 0` to force a live fetch. `livecrawl` is deprecated.
  - Results carry `publishedDate` and `author`, and each response carries `costDollars`, which makes cost accounting easy in a benchmark.
- **Tavily** [V R19, R20]
  - Keyless and keyed responses have the same schema, so the benchmark can start keyless and switch to a key with no code change.
  - `include_published_date` is in beta.
  - The keyless results for the AI/nuclear query included facebook.com, youtube.com and reddit.com in the top 8 [O]. The pipeline needs domain filters and credibility scoring.
- **Parallel** [V R36, R38; O]
  - The anonymous Search MCP (`https://search.parallel.ai/mcp`) exposes `web_search` and `web_fetch`, answered in 0.73 s, and forces `fast` mode.
  - For the CBO query it returned mostly cbo.gov index pages (homepage, cost-estimates list) rather than specific reports.
  - The `.gov` TLD filter is directly useful for government-only subqueries.
- **Brave** [V R24]. Goggles can encode a credibility allowlist or boost list as a reranking rule. It has an independent index, so it adds diversity next to Exa and Tavily.
- **Anthropic** [V R1, R2, R3]
  - `web_search` results cannot be read by our code (they are encrypted), so it can serve only as discovery for `web_fetch`.
  - `web_fetch` requires the URL to already be in the conversation, caps URLs at 250 characters, caches results (`use_cache: false` on `_20260309`+), and applies `max_content_tokens` to text only, not PDFs.
  - For storing complete text, use the **basic** `web_fetch_20250910`, or set `allowed_callers: ["direct"]`. The raw result block then lands in the response, and the call is ZDR-eligible [V R3].
  - Dynamic filtering filters content inside code execution. Its `response_inclusion` note says echoed raw content increases **output** token cost [V R1]. **Avoid dynamic filtering for bulk capture** [I].

---

## 3. Content extraction and fetching

### 3.1 Hosted extractors

| Service | Price | Free | JS rendering | PDFs | Notes |
|---|---|---|---|---|---|
| **Firecrawl** | Hobby $19/mo ($16 annual), 5k credits. Standard $83/mo annual, 100k. Growth $333/mo annual, 500k. Scale $599/mo annual, 1M [V R53] | 1,000 credits/month, 2 concurrent [V R53] | yes | +1 credit per PDF page [V R53] | 1 credit/page. JSON/"highlights" formats +4/page. ZDR +1/page. "Enhanced proxy" +0 [V R53]. Respects robots [V R53]. |
| **Jina Reader** `r.jina.ai` | Output tokens [V R46] | Keyless 20 RPM. Free key 500 RPM and 10M tokens [V R46] | yes, headless by default [V R46] | yes [V R46] | 7.9 s average (vendor figure). Took 5.0 s and 11.8 s in two probes [O]. Detect challenge pages that come back with HTTP 200 [O]. |
| **Diffbot** Article API | Startup $299/mo, 250k credits, 5 rps. Plus $899/mo, 1M credits, 25 rps [V R54] | 10,000 credits/month, 5 requests/min [V R54] | yes [U] | Upload HTML or PDF [V R54] | Returns `title`, `text`, `html`, `date`, `estimatedDate`, `author`, `authorUrl`, `siteName` [V R54]. Useful for byline and date extraction. |
| **Browserbase** | Developer $20/mo, 100 browser-hours then $0.12/h, 25 concurrent. Startup $99/mo [V R55] | 1 browser-hour, 3 concurrent [V R55] | yes (real browser) | via browser | Advertises CAPTCHA solving and stealth. **Do not enable them** (section 3.4) [I]. Data retention 7–30 days [V R55]. |
| **Browserless** | Prototyping $25/mo (annual), 20k units. Starter $140/mo, 180k. Scale $350/mo, 500k [V R56] | 1,000 units/month, 2 concurrent. A unit is up to 30 s of browser time [V R56] | yes | via browser | CAPTCHA solving costs 10 units/solve. **Do not use** [I]. |
| **Exa `/contents`**, **Tavily `/extract`**, **Parallel `/extract`**, **You.com `/contents`**, **Linkup `/fetch`**, **Kagi Extract**, **Perplexity `fetch_url`**, **Anthropic `web_fetch`** | see section 2.1 | see section 2.1 | Exa, Parallel, You.com: yes. Linkup: `renderJs`. Anthropic: **no** [V R1] | see section 2.1 | Storage terms in section 2.2 decide which of these may be the *canonical* stored copy. |

### 3.2 Self-hosted Node stack (already in v2's `package.json`)

- **HTML:** `fetch` → `linkedom` `parseHTML` → `@mozilla/readability` 0.6.0 (Apache-2.0).
  - Readability's README uses jsdom for Node and strongly recommends a sanitizer such as DOMPurify for untrusted HTML [V R57].
  - In the probe, `linkedom` plus Readability produced text, bylines and titles for every 200-status HTML page except three JS-only apps (YouTube, Reddit, Facebook) [O].
  - jsdom 30.1.1 (MIT) is the documented alternative [V R59].
- **Metadata:** read `citation_*` (Highwire) meta tags, JSON-LD (`<script type="application/ld+json">`), OpenGraph, and `author` meta.
  - Readability's `byline` sometimes returns the organization instead of the author. On toda.org, `byline` was "Toda Peace Institute" while `citation_author` was "John Carlson" [O].
  - Keep per-field provenance, as `src/domain/citation.ts` already does.
- **PDF:** `unpdf` 1.8.1, the serverless pdf.js build [V R58].
  - `extractText(pdf, { mergePages: false })` gives per-page text for page citations [V R58].
  - `getDocumentProxy()` exposes pdf.js, including `getPageLabels()` [V R58]. The CEEW PDF's labels begin `i, ii, iii, iv, v`, so **PDF page index ≠ printed page number** [O]. The SIPRI PDF had no labels [O].
  - `pdf-parse` 2.4.5 (v1's dependency) is also current [V R59].
- **robots.txt:** use a spec-compliant parser. `robots-parser` 3.0.1 (MIT) describes itself as spec-compliant with wildcard matching [V R59].
  - My quick prefix-matching check wrongly flagged 7 of 32 URLs as disallowed, because it read wildcard rules such as `Disallow: /*.jsx$` as blocking everything [O].
- **OCR** (scanned PDFs only): `tesseract.js` 7.0.0 [V R59], or Claude's PDF vision.
  - Anthropic Citations cannot cite scanned PDFs that have no extractable text [V R6].
  - Mark OCR text as "OCR, verify against page image" [I].
- **Serverless fit** [I]:
  - Headless Chromium is too heavy for Vercel Functions, so use a hosted browser only if the benchmark shows real need.
  - Run retrieval as background jobs so page downloads and PDF parsing don't hit request timeouts.
  - Vercel egress IPs are datacenter IPs and may be blocked more often than the residential IP used here. **Re-run the retrieval benchmark from the deployed region.**

### 3.3 Failure modes seen or documented

| Failure mode | Evidence | Mitigation [I] |
|---|---|---|
| WAF/CDN 403 for honest bots | cbo.gov (HTML, PDF, robots.txt), www.gao.gov (pages and `/assets/*.pdf`), rand.org (HTML and PDF), congress.gov HTML, SSRN, tandfonline.com, direct.mit.edu, cbpp.org, amacad.org, jhu.edu (SAIS), nytimes.com; reuters.com returned 401 [O] | Official API or RSS where one exists (section 4.2). Vendor fetch where terms allow. Otherwise ask the user to upload. **Never spoof a browser UA**; v1's `scraper.ts` sent a Chrome UA string. |
| Challenge page returned with **HTTP 200** | Jina Reader on congress.gov returned Cloudflare's security-verification interstitial as the page content [O] | Look for challenge text, title and length even on 200. Never store a challenge page as a source. |
| robots.txt disallows AI agents by name | congress.gov blocks Claude-User, ChatGPT-User, Perplexity-User, TavilyBot and FirecrawlAgent [O R76]. nytimes.com blocks Claude-User and ClaudeBot; wsj.com blocks `*` on article paths; theatlantic.com blocks Claude-User; springer and jstor block ClaudeBot [O, Python robotparser check] | Choose the vendor per domain, and honor the rules. For congress.gov, use the Congress.gov API: its PDF URLs downloaded fine [O]. |
| JS-only pages | YouTube, Reddit and Facebook returned 0 chars of main text [O] | Low-credibility sources anyway. Send JS-heavy *credible* sites to Linkup `renderJs`, Firecrawl or Exa. |
| Paywalls | MIT Press *International Security* and Taylor & Francis articles failed on both paths [O] | Use the OpenAlex/Unpaywall open-access copy and **record its version** (`submittedVersion`/`acceptedVersion`/`publishedVersion` [O]). Otherwise cut from the abstract only, labeled as such, or ask the user to upload. |
| Two-column PDFs | The CRS summary page puts author names and titles in a right-hand column next to the summary text [O] | Use layout-aware extraction per page and review the column order. Author titles in that column are useful as qualification evidence. |
| Footnote markers glued to words | Tavily's text of the RAND PDF runs footnote digits directly onto the preceding word and period [O] | The normalizer should allow a digit before whitespace at sentence ends. Show the original. |
| Vendor coverage gaps | Tavily `raw_content` was empty for all 4 cbo.gov URLs and for jhu.edu, MIT Press, T&F and a china-mission.gov.cn page (our fetcher got 8.4k chars from the last) [O] | Use more than one retrieval path. Measure coverage per domain in the benchmark. |
| Keyless shared pools throttled | Semantic Scholar returned 429 on the first request [O] | Get keys and back off. |
| Placeholder emails rejected | Unpaywall returned 422, asking callers to use their own email address [O] | Use a real contact email (env var). |

### 3.4 Policy: paywalls, robots, bot protection [I]

- **Honor robots.txt**, including crawl-delay; congress.gov asks for `Crawl-delay: 2` [O]. Identify honestly: `CardCutterBot/1.0 (+https://<site>/bot; <contact email>)`.
- **Never bypass** paywalls, logins, CAPTCHAs or bot challenges. That rules out CAPTCHA-solving or stealth browser features, rotating residential proxies to evade blocks, and UA spoofing. Anthropic, Exa and Perplexity document the same stance [V R7, R14, R30].
- When a publisher blocks automated access:
  1. Use an official or open-access route.
  2. Or use a vendor whose own crawler is permitted, if its terms allow our use.
  3. Or ask the user to upload the document they can lawfully access, and record `provenance: user_upload`.

---

## 4. Scholarly and government sources

### 4.1 Scholarly metadata and legal full text

| Source | What you get | Qualification signals | Full text (legal path) | Keys and limits |
|---|---|---|---|---|
| **OpenAlex** | Works, authors, sources, institutions; DOI; dates; venue; `open_access` and `best_oa_location` (`pdf_url`, `version`, `license`); `cited_by_count`. Metadata is CC0 [V R61] | `authorships[].institutions`, `raw_affiliation_strings`, ORCID [O] | Cached copies of **50M+ open-access PDFs plus TEI XML** via `content.openalex.org/works/{id}.pdf` (metered at $10/1k) [V R64] | Keyless $0.10/day. Free key $1/day. Singleton lookups free. List/filter $0.10/1k. Search $1/1k. Max 100 requests/s [V R60, R62]. Response headers report the remaining USD budget [O]. |
| **Crossref** | DOI metadata: title, authors (with ORCID/ROR when deposited), container, dates, pages, license, links, some abstracts [V R65] | Affiliations when deposited. RAND registers DOIs under prefix 10.7249 [O] | TDM links only where publishers deposit them [U] | No key. Public 5 rps/1 concurrent. **Polite (mailto) 10 rps/3 concurrent.** Plus 150 rps [V R65]. Observed polite headers: `x-rate-limit-limit: 3`, interval 1s [O]. |
| **Semantic Scholar** | Papers, authors, citations, `openAccessPdf`, recommendations, datasets [V R66] | Author affiliations (sparse) [U] | Only through OA PDF links | Keyless: a shared pool of 1,000 requests/s across all unauthenticated users [V R66], but it **returned 429 at once** [O]. With a key: an introductory 1 RPS [V R66]. Request via the form. |
| **Unpaywall** | DOI → best open-access location, license, version. OpenAlex says these fields hold the same values as its own OA fields [V R63] | none | OA copies. Record the version: the probe DOI's best location was a `submittedVersion` in a repository [O] | `email` parameter required, and must be real [O]. Daily limit [U]. |
| **CORE** | Repository papers, including full text [V R67] | Author names | `fullText` for registered users only; unauthenticated users get no full text [V R67] | Keyless: 100 tokens/day, 10/min. Registered personal: 1,000/day, 25/min. Academic: 5,000/day [V R67] |
| **arXiv** | Preprints [V R68] | none | PDFs, but the API terms forbid storing and serving arXiv e-prints from your own servers unless the license or rights holder allows it [V R68] | 1 request per 3 s, single connection [V R68] |
| **PubMed/PMC** | Biomedical metadata; PMC Open Access Subset [V R69] | Affiliations in records | OA subset only, via the Cloud Service, OAI-PMH, E-utilities or BioC API. Bulk retrieval by any other automated means is prohibited [V R69] | E-utilities: `x-ratelimit-limit: 3` without a key [O]. With a key: 10 rps [U]. The NCBI docs page sat behind reCAPTCHA. |
| **SSRN** | Working papers | Author pages | None automated. Direct fetch returned 403 [O]. robots.txt disallows GPTBot and ChatGPT-User and sets crawl-delay 5 for `*` [O] | No public API found [U]. Elsevier APIs may cover SSRN for non-commercial use [U]. |
| **JSTOR** | n/a | n/a | No public search API. Constellate sunset in 2025; text-analysis datasets by request [V R70] | n/a |
| **Google Scholar** | n/a | n/a | No official API [U: an absence cannot be proven]. robots.txt disallows `/scholar` for all agents [O R77]. SerpApi sells a Scholar scraping API [V R48]; see the legal risk in R49. | Not recommended [I]. |
| **ORCID** | Employment and education records | **Yes**: public employment records, e.g. a university employer for the ORCID test record [O] | n/a | Anonymous public API read returned 200 [O]. Commercial-use terms [U]. |

### 4.2 Government sources

| Source | Discovery | Full text | Keys and limits | Observed 2026-09-25 |
|---|---|---|---|---|
| **Congress.gov API: CRS reports** | `/v3/crsreport` (list, newest first); `/v3/crsreport/{id}` has `authors`, `publishDate`, `formats` (PDF and HTML URLs), related bills and laws | The PDF URL works for bots. The HTML URL returns 403 | api.data.gov key via `https://api.congress.gov/sign-up/`; **5,000 requests/hour** [V R71] | `DEMO_KEY` works (`x-ratelimit-limit: 10`); 14,143 reports; PDF R48859 was 22 pages and text-based. Its summary page lists each author's CRS job title (e.g., a regional-affairs specialist), which is ready-made qualification evidence [O] |
| **GovInfo API** | Collections include CHRG (hearings), CRPT (committee reports), CPRT (committee prints), CMR (congressionally mandated reports), BUDGET, ERP, FR, CFR, USCOURTS, GAOREPORTS | `pdfLink`, `txtLink`, `xmlLink`, `modsLink` per package [V R72] | api.data.gov key; **36,000/hour, 1,200/min, 40/s** [V R72] | `DEMO_KEY` works. GAOREPORTS has 16,569 packages; sampled items were dated 1994–2000, so treat it as **historical** [O] |
| **Federal Register API** | `/api/v1/documents.json` with search terms and field selection | `raw_text_url` returns the full text with FR page markers | **No key** | 987 hits for "critical minerals supply chain"; raw text included `[Pages 29459-29460]` [O] |
| **GAO** | RSS `https://www.gao.gov/rss/reports.xml` (25 items) | `www.gao.gov/products/*` and `/assets/*.pdf` returned 403 (Akamai). **`files.gao.gov/reports/GAO-26-108446/index.html` returned 200 (157 KB HTML)** [O] | No official API found [U] | The files.gao.gov pattern is undocumented and must be re-checked [U] |
| **CBO** | RSS `https://www.cbo.gov/publications/all/rss.xml` (30 items) and `sitemap.xml` both returned 200 | Publication pages and PDFs returned 403 [O] | No API found [U]. `github.com/US-CBO` exists [O] | CBO content needs a vendor fetch (to be measured) or user upload. It is a high-priority gap because debaters rely on CBO [I]. |
| **api.data.gov** (shared key) | n/a | n/a | Default key: **1,000 requests/hour**. `DEMO_KEY`: 30/hour and 50/day per IP [V R73]. Congress.gov and GovInfo publish their own higher limits (above). | n/a |

### 4.3 Where author qualifications come from [I]

Card citations need "qualifications." v1 let the model write them freely. v2 should fill them only from evidence, and record the provenance (`src/domain/citation.ts` already has `qualificationsProvenance` and `qualificationsEvidence`).

Sources, in order of preference:

1. **The document itself.** Examples: the CRS summary page's author titles [O], a think-tank author box or "About the authors" section, a journal's author note.
2. **Bibliographic metadata.** OpenAlex authorships and institutions [O], Crossref affiliations and ORCID, the ORCID employment API [O].
3. **The publisher's author page.** Fetch it the same way as any other source.
4. **The user.**

A model may *summarize* found evidence into a short credential. It must attach the evidence URL and span. Anything else shows as `ai_unverified`.

---

## 5. Live probes (2026-09-25)

### 5.1 Method

- **Machine and identity:** developer Mac, residential network. User-Agent `DebateCardCutter-research-probe/0.1` with a repo URL. No cookies. No JavaScript, except when calling vendors.
- **Discovery:** Tavily **keyless** `basic` search with `include_raw_content: "text"` and `max_results: 8`. It ran the four example queries from the brief:
  - "evidence that US-China military AI arms race increases risk of nuclear escalation"
  - "CBO estimate of cost of expanding Social Security"
  - "answers to 'China will cheat on arms control' from arms-control experts"
  - "RAND analysis on critical minerals supply chain vulnerability"

  That gave 32 URLs.
- **Direct retrieval:** Node 22 with v2's installed `linkedom`, `@mozilla/readability` and `unpdf`, a 25 s timeout, and no retries. The script and raw outputs stayed in a scratch directory. None were committed, because the repo is public and outputs contain copyrighted text.
- **Success criterion:** at least 1,500 characters of extracted main text.

### 5.2 Retrieval result (N=32)

| | Count |
|---|---|
| Our direct fetcher succeeded | **16 / 32** |
| Tavily `raw_content` ≥1,500 chars | **22 / 32** (one is a YouTube description, so effectively 21) |
| Either path | **23 / 32** |
| Neither path | **9 / 32**: 4× cbo.gov, direct.mit.edu, jhu.edu (SAIS), tandfonline.com, reddit.com, facebook.com |
| Tavily only | cbpp.org, amacad.org, rand.org ×4, youtube.com |
| Direct only | un.china-mission.gov.cn |
| Direct HTTP 403 | 13 / 32 |
| Direct latency | 17 ms (instant 403) to 2.5 s (46-page PDF) |

Takeaways [I]:

- **No single path is enough.** The union helps most on think tanks (RAND, AMACAD).
- **Neither path solves CBO**, the most debate-critical government source in this sample. The benchmark must test Anthropic `web_fetch`, Exa contents, Parallel extract, Linkup fetch and Firecrawl specifically on cbo.gov.
- **Relevance and credibility vary.** For the AI/nuclear query, Tavily basic returned SIPRI (PDF), *International Security*, SAIS and CNN, but also Wikipedia, YouTube, Reddit and Facebook.

### 5.3 Other endpoint checks [O]

| Endpoint | Result |
|---|---|
| Tavily keyless search (7 calls) | HTTP 200, 1.1–2.1 s wall-clock (0.93 s server-reported on one call) |
| Parallel Search MCP, anonymous (`initialize` → `tools/list` → `web_search`) | Worked. Tools: `web_search`, `web_fetch`. Search took 0.73 s. Headers point to the terms and privacy URLs. |
| `s.jina.ai` without a key | 401 `AuthenticationRequiredError` |
| `r.jina.ai` without a key | Worked for RAND in 11.8 s. Returned a Cloudflare challenge page for congress.gov (5.0 s). |
| OpenAlex keyless search | 0.8 s. Headers show `x-ratelimit-cost-usd: 0.001` per search against a $0.10 daily budget. |
| Crossref polite query | 0.8 s |
| arXiv, Federal Register, E-utilities, CORE (keyless), ORCID | All returned 200 |
| Semantic Scholar keyless | 429 |
| Unpaywall | 422 with a placeholder email; 200 with a real-format email |
| Congress.gov and GovInfo with `DEMO_KEY` | 200 |

---

## 6. Recommended pipeline [I]

### 6.1 Principles

1. **Evidence text comes only from a stored snapshot of the source.** The snapshot is the raw bytes plus extracted text, fetched from the publisher, an official API, an open-access repository or a user upload. Search snippets, vendor summaries and model answers are discovery aids only. This fixes v1's issue of AI answers being "used as full source text" (PROJECT_RECORD).
2. **Every stored text has provenance.** That means where the text came from, when, by which path, a hash, and which terms apply.
3. **Card text is selected by offset from the snapshot, never retyped by a model.** Deterministic verification (`src/domain/verify.ts`) runs on every card.
4. **Honor robots.txt and publisher controls.** When blocked, degrade to official or open-access copies, or to a user upload.
5. **Vendor ToS decides what can be persisted.** Until terms are confirmed, use vendor-returned text only transiently, for ranking, and re-fetch from the canonical source for storage.

### 6.2 Stages

**Stage 0: Plan the query.** Claude, on a cheap tier, turns the argument into:

- 3–6 subqueries in different registers (academic, think-tank, government, news, and "answers to X");
- target source classes and date bounds;
- domain allowlists per class.

For the 2026–27 topic, prepare allowlists for health policy: CBO, CRS, GAO, CMS/ASPE, KFF, Urban, RAND, Commonwealth Fund, AEI/Heritage/Cato (labeled advocacy), NBER, and journals such as Health Affairs, NEJM, JAMA and Annals.

**Stage 1: Discover.** Run in parallel, then deduplicate by canonical URL or DOI.

- **Web.** Use 1 primary and 1 secondary API chosen by benchmark (section 7). Current candidates:
  - Exa `auto`, with `category: "publication"` for academic subqueries, `includeDomains` per class and `startPublishedDate`.
  - Tavily `advanced` with `include_domains`/`exclude_domains` and a date window.
  - Parallel, Brave, You.com or Linkup, if the benchmark favors them.
  - Anthropic `web_search`, if a single-vendor setup is preferred ($10/1k; encrypted results).
- **Scholarly.**
  - OpenAlex search with filters (year, type, `has_content`/open access), giving DOIs, authorships and OA locations.
  - Crossref to confirm DOI metadata and page ranges.
  - Semantic Scholar (with a key) for extra recall.
  - CORE (with a key) for repository copies.
  - arXiv for preprints.
- **Government.**
  - Congress.gov API for CRS.
  - GovInfo for hearings, committee reports, prints and CMR.
  - Federal Register API.
  - GAO and CBO RSS for recent items.
  - A web search restricted to `cbo.gov`/`gao.gov` for older items.

**Stage 2: Retrieve.** For each shortlisted candidate (top 5–8), try in order and stop at the first success:

1. **Official or open-access route.**
   - Congress.gov CRS PDF.
   - GovInfo `pdfLink`/`txtLink`.
   - Federal Register `raw_text_url`.
   - OpenAlex content API or `best_oa_location.pdf_url` (record the `version`).
   - arXiv.
   - PMC BioC for OA items.
2. **Our own fetcher.**
   - Honest UA, spec-compliant robots.txt check, per-host rate limit (at least the site's crawl-delay), 25 s timeout, content-type sniffing.
   - HTML → Readability plus metadata (`citation_*`, JSON-LD, OG).
   - PDF → `unpdf` per-page text plus `getPageLabels()`.
   - Store raw bytes in private object storage (Vercel Blob is already a dependency; confirm private access modes [U]) with a SHA-256.
   - Detect challenge and paywall pages even on HTTP 200: JSON-LD `isAccessibleForFree: false`, challenge strings, a sharp length drop, or a title mismatch.
3. **Vendor extraction fallback,** on 401/403, a challenge page, or empty JavaScript output. The order comes from the benchmark and is limited to vendors whose terms allow storage. Default until then: Tavily extract (`advanced`), then Anthropic `web_fetch` (basic version, direct caller; stores the full text or the raw PDF), then Linkup fetch (`renderJs` for JS pages), then Firecrawl (basic proxy only, robots respected), then Exa contents (once written permission is obtained).
4. **User upload** of a PDF or pasted text, with provenance `user_upload` and the user's stated source.
5. **Abstract only.** Label it clearly. Do not cut cards from it unless the user accepts.

**Stage 3: Evaluate.** Use a cheap model; the Batch API fits library building.

- Classify each source: peer-reviewed, government, think tank (nonpartisan or advocacy), news, expert blog, or other.
- Score recency and whether a qualification was found, with its evidence.
- Score relevance by reading chunks of the full text, not the snippet.
- Label advocacy groups; do not exclude them, because debaters need both sides.
- Keep v1's domain tiers (`perplexity.ts` `domainQuality`) as priors, but decide the class from metadata (OpenAlex type and venue, `.gov`, publisher) [I].

**Stage 4: Cut.** This matches `models-and-providers.md` §1.10.

1. The model returns **offsets** into the stored text for the card body (whole paragraphs) and the highlight spans, using structured output.
2. Code slices the text. The body is therefore verbatim by construction, and `verify.ts` checks it again.
3. A **separate** Citations call checks claim support: "does this body support the tag?". Citations and structured outputs cannot share a request [V R6]. The `cited_text` pointers must fall inside the body.
4. **Citation fields come from metadata with provenance, never from the model:** author(s), qualifications with evidence, date, title, publication, URL, DOI, accessed date, and pages.
5. **Page numbers:** map body offsets to PDF page indices, then to printed labels where they exist (e.g. CEEW `i–v`). Otherwise use the Crossref page range for articles, or mark "PDF p. N."

**Stage 5: Synthesize.** Build Argument, speeches and blocks reference **card IDs only**. A model may write tags and analytics but cannot alter card text. When a card is reused, re-check its snapshot hash, and optionally re-fetch to detect source drift.

### 6.3 Routing by source class

| Source class | Discovery | Retrieval order | Page numbers |
|---|---|---|---|
| CRS | Congress.gov API | API PDF URL → vendor | PDF pages [O] |
| CBO | CBO RSS, then web search (`cbo.gov`) | **vendor fetch (to be benchmarked)** → user upload | PDF labels |
| GAO | GAO RSS, then web search | `files.gao.gov` HTML [O, U] → vendor → GovInfo (historical) | HTML: none. PDF: labels |
| Congressional hearings and reports | GovInfo | GovInfo PDF/TXT | PDF pages |
| Federal Register | FR API | `raw_text_url` | FR page markers [O] |
| Journals | OpenAlex / Crossref / Semantic Scholar | OA copy (record the version) → publisher page (often abstract only) → user upload | Crossref range + PDF |
| Law reviews | OpenAlex + web search (many are open access on law-school sites and Digital Commons) | direct → vendor → user | PDF labels |
| Think tanks (RAND, CSIS, Brookings, CFR, …) | web search with allowlists | direct → vendor (RAND blocks direct [O]) | PDF labels |
| News | web search (`topic: news`, date window) | direct (often blocked or paywalled [O]) → vendor (no paywall bypass) → user | none |
| Expert blogs (Lawfare, War on the Rocks, …) | web search | direct (worked for warontherocks.com and armscontrolcenter.org [O]) | none |

### 6.4 What to store for each snapshot [I]

- **Request and response:**
  - `url_requested`, `url_final` (after redirects), `http_status`, `content_type`.
  - `fetched_at` (UTC), `fetch_path` (`official_api`, `oa`, `direct`, `vendor:<name>` or `user_upload`), `vendor_request_id`.
  - The robots decision and the matched rule.
- **Content:**
  - `sha256` of the raw bytes and the storage key.
  - Extractor name and version.
  - Extracted text and, for PDFs, per-page offsets with page labels.
- **Source status:**
  - Paywall and challenge flags; OA `version` and license; the terms tag (can this copy be shown or shared?).
  - Metadata candidates with their sources (`citation_*`, JSON-LD, OpenAlex/Crossref IDs, ORCID).

Never commit snapshots to the public repo.

### 6.5 Rough cost per "find and cut a card" request [I, computed from list prices in section 2]

| Step | Example | Cost |
|---|---|---|
| Discovery | 3 subqueries × Exa ($0.007) or Tavily advanced ($0.016) | $0.02–0.05 |
| | OpenAlex search | ~$0.002 (within the free $1/day) |
| | Government APIs | free |
| Retrieval | direct and official routes | free |
| | vendor extract | $0.001–0.01 per URL |
| | Anthropic `web_fetch` on Haiku 4.5 ($1/MTok) | ~$0.01 per 10 kB page; up to ~$0.13 per 500 kB PDF |
| Evaluate | ~40k input tokens on Haiku 4.5 | ~$0.04 |
| Cut + support check | Sonnet 5 ($2/$10): ~20k in, ~2k out | ~$0.06 |
| | Opus 5.5 ($4/$20) | ~$0.12 |
| **Total** | | **≈ $0.10–0.35 per request** |

Batch library-building at 50% token discount would cost less [V R4]. Measure the real figure in section 7.

---

## 7. Live benchmark plan

### 7.1 Queries (15)

Queries 5–12 use the 2026–27 national-health-insurance resolution [V R75]. Queries 1–4 are the brief's examples.

| # | Query | Expected source classes |
|---|---|---|
| 1 | evidence that US-China military AI arms race increases risk of nuclear escalation | IR journals, SIPRI/CSIS/RAND/CNAS, expert blogs |
| 2 | CBO estimate of cost of expanding Social Security | CBO, CRS, CRFB |
| 3 | answers to "China will cheat on arms control" from arms-control experts | Arms Control Assn, Carnegie, Stimson, Bulletin, journals |
| 4 | RAND analysis on critical minerals supply chain vulnerability | RAND |
| 5 | CBO estimates of federal spending and national health expenditures under a single-payer system | CBO |
| 6 | peer-reviewed estimates of administrative cost savings from single-payer health insurance | journals, NBER |
| 7 | evidence on whether national health insurance increases wait times (answers from health economists) | journals, Commonwealth Fund, advocacy (labeled) |
| 8 | RAND or Urban Institute microsimulation of national health insurance coverage and cost effects | RAND, Urban |
| 9 | CRS analysis of Medicare for All and public option proposals | CRS (Congress.gov) |
| 10 | law review analysis of federal constitutional authority for single-payer health insurance (taxing/spending power, NFIB v. Sebelius) | law reviews, legal blogs |
| 11 | quasi-experimental evidence that expanding health insurance coverage reduces mortality | NBER, QJE/JAMA |
| 12 | effect of paying hospitals Medicare rates under single payer on hospital finances and rural hospital closures | CBO, KFF, journals, AHA (advocacy) |
| 13 | GAO findings on improper payments in Medicare and Medicaid | GAO |
| 14 | CMS final rule on hospital price transparency requirements | Federal Register |
| 15 | news from the last 30 days on congressional health insurance legislation | AP, Reuters, Politico, KFF Health News (freshness test) |

### 7.2 Arms

- **Discovery:** each returns its top 10 URLs.
  - Exa `auto` (and `publication` for 6, 10 and 11).
  - Tavily `basic` (keyless) and `advanced` (keyed).
  - Parallel `fast` and `advanced`.
  - Brave web (+ LLM Context).
  - You.com.
  - Linkup `standard`.
  - Anthropic `web_search` (Haiku 4.5 and Sonnet 5, `max_uses: 3`, basic version, read the result URLs). Confirm per-model support for the basic web tools first [U].
  - Perplexity Search API (only if funded).
  - OpenAlex (academic queries).
  - Congress.gov, GovInfo and FR (government queries).

  Run each query **as written** and as a **provider-optimized rewrite** made by the same planner prompt.
- **Retrieval:** pool every unique URL from all discovery arms. Try each path independently:
  - our direct fetcher;
  - official/OA routes;
  - Exa `/contents` (default, and `maxAgeHours: 0`);
  - Tavily `/extract` (basic and advanced);
  - Parallel `/extract` (`full_content`);
  - Linkup `/fetch` (with and without `renderJs`);
  - Firecrawl scrape (basic proxy);
  - Jina Reader (with a key);
  - Anthropic `web_fetch_20250910` on Haiku 4.5.

  **Run retrieval twice:** locally and from the Vercel production region.

### 7.3 Metrics

| Metric | Definition |
|---|---|
| Relevance@10 / nDCG@10 | Graded 0–3 by an LLM judge (Opus 5.5) against a rubric. 3 = directly supports or answers the query with specific claims and warrants; 2 = on topic and useful; 1 = tangential; 0 = irrelevant or spam. Humans double-grade 20% and report Cohen's κ. |
| Credible@10 | Share of results in tier **A** (peer-reviewed, government, nonpartisan think-tank reports, law reviews) or **B** (advocacy think tanks, major news with named authors, recognized expert blogs). C = trade press, NGOs, Wikipedia; D = social media, forums, anonymous. |
| FullText@10 | Share of the top-10 URLs where *any allowed* path produced main text of ≥1,500 chars with a title or DOI match, not a challenge page and not a paywall stub. Also report the share per retrieval path and per domain class. |
| PDF page mapping | Share of retrieved PDFs with per-page text; share with printed page labels. |
| Verified-card yield | Share of queries producing ≥1 and ≥3 cards that pass `verify.ts` and have complete citation fields: author or org, date, title, publication, URL, qualifications with evidence, and pages for PDFs. |
| Latency | p50/p95 per discovery call, per retrieval call, and end-to-end per query. |
| Cost per query | From provider-reported fields (Exa `costDollars`, Tavily usage, Anthropic `usage`), otherwise list price × calls. |
| Marginal gain | Unique tier A/B URLs each arm adds over the best single arm. |
| Freshness | Share of query 15's results dated within 30 days. |
| Failure taxonomy | Counts of 401/403, challenge-on-200, robots-disallowed, paywall, JS-empty, timeout, and scanned PDF. |

### 7.4 Protocol

1. Freeze the query set and prompts, and run everything on one day.
2. Store raw responses as metadata only in the public repo (URLs, titles, scores, timings, costs, hashes). Keep extracted text in private storage.
3. Pool the results and blind the provider identity before judging.
4. Repeat 5 queries 24 hours later to measure stability.
5. Publish results in `docs/research/benchmark-YYYY-MM-DD.md` with each entry marked **verified / partially verified / unverified**, matching PROJECT_RECORD §5.

### 7.5 Decision rule

**Gates.** A service must pass both:
- its terms allow our use (persisting retrieved text, or discovery-only use);
- discovery p95 is under 8 s.

**Score.** Among services that pass the gates:

`0.35·verified-card yield + 0.25·FullText@10 + 0.20·nDCG@10 + 0.10·Credible@10 + 0.10·(1 − normalized cost)`

**Choices:**
- Pick the best **pair** of discovery APIs by union performance, not the best single API.
- Order the retrieval cascade by per-domain-class success rate.

### 7.6 Budget

Rough estimate for one full run: **$10–25 in paid usage**.

- Most search and extract calls fit inside free tiers: Exa $10, Tavily 1k credits, You.com $100, Linkup $20, Firecrawl 1k credits, Jina 10M tokens, Parallel free requests, and Brave's $5.
- The paid remainder is mostly LLM judging (Opus 5.5) and Anthropic `web_fetch` tokens on PDFs.

### 7.7 What needs keys

- **Runnable today with no account** [O]:
  - Tavily keyless (`/search`, `/extract`), Parallel's anonymous Search MCP, and Jina Reader.
  - OpenAlex (keyless $0.10/day), Crossref, arXiv, Federal Register, Congress.gov and GovInfo (`DEMO_KEY`).
  - NCBI E-utilities, CORE (metadata), ORCID, and GAO/CBO RSS.
  - Keyless Semantic Scholar also exists but is unreliable (429).
- **Free signup:**
  - Docs say no card is needed [V]: Exa, Tavily, You.com, Firecrawl and OpenAlex (key).
  - Free registrations with no payment step: CORE, Semantic Scholar (request form, manual approval), api.data.gov (Congress.gov and GovInfo) [V]. NCBI key: [U].
  - Free tier exists, but whether a card is required is unverified [U]: Linkup ($20, professional email), Brave ($5/month), Parallel, Jina (10M tokens), Diffbot, Browserbase and Browserless.
- **Needs payment or funded balance:** Anthropic (existing key in v1 `.env`, small spend, needs the user's approval), Perplexity (key out of quota and leaked; see EXT-02; Sonar retiring), OpenAI, and Kagi. SerpApi and Serper have free quotas but are excluded.

---

## 8. Credentials

Env var names follow vendor docs where noted. The others are proposed. The api.data.gov key works for both Congress.gov and GovInfo; single-key use is [U] until tested.

| Service | Needed for | Signup | Free tier | Minimum paid | Env var | Status |
|---|---|---|---|---|---|---|
| Anthropic | cut, evaluate, `web_fetch`/`web_search` | https://platform.claude.com | small credit [V R4] | usage-based | `ANTHROPIC_API_KEY` (exists) | [V] |
| Exa | discovery, contents | https://dashboard.exa.ai/api-keys [V R8] | $10/month + $10 once [V R11] | pay-as-you-go credits, no minimum; auto-recharge from $5 [V R11] | `EXA_API_KEY` (vendor SDK default) [V R8] | [V] |
| Tavily | discovery, extract | https://app.tavily.com [V R17] | 1,000 credits/month; keyless mode [V R17, R19] | Pay-as-you-go $0.008/credit, or Project $30/mo [V R17] | `TAVILY_API_KEY` (vendor docs) [V] | [V] |
| Parallel | discovery, extract | https://platform.parallel.ai [V R38] | 5,000 requests/month; up to $80 signup credit + $5/month [V R34] | pay-as-you-go | `PARALLEL_API_KEY` (vendor docs) [V] | [V] |
| Brave | discovery | https://api-dashboard.search.brave.com [U] | $5/month credit [V R24] | usage at $5/1k [V R24] | `BRAVE_SEARCH_API_KEY` (header `X-Subscription-Token`) [V R26 header] | [V]/[U] |
| You.com | discovery, contents | https://you.com/platform [V R40] | $100 credit [V R39] | pay-as-you-go [V R39] | `YDC_API_KEY` (vendor docs) [V] | [V] |
| Linkup | discovery, fetch | https://app.linkup.so [V R42] | $20/month (professional email) [V R42] | prepaid balance [V R42] | `LINKUP_API_KEY` (vendor docs) [V] | [V] |
| Perplexity | Search API (optional) | https://console.perplexity.ai [U] | none found [U] | credit purchase; Tier 1 at $50 cumulative [V R29] | `PERPLEXITY_API_KEY` (exists, no quota; revoke) | [V] |
| Kagi | discovery (optional) | https://help.kagi.com/kagi/api/overview.html [V R45] | none found [U] | pay-per-use, invoiced at $100 [V R45] | `KAGI_API_KEY` (header `Authorization: Bot`) [V R45] | [V] |
| Jina | Reader/Search | https://jina.ai/reader/ [V R46] | 10M tokens/key; Reader keyless 20 RPM [V R46] | token top-ups (price [U]) | `JINA_API_KEY` | [V]/[U] |
| Firecrawl | extract fallback | https://www.firecrawl.dev/pricing [V R53] | 1,000 credits/month [V R53] | Hobby $19/mo [V R53] | `FIRECRAWL_API_KEY` (vendor docs) [V] | [V] |
| Diffbot | metadata extraction (optional) | https://www.diffbot.com/pricing/ [V R54] | 10k credits/month [V R54] | Startup $299/mo [V R54] | `DIFFBOT_TOKEN` | [V]/[I] |
| Browserbase | JS last resort (optional) | https://www.browserbase.com/pricing [V R55] | 1 browser-hour [V R55] | Developer $20/mo [V R55] | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | [V]/[I] |
| OpenAlex | scholarly | https://openalex.org/settings/api [V R60] | $1/day [V R61] | prepaid in $1 steps; Member $5,000/yr [V R61] | `OPENALEX_API_KEY` | [V] |
| Crossref | DOI metadata | none (mailto) [V R65] | polite pool | Metadata Plus (price [U]) | `CROSSREF_MAILTO` | [V] |
| Semantic Scholar | scholarly recall | https://www.semanticscholar.org/product/api#api-key-form [V R66] | 1 RPS key [V R66] | n/a | `S2_API_KEY` | [V] |
| Unpaywall | OA lookup | none (email parameter) [V R63] | [U] | n/a | `UNPAYWALL_EMAIL` | [V]/[O] |
| CORE | repository full text | https://core.ac.uk/services/api [V R67] | 1,000 tokens/day [V R67] | institutional | `CORE_API_KEY` | [V] |
| NCBI | PubMed/PMC | NCBI account settings [U] | 3 rps keyless [O] | n/a | `NCBI_API_KEY` | [O]/[U] |
| Congress.gov + GovInfo | CRS, hearings, reports | https://api.congress.gov/sign-up/ [V R71] (api.data.gov key) | 5,000/h (Congress.gov); 36,000/h (GovInfo) [V R71, R72] | free | `DATA_GOV_API_KEY` | [V] |
| Federal Register | rules and notices | none | [U] | free | none | [O] |
| All fetchers | honest identification | n/a | n/a | n/a | `FETCH_CONTACT_EMAIL`, `FETCH_USER_AGENT` | [I] |

---

## 9. Risks and open questions

1. **Copyright and sharing** [I]. Storing full texts of copyrighted articles and showing cards to every user raises legal questions this research cannot settle.
   - Suggested posture: keep snapshots private and access-controlled; show only the cut card plus a link; have a takedown path; get counsel's view before launch.
2. **Vendor terms.** Get written answers from Exa (§4.2(a)), Parallel (the End Customer and database clauses), Brave (storage-rights plan price) and Tavily (confirm Output storage and sharing across users) before any vendor text becomes a canonical snapshot.
3. **CBO coverage.** Neither probe path retrieved cbo.gov. If no vendor succeeds, CBO cards will depend on user uploads. Consider asking CBO whether an identified research bot can be allowed [I].
4. **Datacenter egress.** Block rates from Vercel may be worse than from the residential probe. Measure in the benchmark (section 7.2).
5. **Anthropic `web_fetch` model support.** The sibling doc flags an inconsistency in which models support the dynamic-filtering versions (`models-and-providers.md` §1.9). This design uses the basic version, but still verify it works on the chosen model [U].
6. **Minors.** Gemini is already excluded for users under 18 (`models-and-providers.md` §3.3). Check every other vendor's terms for age and education-use limits before launch [U].

## 10. Unverified items to confirm

- Tavily PDF support (documented?), Tavily extract robots behavior, and which plans get Tavily ZDR.
- You.com and Linkup: terms, retention, robots behavior, and You.com PDF support.
- Perplexity API terms (the page returned 403 to automated fetch) and Search API retention.
- Brave `site:` operator support and whether a card is needed for the free credit.
- Kagi rate limits, filters and PDF support. Jina token prices.
- Unpaywall daily limit. NCBI keyed rate limit. Crossref Plus pricing. ORCID public-API terms for commercial use.
- Whether GAO's `files.gao.gov/reports/<id>/index.html` pattern is stable. Whether an official GAO or CBO API exists.
- The status of Google v. SerpApi after December 2025 (only third-party reports found).

---

## 11. Sources (all accessed 2026-09-25)

**Anthropic**
- R1 Web fetch tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- R2 Web search tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- R3 Server tools (ZDR, `allowed_callers`, domain filtering): https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools
- R4 Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- R5 API and data retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- R6 Citations: https://platform.claude.com/docs/en/build-with-claude/citations
- R7 Anthropic crawlers and robots.txt: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

**Exa**
- R8 Pricing: https://exa.ai/docs/admin/pricing and https://exa.ai/pricing
- R9 Search reference: https://exa.ai/docs/reference/search (raw `.md`; OpenAPI at https://exa.ai/docs/exa-spec.yaml)
- R10 Contents: https://exa.ai/docs/reference/get-contents and https://exa.ai/docs/contents/quickstart
- R11 Billing and rate limits: https://exa.ai/docs/admin/billing and https://exa.ai/docs/reference/rate-limits
- R12 Zero Data Retention: https://exa.ai/docs/admin/security/zero-data-retention
- R13 Changelog: https://exa.ai/docs/changelog
- R14 FAQs (crawler behavior): https://exa.ai/docs/admin/faqs
- R15 Terms of Service (PDF dated 2025-03-04, linked from exa.ai): https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf
- R16 Search quickstart (latency table): https://exa.ai/docs/search/quickstart

**Tavily**
- R17 Credits and pricing: https://docs.tavily.com/documentation/api-credits
- R18 Rate limits: https://docs.tavily.com/documentation/rate-limits
- R19 Keyless access: https://docs.tavily.com/documentation/keyless
- R20 Search reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
- R21 Extract reference: https://docs.tavily.com/documentation/api-reference/endpoint/extract
- R22 Terms (last updated 2026-05-04): https://www.tavily.com/terms
- R23 FAQ and full docs (crawl best practices): https://docs.tavily.com/faq/faq and https://docs.tavily.com/llms-full.txt

**Brave**
- R24 Brave Search API: https://brave.com/search/api/
- R25 LLM Context launch (2026-02-12, updated 2026-06-25): https://brave.com/blog/most-powerful-search-api-for-ai/
- R26 Web search docs: https://api-dashboard.search.brave.com/documentation/services/web-search

**Perplexity**
- R27 Pricing (includes the Sonar deprecation notice): https://docs.perplexity.ai/docs/getting-started/pricing
- R28 Search API quickstart: https://docs.perplexity.ai/docs/search/quickstart
- R29 Rate limits and usage tiers: https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers
- R30 Agent API `fetch_url`: https://docs.perplexity.ai/docs/agent-api/tools/fetch-url-content
- R31 Domain filter: https://docs.perplexity.ai/docs/search/filters/domain-filter
- R32 Date filters: https://docs.perplexity.ai/docs/search/filters/date-time-filters
- R33 Privacy and security: https://docs.perplexity.ai/docs/resources/privacy-security

**Parallel**
- R34 Pricing: https://docs.parallel.ai/getting-started/pricing and https://parallel.ai/pricing
- R35 Rate limits: https://docs.parallel.ai/getting-started/rate-limits
- R36 Source policy: https://docs.parallel.ai/search/source-policy
- R37 Customer Terms (effective 2026-08-11): https://parallel.ai/customer-terms
- R38 Full docs (Extract, Search MCP, ZDR): https://docs.parallel.ai/llms-full.txt

**You.com**
- R39 Billing: https://you.com/docs/administration/billing
- R40 Rate limits: https://you.com/docs/rate-limits
- R41 Retrieval, contents and controls: https://you.com/docs/guides/search/retrieve-page-content, https://you.com/docs/guides/contents, https://you.com/docs/guides/search/request-controls and https://you.com/api

**Linkup**
- R42 Pricing: https://docs.linkup.so/pages/documentation/platform/pricing
- R43 Rate limits: https://docs.linkup.so/pages/documentation/platform/rate-limits
- R44 Fetch and search: https://docs.linkup.so/pages/documentation/endpoints/fetch/overview and https://docs.linkup.so/pages/documentation/endpoints/search/reference

**Other search and SERP APIs**
- R45 Kagi: https://kagi.com/api/pricing, https://help.kagi.com/kagi/api/overview.html and https://help.kagi.com/kagi/api/search.html
- R46 Jina Reader and Search: https://jina.ai/reader/
- R47 Serper: https://serper.dev/
- R48 SerpApi: https://serpapi.com/pricing and https://serpapi.com/google-scholar-api
- R49 Google on the SerpApi lawsuit (2025-12-19): https://blog.google/innovation-and-ai/technology/safety-security/serpapi-lawsuit/
- R50 OpenAI: https://developers.openai.com/api/docs/pricing and https://developers.openai.com/api/docs/guides/tools-web-search
- R51 Gemini: https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/google-search and https://ai.google.dev/gemini-api/docs/url-context
- R52 Gemini API terms (Grounding with Google Search): https://ai.google.dev/gemini-api/terms

**Extraction services and libraries**
- R53 Firecrawl: https://www.firecrawl.dev/pricing, https://docs.firecrawl.dev/billing and https://docs.firecrawl.dev/llms-full.txt
- R54 Diffbot: https://www.diffbot.com/pricing/ and https://www.diffbot.com/docs/extract/article
- R55 Browserbase: https://www.browserbase.com/pricing
- R56 Browserless: https://www.browserless.io/pricing
- R57 Mozilla Readability: https://github.com/mozilla/readability
- R58 unpdf: https://github.com/unjs/unpdf; pdf.js `getPageLabels`: https://github.com/mozilla/pdf.js/blob/master/src/display/api.js
- R59 npm registry, `https://registry.npmjs.org/<pkg>/latest`, for @mozilla/readability, linkedom, jsdom, unpdf, pdfjs-dist, pdf-parse, robots-parser, defuddle, tesseract.js and playwright

**Scholarly**
- R60 OpenAlex authentication: https://help.openalex.org/api/authentication
- R61 OpenAlex pricing: https://help.openalex.org/access/pricing
- R62 OpenAlex example costs: https://help.openalex.org/access/example-costs
- R63 OpenAlex on Unpaywall: https://help.openalex.org/access/unpaywall
- R64 OpenAlex full text: https://help.openalex.org/access/fulltext
- R65 Crossref access and authentication: https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/
- R66 Semantic Scholar API: https://www.semanticscholar.org/product/api
- R67 CORE API v3: https://api.core.ac.uk/docs/v3
- R68 arXiv API terms of use: https://info.arxiv.org/help/api/tou.html
- R69 PMC Open Access Subset: https://pmc.ncbi.nlm.nih.gov/tools/openftlist/
- R70 ITHAKA Constellate retrospective (2025-07-31): https://labs.ithaka.org/blog/constellate-an-experiment-and-retrospective/

**Government**
- R71 Congress.gov API (README and `Documentation/CRSReportEndpoint.md`): https://github.com/LibraryOfCongress/api.congress.gov
- R72 GovInfo API: https://github.com/usgpo/api
- R73 api.data.gov developer manual: https://api.data.gov/docs/developer-manual/

**Other context**
- R74 Cloudflare, "Content Independence Day": https://blog.cloudflare.com/content-independence-day-no-ai-crawl-without-compensation/
- R75 NSDA topics (2026–27 policy resolution): https://www.speechanddebate.org/topics/
- R76 congress.gov robots.txt: https://www.congress.gov/robots.txt
- R77 Google Scholar robots.txt: https://scholar.google.com/robots.txt

**Live endpoints used in probes (section 5):**
- api.congress.gov/v3/crsreport, api.govinfo.gov/collections and federalregister.gov/api/v1/documents.json
- api.openalex.org/works, api.crossref.org/works, api.unpaywall.org/v2, api.core.ac.uk/v3/search/works, export.arxiv.org/api/query, eutils.ncbi.nlm.nih.gov, api.semanticscholar.org and pub.orcid.org/v3.0
- gao.gov/rss/reports.xml, files.gao.gov and cbo.gov/publications/all/rss.xml
- api.tavily.com (keyless), search.parallel.ai/mcp, r.jina.ai and s.jina.ai
