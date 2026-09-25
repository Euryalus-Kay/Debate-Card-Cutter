/**
 * Source retrieval. Honest identification, robots.txt respected, no paywall
 * bypass. HTML → Readability text + citation metadata; PDF → page text.
 * Falls back to Anthropic's web_fetch tool (which also respects robots.txt)
 * for pages our fetcher can't read (bot walls, some government sites).
 */

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import Anthropic from "@anthropic-ai/sdk";
import { extractPdf, pdfParagraphs } from "@/server/ingest/pdf";
import { splitAuthors } from "./cite";

export const FETCH_UA = "ClashDebateResearch/1.0 (+evidence verification for student debaters; respects robots.txt)";

export interface SourceMetadata {
  title?: string;
  authors: string[];
  published?: string; // ISO or raw
  siteName?: string;
  publisher?: string;
  description?: string;
  doi?: string;
  canonicalUrl?: string;
}

export interface FetchedSource {
  ok: boolean;
  url: string;
  finalUrl: string;
  method: "direct" | "anthropic_web_fetch";
  httpStatus?: number;
  contentType?: string;
  format: "html" | "pdf" | "plain";
  text: string;
  paragraphs: string[];
  metadata: SourceMetadata;
  error?: string;
  blocked?: "robots" | "paywall" | "bot_protection" | "http_error" | "empty" | "unsupported";
  /** for PDFs: the 1-based PDF pages each paragraph came from */
  paragraphPages?: [number, number][];
  /** text-processing notes recorded with the snapshot */
  notes?: string[];
}

const robotsCache = new Map<string, { rules: { allow: boolean; path: string }[]; at: number }>();

async function robotsAllows(url: URL): Promise<boolean> {
  const key = url.origin;
  let entry = robotsCache.get(key);
  if (!entry || Date.now() - entry.at > 3600_000) {
    const rules: { allow: boolean; path: string }[] = [];
    try {
      const res = await fetch(`${url.origin}/robots.txt`, { headers: { "user-agent": FETCH_UA }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const txt = await res.text();
        let applies = false;
        for (const raw of txt.split(/\r?\n/)) {
          const line = raw.replace(/#.*/, "").trim();
          const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
          if (!m) continue;
          const field = m[1].toLowerCase();
          const value = m[2].trim();
          if (field === "user-agent") applies = value === "*" || /clash/i.test(value);
          else if (applies && (field === "disallow" || field === "allow") && value) rules.push({ allow: field === "allow", path: value });
        }
      }
    } catch {
      /* unreachable robots.txt: treat as allowed */
    }
    entry = { rules, at: Date.now() };
    robotsCache.set(key, entry);
  }
  const path = url.pathname + url.search;
  let best: { allow: boolean; path: string } | null = null;
  for (const r of entry.rules) {
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp(`^${pattern}`).test(path) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}

function meta(doc: Document, names: string[]): string | undefined {
  for (const n of names) {
    const el = doc.querySelector(`meta[name="${n}"], meta[property="${n}"]`);
    const v = el?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return undefined;
}

function jsonLd(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const v = JSON.parse(s.textContent ?? "");
      const list = Array.isArray(v) ? v : v["@graph"] ? v["@graph"] : [v];
      for (const x of list) if (x && typeof x === "object") out.push(x);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function authorsFrom(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(authorsFrom);
  if (typeof value === "object" && value && "name" in value) return authorsFrom((value as { name: unknown }).name);
  return [];
}

export function extractHtmlMetadata(doc: Document): SourceMetadata {
  const ld = jsonLd(doc);
  const article = ld.find((x) => /Article|Report|ScholarlyArticle|NewsArticle|BlogPosting|WebPage/i.test(String(x["@type"] ?? "")));
  const citationAuthors = Array.from(doc.querySelectorAll('meta[name="citation_author"], meta[name="dc.creator"], meta[name="DC.creator"]'))
    .map((m) => m.getAttribute("content")?.trim() ?? "")
    .filter(Boolean);
  const authors = citationAuthors.length ? citationAuthors : authorsFrom(article?.author) .length ? authorsFrom(article?.author) : (meta(doc, ["author", "article:author", "parsely-author", "sailthru.author"]) ?? "").split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^https?:/.test(s));
  return {
    title: meta(doc, ["citation_title", "og:title", "twitter:title", "dc.title"]) ?? (article?.headline as string | undefined) ?? doc.querySelector("title")?.textContent?.trim(),
    // Only plausible personal names; usernames and "Staff" fall through to the byline in the text.
    authors: splitAuthors([...new Set(authors)]).slice(0, 12),
    published: meta(doc, ["citation_publication_date", "citation_date", "article:published_time", "datePublished", "dc.date", "DC.date.issued", "date", "pubdate"]) ?? (article?.datePublished as string | undefined),
    siteName: meta(doc, ["og:site_name", "application-name"]),
    publisher: meta(doc, ["citation_publisher", "citation_journal_title", "dc.publisher"]) ?? ((article?.publisher as { name?: string } | undefined)?.name ?? undefined),
    description: meta(doc, ["description", "og:description"]),
    doi: meta(doc, ["citation_doi", "dc.identifier"])?.replace(/^doi:/i, ""),
    canonicalUrl: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined,
  };
}

export function paragraphsOf(text: string): string[] {
  return (
    text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim())
      // Bare URLs are embeds (videos, iframes), not article text.
      .filter((p) => p.length > 0 && !/^(<?https?:\/\/\S+>?\s*)+$/.test(p))
  );
}

async function pdfSource(buf: Uint8Array): Promise<Pick<FetchedSource, "ok" | "format" | "text" | "paragraphs" | "paragraphPages" | "metadata" | "error" | "blocked" | "notes">> {
  const pdf = await extractPdf(buf);
  if (pdf.likelyScanned) return { ok: false, format: "pdf", text: "", paragraphs: [], metadata: { authors: [] }, error: "PDF has no usable text layer (scanned).", blocked: "empty" };
  const paras = pdfParagraphs(pdf.pages);
  const paragraphs = paras.map((p) => p.text);
  const text = paragraphs.join("\n\n");
  // The file's Author field is often whoever saved the file; trust it only if the document names them.
  const author = pdf.info.author && !/(microsoft|user|admin|owner|staff|office)/i.test(pdf.info.author) && normalizeLoose(text).includes(normalizeLoose(pdf.info.author)) ? [pdf.info.author] : [];
  return {
    ok: true,
    format: "pdf",
    text,
    paragraphs,
    paragraphPages: paras.map((p) => p.pages),
    metadata: {
      authors: author.length ? author : bylineFromParagraphs(paragraphs),
      title: pdf.info.title && pdf.info.title.length > 3 && !/\.(docx?|pdf)$/i.test(pdf.info.title) ? pdf.info.title : undefined,
      published: dateFromParagraphs(paragraphs),
    },
    notes: ["PDF text layer; page numbers and running headers removed; line-end hyphenation joined", ...pdf.warnings],
  };
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

/** Render the Markdown that web_fetch returns as visible text (links → their text, images dropped). */
export function markdownToText(md: string): string {
  return md
    .split(/\r?\n/)
    .filter((l) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l)) // table separators
    .map((l) =>
      l
        .replace(/!\[[^\]]*\]\((?:[^()\s]|\([^)]*\))*(?:\s+"[^"]*")?\)/g, "")
        .replace(/\[([^\]]*)\]\((?:[^()\s]|\([^)]*\))*(?:\s+"[^"]*")?\)/g, "$1")
        .replace(/<(https?:[^>]+)>/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d{1,3}\.\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/(^|[^\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?!\w)/g, "$1$2")
        .replace(/(^|[^\w_])_(?!\s)([^_]+?)(?<!\s)_(?!\w)/g, "$1$2")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1")
        .replace(/^\s*\|(.*)\|\s*$/, (_m, row: string) => row.split("|").map((c) => c.trim()).join(" | ")),
    )
    .join("\n");
}

const NAME = String.raw`\p{Lu}[\p{L}.'’\-]+(?:\s+(?:\p{Lu}[\p{L}.'’\-]*|van|von|de|der|da|di|la|le|del|bin|al))*\s+\p{Lu}[\p{L}'’\-]+`;
// No "i" flag: with it, \p{Lu} would also match lowercase letters.
const BYLINE = new RegExp(String.raw`^(?:By|BY|by)[:\s]+(${NAME}(?:\s*(?:,|and|AND|&)\s*${NAME})*)\s*(?:[|,•·\-–—].{0,60})?$`, "u");

/** "By Jane Smith and John Doe" lines near the top of the page. */
export function bylineFromParagraphs(paragraphs: string[]): string[] {
  for (const p of paragraphs.slice(0, 60)) {
    if (p.length > 160) continue;
    const m = BYLINE.exec(p.trim());
    if (m) return m[1].split(/\s*(?:,|\band\b|\bAND\b|&)\s*/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2);
  }
  return [];
}

const DATE_LINE = /^(?:(?:published|posted|updated|last updated|date)[:\s]+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i;

/** A publication-date line near the top of the page ("December 26, 2023, 5:00 AM PST"). */
export function dateFromParagraphs(paragraphs: string[]): string | undefined {
  for (const p of paragraphs.slice(0, 40)) {
    if (p.length > 80 || /updated/i.test(p)) continue;
    const m = DATE_LINE.exec(p.trim());
    if (m) return m[1];
    // a line that is only "March 2002" (report cover pages)
    const my = /^((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(?:19|20)\d{2})$/i.exec(p.trim());
    if (my) return my[1];
  }
  return undefined;
}

const CHALLENGE = /(just a moment|attention required|verify you are human|enable javascript and cookies|captcha|access denied|are you a robot)/i;

export async function fetchDirect(rawUrl: string): Promise<FetchedSource> {
  const url = new URL(rawUrl);
  const base: FetchedSource = { ok: false, url: rawUrl, finalUrl: rawUrl, method: "direct", format: "html", text: "", paragraphs: [], metadata: { authors: [] } };
  if (!["http:", "https:"].includes(url.protocol)) return { ...base, error: "Only http(s) URLs can be fetched.", blocked: "unsupported" };
  if (!(await robotsAllows(url))) return { ...base, error: "The site's robots.txt disallows automated access to this page.", blocked: "robots" };
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": FETCH_UA, accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return { ...base, error: `Could not connect: ${e instanceof Error ? e.message : String(e)}`, blocked: "http_error" };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const out: FetchedSource = { ...base, finalUrl: res.url || rawUrl, httpStatus: res.status, contentType };
  if (!res.ok) return { ...out, error: `HTTP ${res.status}`, blocked: res.status === 403 || res.status === 429 ? "bot_protection" : res.status === 401 || res.status === 402 ? "paywall" : "http_error" };
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > 30 * 1024 * 1024) return { ...out, error: "File too large.", blocked: "unsupported" };
  const isPdf = contentType.includes("pdf") || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);
  if (isPdf) return { ...out, ...(await pdfSource(buf)) };
  const html = new TextDecoder("utf-8").decode(buf);
  if (contentType.includes("text/plain")) {
    const paragraphs = paragraphsOf(html);
    return { ...out, ok: true, format: "plain", text: paragraphs.join("\n\n"), paragraphs };
  }
  const { document } = parseHTML(html);
  const metadata = extractHtmlMetadata(document as unknown as Document);
  let text = "";
  try {
    const article = new Readability(document as unknown as Document, { charThreshold: 400 }).parse();
    const content = article?.content ?? "";
    // Readability HTML → paragraphs (block elements become blank-line separated).
    const { document: d2 } = parseHTML(`<!doctype html><html><body>${content}</body></html>`);
    const blocks = Array.from(d2.querySelectorAll("p, li, h1, h2, h3, h4, blockquote, pre, td")) as unknown as HTMLElement[];
    text = blocks
      .map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0)
      .join("\n\n");
    if (!metadata.title && article?.title) metadata.title = article.title;
    if (!metadata.authors.length && article?.byline) metadata.authors = [article.byline.replace(/^by\s+/i, "").trim()];
    if (!metadata.siteName && article?.siteName) metadata.siteName = article.siteName;
    if (!metadata.siteName) {
      const parts = (document.querySelector("title")?.textContent ?? "").split(/\s+[|–—]\s+|\s+-\s+/);
      if (parts.length > 1 && parts[parts.length - 1].trim().length < 60) metadata.siteName = parts[parts.length - 1].trim();
    }
  } catch {
    text = "";
  }
  if (text.length < 400) {
    const title = document.querySelector("title")?.textContent ?? "";
    if (CHALLENGE.test(title) || CHALLENGE.test(html.slice(0, 5000))) return { ...out, metadata, error: "The site served a bot-protection page instead of the article.", blocked: "bot_protection" };
    return { ...out, metadata, error: "Too little readable text (likely requires JavaScript or is paywalled).", blocked: "empty" };
  }
  const paragraphs = paragraphsOf(text);
  if (!metadata.authors.length) metadata.authors = bylineFromParagraphs(paragraphs);
  if (!metadata.published) metadata.published = dateFromParagraphs(paragraphs);
  return { ...out, ok: true, text: paragraphs.join("\n\n"), paragraphs, metadata };
}

/** Fallback through Anthropic's web_fetch tool (returns the page text, respects robots.txt). */
export async function fetchViaAnthropic(rawUrl: string): Promise<FetchedSource> {
  const base: FetchedSource = { ok: false, url: rawUrl, finalUrl: rawUrl, method: "anthropic_web_fetch", format: "html", text: "", paragraphs: [], metadata: { authors: [] } };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ...base, error: "No Anthropic key for fallback fetch." };
  const client = new Anthropic({ apiKey: key, baseURL: "https://api.anthropic.com" });
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1, max_content_tokens: 60000 } as never],
      messages: [{ role: "user", content: `Fetch ${rawUrl} and reply only with DONE.` }],
    });
    for (const b of res.content as unknown as { type: string; content?: { type: string; url?: string; error_code?: string; content?: { title?: string; source?: { type: string; data?: string; media_type?: string } } } }[]) {
      if (b.type !== "web_fetch_tool_result" || !b.content) continue;
      const c = b.content;
      if (c.type !== "web_fetch_result" || !c.content?.source) return { ...base, error: `web_fetch: ${c.error_code ?? "failed"}`, blocked: c.error_code === "url_not_allowed" ? "robots" : "http_error" };
      const src = c.content.source;
      if (src.type === "base64" && src.media_type === "application/pdf" && src.data) {
        const pdf = await pdfSource(new Uint8Array(Buffer.from(src.data, "base64")));
        return { ...base, ...pdf, finalUrl: c.url ?? rawUrl, metadata: { ...pdf.metadata, title: pdf.metadata.title ?? c.content.title } };
      }
      const raw = src.data ?? "";
      // The tool prefixes page metadata as "---"-delimited "key: value" lines, then the page as Markdown.
      let body = raw;
      const md: SourceMetadata = { authors: [], title: c.content.title };
      const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
      if (m) {
        body = raw.slice(m[0].length);
        for (const line of m[1].split("\n")) {
          const kv = /^([\w:.\-]+):\s*(.*)$/.exec(line.trim());
          if (!kv) continue;
          const k = kv[1].toLowerCase().replace(/^meta-/, "");
          const v = kv[2].trim();
          if (!v) continue;
          if (k === "canonical") md.canonicalUrl = v;
          else if (["citation_author", "author", "dc.creator", "parsely-author", "sailthru.author"].includes(k) && !/^https?:/.test(v)) md.authors.push(v);
          else if (["citation_publication_date", "citation_date", "article:published_time", "dc.date", "dc.date.issued", "datepublished", "pubdate", "date"].includes(k)) md.published = md.published ?? v;
          else if (k === "og:site_name") md.siteName = v;
          else if (["citation_journal_title", "citation_publisher", "dc.publisher"].includes(k)) md.publisher = md.publisher ?? v;
          else if (k === "citation_doi") md.doi = v.replace(/^doi:/i, "");
          else if (["citation_title", "og:title"].includes(k)) md.title = md.title ?? v;
          else if (k === "description") md.description = v;
          else if (k === "title") {
            const parts = v.split(/\s+[|–—]\s+|\s+-\s+/);
            if (parts.length > 1) md.siteName = md.siteName ?? parts[parts.length - 1].trim();
          }
        }
        md.authors = splitAuthors([...new Set(md.authors)]);
      }
      const paragraphs = paragraphsOf(markdownToText(body));
      const text = paragraphs.join("\n\n");
      if (!md.authors.length) md.authors = bylineFromParagraphs(paragraphs);
      if (!md.published) md.published = dateFromParagraphs(paragraphs);
      const ok = text.trim().length > 200;
      return { ...base, ok, finalUrl: c.url ?? rawUrl, text, paragraphs, metadata: md, error: ok ? undefined : "Empty page", notes: ["Fetched through Anthropic web_fetch (page converted to text by the tool)"] };
    }
    return { ...base, error: "web_fetch returned no result" };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchSource(url: string): Promise<FetchedSource> {
  const direct = await fetchDirect(url);
  if (direct.ok) return direct;
  if (direct.blocked === "robots" || direct.blocked === "paywall") return direct; // respect the site's decision
  const viaTool = await fetchViaAnthropic(url);
  if (viaTool.ok) return { ...viaTool, metadata: { ...direct.metadata, ...viaTool.metadata, authors: viaTool.metadata.authors.length ? viaTool.metadata.authors : direct.metadata.authors } };
  return { ...direct, error: `${direct.error ?? "direct fetch failed"}; fallback: ${viaTool.error ?? "failed"}` };
}
