/**
 * PDF text extraction. Text-layer PDFs are extracted directly; if a PDF has
 * little or no text layer it is reported as probably scanned so the caller can
 * offer OCR (clearly labeled as machine-transcribed) instead of silently
 * accepting empty or scrambled text.
 */

import { extractText, getDocumentProxy, getMeta } from "unpdf";

export interface PdfExtraction {
  pages: string[];
  text: string;
  pageCount: number;
  /** characters per page on average */
  density: number;
  likelyScanned: boolean;
  warnings: string[];
  /** document info dictionary (Title, Author, ...) — file metadata, not necessarily the publication's */
  info: { title?: string; author?: string };
}

export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 } as never);
  let info: Record<string, unknown> = {};
  try {
    info = ((await getMeta(pdf)).info ?? {}) as Record<string, unknown>;
  } catch {
    /* no metadata */
  }
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+\n/g, "\n"));
  const total = pages.reduce((a, p) => a + p.trim().length, 0);
  const density = totalPages ? total / totalPages : 0;
  const warnings: string[] = [];
  const likelyScanned = density < 200;
  if (likelyScanned) warnings.push(`Only ${Math.round(density)} characters of text per page: this PDF is probably scanned images. OCR is needed, and OCR text must be checked against the page images.`);
  const replacementChars = (pages.join("").match(/�/g) ?? []).length;
  if (replacementChars > 20) warnings.push("The PDF's text layer contains unreadable characters (font encoding problems). Quotes from it may not match the visible page.");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { pages, text: pages.join("\n\n"), pageCount: totalPages, density, likelyScanned, warnings, info: { title: str(info.Title), author: str(info.Author) } };
}

/**
 * Rebuild paragraphs from PDF page text (one text line per "\n").
 * - drops page-number lines and running headers/footers (page furniture);
 * - joins lines within a paragraph, removing end-of-line hyphenation between
 *   lowercase letters (the same rule the verifier applies);
 * - a paragraph ends at a short line with closing punctuation, or before a
 *   heading / list item; paragraphs continuing across a page break are joined.
 * Returns each paragraph with the (1-based) PDF pages it came from.
 */
export function pdfParagraphs(pages: string[]): { text: string; pages: [number, number] }[] {
  const pageLines = pages.map((p) => p.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()));
  // Running headers/footers: identical first/last lines (digits masked) on at least half the pages.
  const edgeCounts = new Map<string, number>();
  const mask = (l: string) => l.replace(/\d+/g, "#").toLowerCase();
  for (const lines of pageLines) {
    const nonEmpty = lines.filter(Boolean);
    for (const l of new Set([...nonEmpty.slice(0, 2), ...nonEmpty.slice(-2)].map(mask))) edgeCounts.set(l, (edgeCounts.get(l) ?? 0) + 1);
  }
  const furniture = (l: string, atEdge: boolean) => {
    if (/^(page\s*)?[#\divxlc]{1,6}(\s*(of|\/)\s*\d+)?$/i.test(l)) return true;
    return atEdge && pages.length >= 4 && (edgeCounts.get(mask(l)) ?? 0) >= Math.max(3, pages.length / 2);
  };
  const out: { text: string; pages: [number, number] }[] = [];
  let cur: { lines: string[]; start: number; end: number } | null = null;
  const flush = () => {
    if (cur && cur.lines.length) out.push({ text: joinLines(cur.lines), pages: [cur.start, cur.end] });
    cur = null;
  };
  pageLines.forEach((lines, pi) => {
    const pageNo = pi + 1;
    const nonEmptyIdx = lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
    const edge = new Set([...nonEmptyIdx.slice(0, 2), ...nonEmptyIdx.slice(-2)]);
    const kept = lines.filter((l, i) => l && !furniture(l, edge.has(i)));
    const lens = kept.map((l) => l.length).sort((a, b) => a - b);
    const typical = lens.length ? lens[Math.floor(lens.length * 0.75)] : 80;
    kept.forEach((line, li) => {
      const startsBlock = /^([•▪◦●\-–]|\(?[0-9]{1,2}[.)]|\(?[a-z][.)])\s/.test(line);
      if (cur && startsBlock) flush();
      if (!cur) {
        // continuation across a page break: previous paragraph unfinished and this line starts lowercase
        const prev = out[out.length - 1];
        if (li === 0 && prev && !/[.!?:;"”)\]]$/.test(prev.text) && /^[\p{Ll}(]/u.test(line)) {
          out.pop();
          cur = { lines: [prev.text], start: prev.pages[0], end: pageNo };
        } else cur = { lines: [], start: pageNo, end: pageNo };
      }
      cur.lines.push(line);
      cur.end = pageNo;
      const next = kept[li + 1];
      const short = line.length < typical * 0.8;
      const closes = /[.!?:"”)\]]$/.test(line);
      const heading = line.length < 90 && !/[.,;]$/.test(line) && next !== undefined && /^[\p{Lu}\d]/u.test(next) && cur.lines.length === 1 && line.length < typical * 0.7;
      if ((short && closes) || heading) flush();
    });
    // page end: keep the paragraph open only if it looks unfinished (handled at next page start)
    flush();
  });
  flush();
  return out.filter((p) => p.text.length > 0);
}

function joinLines(lines: string[]): string {
  let s = "";
  for (const l of lines) {
    if (!s) s = l;
    else if (/[\p{Ll}]-$/u.test(s) && /^\p{Ll}/u.test(l)) s = s.slice(0, -1) + l;
    else s += ` ${l}`;
  }
  return s;
}
