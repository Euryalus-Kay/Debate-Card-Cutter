/**
 * Perplexity-backed evidence search. Tuned for high school policy debate —
 * prioritizes credentialed authors, recent publications, and quote-able
 * passages over breezy summaries.
 */

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY!;

interface PerplexitySource {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  domain?: string;
}

interface PerplexityResult {
  answer: string;
  sources: PerplexitySource[];
}

/**
 * Domain quality score 0-100. Used to rank sources before scraping.
 * Higher = more authoritative for debate evidence.
 */
function domainQuality(url: string): number {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Tier 1 — peer-reviewed academic + flagship journals
    if (
      /\.edu$|nature\.com|science\.org|sciencedirect|jstor|cambridge\.org|oup\.com|wiley\.com|springer\.com|tandfonline|sagepub|nih\.gov|scholar\.google/.test(
        host
      )
    )
      return 95;
    // Tier 2 — top think tanks + IGOs
    if (
      /brookings\.edu|rand\.org|cfr\.org|csis\.org|cato\.org|aei\.org|heritage\.org|carnegie|piie\.com|chathamhouse|imf\.org|worldbank\.org|un\.org|oecd\.org/.test(
        host
      )
    )
      return 90;
    // Tier 3 — major journalism with named authors
    if (
      /foreignaffairs|foreignpolicy|nytimes|washingtonpost|wsj|economist|theatlantic|newyorker|lawfaremedia|lawfareblog|politico|reuters|bloomberg|apnews\.com|bbc\.com|ft\.com/.test(
        host
      )
    )
      return 80;
    // Tier 4 — reputable industry/news
    if (
      /\.gov$|\.ac\.uk$|conversations\.com|niskanen|aspeninstitute|wilsoncenter|stimson|cigi|epi\.org|peterson|mercatus/.test(
        host
      )
    )
      return 75;
    // Tier 5 — Wikipedia + general
    if (/wikipedia\.org|reuters\.com|axios\.com|theguardian/.test(host)) return 60;
    // Tier 6 — blogs / unknown
    if (/medium\.com|substack/.test(host)) return 40;
    return 50;
  } catch {
    return 30;
  }
}

const SEARCH_SYSTEM_PROMPT = `You are an elite policy debate research assistant. Your job is to find the best possible evidence for cutting tournament-grade debate cards.

EVIDENCE PRIORITY ORDER (always prefer in this order):
1. Peer-reviewed academic articles (Nature, Science, IR journals, law reviews)
2. Major think tank reports with named senior fellows (Brookings, RAND, CSIS, CFR, Cato, AEI, Carnegie, Heritage)
3. Government/IGO reports (CRS, GAO, IMF, World Bank, UN agencies)
4. Quality long-form journalism with named expert authors (Foreign Affairs, Lawfare, FT, NYT magazine, Atlantic)
5. Industry/specialist publications with named experts

WHAT TO RETURN PER SOURCE:
- Author full name(s) AND credentials (titles, institutional affiliations, professional roles)
- Exact publication title
- Exact publication date
- Direct URL
- A SUBSTANTIAL VERBATIM EXCERPT (4+ sentences) containing the strongest claim
- The author's specific stance on the question

REJECT:
- Anonymous content, content-farm articles
- Social media posts unless from credentialed accounts
- Marketing copy / press releases
- Sources older than 8 years unless explicitly historical
- Generic overviews without specific claims

Aim to surface 3-5 EXCELLENT sources rather than 10 mediocre ones. Quality > quantity.`;

export async function searchEvidence(
  query: string,
  context: string,
  rapid?: boolean
): Promise<PerplexityResult> {
  const userPrompt = `RESEARCH TASK: Find evidence for the following policy debate argument.

ARGUMENT: ${query}

${context ? `DEBATE CONTEXT: ${context}\n` : ""}
PRIORITIES:
- Specific factual claims (numbers, dates, named cases) over general assertions
- Sources from authors with verifiable expertise on this exact question
- Recent publications (2020+) preferred unless historical evidence is needed
- Quote substantial passages — debate cards need 4+ paragraphs of source text

For each source, provide:
1. AUTHOR: Full name(s) and credentials
2. TITLE: Exact title
3. DATE: Month/year
4. URL: Direct link
5. EXCERPT: 4-8 sentence verbatim block with the strongest claim
6. STANCE: One sentence summarizing what this source argues

Provide 3-5 high-quality sources, ranked best-first.`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: rapid ? "sonar" : "sonar-pro",
      messages: [
        { role: "system", content: SEARCH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: rapid ? 2000 : 4500,
      return_citations: true,
      search_recency_filter: "year",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const answer: string = data.choices[0].message.content;
  const citations: string[] = data.citations || [];

  // Convert raw citation URLs into ranked sources
  const sources: PerplexitySource[] = citations.map((url: string, i: number) => {
    let domain = "";
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }
    return {
      title: `Source ${i + 1}`,
      url,
      snippet: "",
      domain,
    };
  });

  // Rank sources by domain quality (stable sort: original order on tie)
  sources.sort((a, b) => domainQuality(b.url) - domainQuality(a.url));

  return { answer, sources };
}

/**
 * Deep-dive on a single source. Used when scraping fails or returns thin
 * content. Pulls the longest verbatim block we can extract.
 */
export async function deepSearchSource(url: string, query: string): Promise<string> {
  const systemPrompt = `You are extracting verbatim source text from a specific URL for a policy debate evidence card.

REQUIREMENTS:
- Return the ACTUAL TEXT from the article, exactly as written.
- Do NOT summarize, paraphrase, or rewrite.
- Include 6-15 paragraphs of original text.
- Include the article's strongest claim AND surrounding context.
- If the article has an author bio, include that too.

NEVER fabricate text. If you cannot access the URL, say so explicitly.`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Get the substantial body text from this URL — verbatim, multiple paragraphs:\n\n${url}\n\nThis text will support the argument: ${query}`,
        },
      ],
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity deep search error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Verify-online: given a card, ask Perplexity to confirm the citation,
 * find the original source, and surface alternative supporting evidence.
 */
export async function verifyCardOnline(
  tag: string,
  citation: string,
  evidenceExcerpt: string
): Promise<{
  citationConfirmed: boolean;
  sourceFound: string;
  alternateSources: Array<{ url: string; description: string }>;
  warnings: string[];
}> {
  const systemPrompt = `You verify policy debate evidence cards against the open web. Confirm the citation, locate the original source, and identify alternative sources that say similar things.

Return ONLY JSON in this exact shape:
{
  "citationConfirmed": true/false,
  "sourceFound": "URL of the original source if found, or empty string",
  "alternateSources": [{"url": "...", "description": "what this source adds"}],
  "warnings": ["any concerns about the evidence — e.g., taken out of context, miscredited author, outdated"]
}`;

  const userPrompt = `CARD TO VERIFY:

TAG: ${tag}

CITATION: ${citation}

EVIDENCE EXCERPT (first 1500 chars):
${evidenceExcerpt.substring(0, 1500)}

Verify this card. Confirm the citation is real, find the original source, and surface 2-3 alternative supporting sources. Return JSON only.`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      return_citations: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Verify error: ${response.status}`);
  }

  const data = await response.json();
  const content: string = data.choices[0].message.content;
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      citationConfirmed: false,
      sourceFound: "",
      alternateSources: [],
      warnings: ["Verifier returned no structured response."],
    };
  }
  try {
    const parsed = JSON.parse(match[0]);
    // Backfill alternateSources from citations if missing.
    if (
      (!parsed.alternateSources || parsed.alternateSources.length === 0) &&
      Array.isArray(data.citations)
    ) {
      parsed.alternateSources = (data.citations as string[]).slice(0, 3).map((url) => ({
        url,
        description: "Related source surfaced during verification",
      }));
    }
    return parsed;
  } catch {
    return {
      citationConfirmed: false,
      sourceFound: "",
      alternateSources: [],
      warnings: ["Verifier returned malformed JSON."],
    };
  }
}

/**
 * Find related evidence for an existing card — different angles on the same
 * argument. Used by the "related cards" suggestion engine.
 */
export async function findRelatedSources(
  tag: string,
  evidenceExcerpt: string
): Promise<
  Array<{
    url: string;
    title: string;
    excerpt: string;
    angle: "supports" | "stronger" | "alternate" | "rebuts";
  }>
> {
  const systemPrompt = `You find related sources for a policy debate evidence card.

Return ONLY a JSON array of 4-6 related sources, each with:
- url: direct link
- title: source title
- excerpt: 2-3 sentence verbatim excerpt
- angle: "supports" (similar claim), "stronger" (better card on the same point), "alternate" (different angle on the same topic), or "rebuts" (the OPPOSITE claim — useful for prep against this card)

Mix angles to give a debater a complete picture. Always include at least one "rebuts" so the team knows what the opponent will read.`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Find related sources for this card.

TAG: ${tag}

EVIDENCE EXCERPT:
${evidenceExcerpt.substring(0, 1500)}

Return JSON array only.`,
        },
      ],
      max_tokens: 3500,
      return_citations: true,
    }),
  });

  if (!response.ok) throw new Error(`Related search error: ${response.status}`);
  const data = await response.json();
  const content: string = data.choices[0].message.content;
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}
