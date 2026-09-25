/**
 * DOCX writer producing Verbatim-compatible documents.
 *
 * Paragraph styles use Word's built-in heading IDs (Heading1..Heading4) with
 * Verbatim's aliases (Pocket, Hat, Block, Tag) so the navigation pane and
 * Verbatim macros work. Card formatting uses character styles for cite,
 * underline, and emphasis plus w:highlight for highlighting. Unread text can be
 * shrunk, as debaters do.
 */

import { zipSync, strToU8 } from "fflate";
import type { BodyBlock, HighlightColor } from "@/domain/card";
import { normalizeHighlights, normalizeSpans } from "@/domain/card";

export type OutlineLevel = 1 | 2 | 3 | 4;

export type ExportNode =
  | { kind: "heading"; level: OutlineLevel; text: string }
  | { kind: "card"; tag: string; shortCite: string; fullCite: string; body: BodyBlock[]; note?: string }
  | { kind: "analytic"; text: string; asTag?: boolean }
  | { kind: "paragraph"; text: string };

export interface ExportOptions {
  title?: string;
  /** shrink text that is not underlined/highlighted (points) */
  shrinkUnderlinedTo?: number | null;
  /** base font size for card text (points) */
  bodySize?: number;
  font?: string;
}

const DEFAULTS: Required<Omit<ExportOptions, "title">> = { shrinkUnderlinedTo: 8, bodySize: 11, font: "Calibri" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Text run with preserved whitespace; tabs/newlines converted to OOXML elements. */
function textRun(text: string, rPr: string): string {
  const parts: string[] = [];
  const segs = text.split(/(\t|\n)/);
  for (const seg of segs) {
    if (seg === "\t") parts.push("<w:tab/>");
    else if (seg === "\n") parts.push("<w:br/>");
    else if (seg) parts.push(`<w:t xml:space="preserve">${esc(seg)}</w:t>`);
  }
  if (!parts.length) return "";
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}${parts.join("")}</w:r>`;
}

function para(styleId: string | null, runs: string, extraPPr = ""): string {
  const pPr = styleId || extraPPr ? `<w:pPr>${styleId ? `<w:pStyle w:val="${styleId}"/>` : ""}${extraPPr}</w:pPr>` : "";
  return `<w:p>${pPr}${runs}</w:p>`;
}

const HL_NAME: Record<HighlightColor, string> = {
  yellow: "yellow",
  cyan: "cyan",
  green: "green",
  magenta: "magenta",
  gray: "darkGray",
  red: "red",
  blue: "blue",
  darkYellow: "darkYellow",
  lightGray: "lightGray",
};

/** Render one text block into runs by splitting at every span boundary. */
function bodyRuns(block: Extract<BodyBlock, { kind: "text" }>, o: Required<Omit<ExportOptions, "title">>): string {
  const len = block.text.length;
  const ul = normalizeSpans([...block.underline], len);
  const em = normalizeSpans([...block.emphasis], len);
  const hl = normalizeHighlights([...block.highlight], len);
  const cuts = new Set<number>([0, len]);
  for (const s of [...ul, ...em, ...hl]) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const inAny = (spans: { start: number; end: number }[], pos: number) => spans.find((s) => pos >= s.start && pos < s.end);
  let out = "";
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k];
    const b = points[k + 1];
    if (b <= a) continue;
    const seg = block.text.slice(a, b);
    const isEm = !!inAny(em, a);
    const isUl = !!inAny(ul, a) || isEm;
    const h = inAny(hl, a) as { color: HighlightColor } | undefined;
    let rPr = "";
    if (isEm) rPr += `<w:rStyle w:val="Emphasis"/>`;
    else if (isUl) rPr += `<w:rStyle w:val="StyleUnderline"/>`;
    if (h) rPr += `<w:highlight w:val="${HL_NAME[h.color] ?? "yellow"}"/>`;
    if (!isUl && !h && o.shrinkUnderlinedTo) rPr += `<w:sz w:val="${o.shrinkUnderlinedTo * 2}"/><w:szCs w:val="${o.shrinkUnderlinedTo * 2}"/>`;
    out += textRun(seg, rPr);
  }
  return out;
}

export function renderDocumentXml(nodes: ExportNode[], opts: ExportOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const body: string[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case "heading":
        body.push(para(`Heading${n.level}`, textRun(n.text, "")));
        break;
      case "analytic":
        body.push(para(n.asTag === false ? null : "Heading4", textRun(n.text, "")));
        break;
      case "paragraph":
        body.push(para(null, textRun(n.text, "")));
        break;
      case "card": {
        body.push(para("Heading4", textRun(n.tag, "")));
        const cite = textRun(n.shortCite, `<w:rStyle w:val="Style13ptBold"/>`) + (n.fullCite ? textRun(` ${n.fullCite}`, "") : "");
        body.push(para(null, cite));
        // Group text blocks into paragraphs; omissions/insertions inline.
        let current = "";
        const flush = () => {
          if (current) body.push(para(null, current));
          current = "";
        };
        n.body.forEach((b, idx) => {
          if (b.kind === "text") {
            if (b.newParagraph) flush();
            else if (current) current += textRun(" ", "");
            current += bodyRuns(b, o);
          } else if (b.kind === "omission") {
            const next = n.body.slice(idx + 1).find((x) => x.kind === "text");
            if (!next || (next.kind === "text" && next.newParagraph)) {
              // Omission between paragraphs: its own line, so it is never mistaken for source text.
              flush();
              body.push(para(null, textRun(b.marker, "")));
            } else {
              current += textRun(`${current ? " " : ""}${b.marker}`, "");
            }
          } else {
            current += textRun(`[${b.text}]`, b.read ? `<w:rStyle w:val="StyleUnderline"/>` : "");
          }
        });
        flush();
        if (n.note) body.push(para(null, textRun(n.note, "<w:i/>")));
        break;
      }
    }
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
  );
}

/**
 * Styles modeled on Verbatim's defaults: Pocket/Hat/Block/Tag as Heading 1–4
 * and character styles for cites ("Style 13 pt Bold"), underline
 * ("Style Underline"), and "Emphasis".
 */
export function renderStylesXml(opts: ExportOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const f = esc(o.font);
  const sz = o.bodySize * 2;
  const heading = (n: number, alias: string, size: number, extraP = "", extraR = "") =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n},${alias}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="${n + 8}"/><w:unhideWhenUsed/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n <= 2 ? 240 : 40}" w:after="0"/>${extraP}<w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:b/><w:bCs/><w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/>${extraR}</w:rPr></w:style>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:eastAsia="${f}" w:hAnsi="${f}" w:cs="Times New Roman"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>` +
    heading(1, "Pocket", 26, `<w:pBdr><w:top w:val="double" w:sz="4" w:space="1" w:color="auto"/><w:left w:val="double" w:sz="4" w:space="4" w:color="auto"/><w:bottom w:val="double" w:sz="4" w:space="1" w:color="auto"/><w:right w:val="double" w:sz="4" w:space="4" w:color="auto"/></w:pBdr><w:jc w:val="center"/>`) +
    heading(2, "Hat", 22, `<w:pageBreakBefore/><w:jc w:val="center"/>`, `<w:u w:val="double"/>`) +
    heading(3, "Block", 16, `<w:jc w:val="center"/>`) +
    heading(4, "Tag", 13) +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    `<w:style w:type="character" w:styleId="Style13ptBold"><w:name w:val="Style 13 pt Bold,Cite"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="1"/><w:qFormat/><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="StyleUnderline"><w:name w:val="Style Underline,Underline"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="1"/><w:qFormat/><w:rPr><w:b/><w:bCs/><w:sz w:val="${sz}"/><w:u w:val="single"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="7"/><w:qFormat/><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}"/><w:b/><w:iCs/><w:sz w:val="${sz}"/><w:u w:val="single"/><w:bdr w:val="single" w:sz="12" w:space="0" w:color="auto"/></w:rPr></w:style>` +
    `</w:styles>`
  );
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

function coreXml(title: string): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Clash</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}
const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Clash</Application></Properties>`;

export function buildDocx(nodes: ExportNode[], opts: ExportOptions = {}): Uint8Array {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(ROOT_RELS),
      "word/document.xml": strToU8(renderDocumentXml(nodes, opts)),
      "word/styles.xml": strToU8(renderStylesXml(opts)),
      "word/_rels/document.xml.rels": strToU8(DOC_RELS),
      "docProps/core.xml": strToU8(coreXml(opts.title ?? "Speech document")),
      "docProps/app.xml": strToU8(APP_XML),
    },
    { level: 6 },
  );
}
