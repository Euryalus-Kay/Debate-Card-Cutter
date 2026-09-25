/**
 * Source discovery. Search results are leads only: nothing here is quoted.
 * Every candidate is fetched and read in full before a card can be cut.
 *
 * Providers: Anthropic's web_search server tool (general web; the model sees
 * result contents and picks promising leads) and OpenAlex (open-access
 * scholarship with bibliographic metadata).
 */

import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/server/ai/models";

export interface Candidate {
  url: string;
  title: string;
  publication?: string;
  why?: string;
  pageAge?: string;
  provider: "anthropic_web_search" | "openalex" | "user";
  /** bibliographic metadata from a database (provenance "metadata") */
  metadata?: {
    authors?: string[];
    year?: number;
    date?: string;
    venue?: string;
    doi?: string;
  };
}

export interface DiscoveryResult {
  candidates: Candidate[];
  /** every result the search returned, for transparency */
  seen: { url: string; title: string; pageAge?: string }[];
  queries: string[];
  usage?: { inputTokens: number; outputTokens: number; searches: number };
  ms: number;
  error?: string;
}

/** Not primary sources, or not citable as evidence. */
export const BLOCKED_DOMAINS = [
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "youtube.com",
  "tiktok.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
  "coursehero.com",
  "studocu.com",
  "chegg.com",
  "brainly.com",
  "opencaselist.com",
  "debatecoaches.org",
];

function parseCandidates(text: string): { url: string; title?: string; publication?: string; why?: string }[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.url === "string") : [];
  } catch {
    return [];
  }
}

export async function discoverWeb(
  query: string,
  opts: { context?: string; maxCandidates?: number; maxSearches?: number; signal?: AbortSignal } = {},
): Promise<DiscoveryResult> {
  const t0 = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { candidates: [], seen: [], queries: [], ms: 0, error: "ANTHROPIC_API_KEY is not configured." };
  const client = new Anthropic({ apiKey: key, baseURL: "https://api.anthropic.com" });
  const max = opts.maxCandidates ?? 6;
  const prompt = [
    `A high school policy debater needs evidence (a direct quotation from a credible, citable author) for this claim:`,
    `"${query}"`,
    opts.context ? `Context: ${opts.context}` : "",
    ``,
    `Search the web for sources whose own text makes or directly supports this claim. Prefer, in order: named experts or institutions with clear qualifications (academics, think tanks, government agencies, major newspapers and magazines, law reviews, trade press); pages whose full text is publicly readable (not paywalled); recent work when the claim depends on current events. Avoid press releases that only summarize others, content farms, encyclopedias, and forums.`,
    ``,
    `Reply with ONLY a JSON array (no prose) of up to ${max} of the best leads from your search results, best first:`,
    `[{"url": "...", "title": "...", "publication": "...", "why": "one short sentence on what the source says that matters"}]`,
    `Use only URLs that appeared in your search results.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
  try {
    const res = await client.messages.create(
      {
        model: MODELS.sonnet5,
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxSearches ?? 3, blocked_domains: BLOCKED_DOMAINS } as never],
        messages: [{ role: "user", content: prompt }],
      },
      { signal: opts.signal },
    );
    const seen: DiscoveryResult["seen"] = [];
    const queries: string[] = [];
    let finalText = "";
    for (const b of res.content as unknown as { type: string; name?: string; input?: { query?: string }; content?: unknown; text?: string }[]) {
      if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) queries.push(b.input.query);
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const it of b.content as { type: string; url: string; title: string; page_age?: string }[]) {
          if (it.type === "web_search_result") seen.push({ url: it.url, title: it.title, pageAge: it.page_age ?? undefined });
        }
      }
      if (b.type === "text" && b.text) finalText += b.text;
    }
    const seenUrls = new Map(seen.map((s) => [normalizeUrl(s.url), s]));
    const picked = parseCandidates(finalText)
      .filter((c) => seenUrls.has(normalizeUrl(c.url))) // never trust a URL the search didn't return
      .slice(0, max)
      .map<Candidate>((c) => {
        const s = seenUrls.get(normalizeUrl(c.url))!;
        return { url: s.url, title: c.title || s.title, publication: c.publication, why: c.why, pageAge: s.pageAge, provider: "anthropic_web_search" };
      });
    // If the model's list could not be parsed, fall back to raw results in rank order.
    const candidates = picked.length ? picked : dedupe(seen.map((s) => ({ url: s.url, title: s.title, pageAge: s.pageAge, provider: "anthropic_web_search" as const }))).slice(0, max);
    const u = res.usage as unknown as { input_tokens: number; output_tokens: number; server_tool_use?: { web_search_requests?: number } };
    return {
      candidates,
      seen,
      queries,
      usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, searches: u.server_tool_use?.web_search_requests ?? queries.length },
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { candidates: [], seen: [], queries: [], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string | null;
  publication_year: number | null;
  publication_date: string | null;
  authorships: { author: { display_name: string } }[];
  primary_location: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
  best_oa_location: { pdf_url?: string | null; landing_page_url?: string | null } | null;
}

export async function discoverOpenAlex(query: string, opts: { max?: number; signal?: AbortSignal } = {}): Promise<DiscoveryResult> {
  const t0 = Date.now();
  const params = new URLSearchParams({
    search: query,
    filter: "is_oa:true,type:article|review|report|book-chapter",
    per_page: String(opts.max ?? 4),
    select: "id,doi,title,publication_year,publication_date,authorships,primary_location,best_oa_location",
  });
  try {
    const res = await fetch(`https://api.openalex.org/works?${params}`, { signal: opts.signal ?? AbortSignal.timeout(15000), headers: { "user-agent": "ClashDebateResearch/1.0" } });
    if (!res.ok) return { candidates: [], seen: [], queries: [query], ms: Date.now() - t0, error: `OpenAlex HTTP ${res.status}` };
    const data = (await res.json()) as { results: OpenAlexWork[] };
    const candidates: Candidate[] = [];
    for (const w of data.results ?? []) {
      const url = w.best_oa_location?.landing_page_url || w.best_oa_location?.pdf_url || w.primary_location?.landing_page_url || (w.doi ?? "");
      if (!url || !w.title) continue;
      candidates.push({
        url,
        title: w.title,
        publication: w.primary_location?.source?.display_name ?? undefined,
        provider: "openalex",
        metadata: {
          authors: w.authorships.map((a) => a.author.display_name).filter(Boolean).slice(0, 12),
          year: w.publication_year ?? undefined,
          date: w.publication_date ?? undefined,
          venue: w.primary_location?.source?.display_name ?? undefined,
          doi: w.doi?.replace(/^https?:\/\/doi\.org\//, "") ?? undefined,
        },
      });
    }
    return { candidates, seen: candidates.map((c) => ({ url: c.url, title: c.title })), queries: [query], ms: Date.now() - t0 };
  } catch (e) {
    return { candidates: [], seen: [], queries: [query], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|src$)/i.test(k)) x.searchParams.delete(k);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}${x.search}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

export function dedupe<T extends { url: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = normalizeUrl(c.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
