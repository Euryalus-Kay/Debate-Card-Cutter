/**
 * DOCX → paragraphs with resolved run formatting.
 *
 * Reads word/document.xml and word/styles.xml directly so that underline,
 * bold, highlight colors, font sizes, character styles (Verbatim's
 * "Style Underline", "Emphasis", cite styles) and heading levels (Pocket /
 * Hat / Block / Tag) survive. No text is ever produced by a model here.
 */

import { unzipSync, strFromU8 } from "fflate";
import { tokenize } from "./xml";
import type { HighlightColor } from "@/domain/card";

export interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: HighlightColor;
  /** half-points, as stored in OOXML */
  size?: number;
  border?: boolean;
  strike?: boolean;
  vanish?: boolean;
}

export interface StyleDef {
  id: string;
  name: string;
  type: "paragraph" | "character" | "table" | "numbering";
  basedOn?: string;
  outlineLevel?: number;
  rPr: RunProps;
}

export interface DocRun {
  text: string;
  props: RunProps;
  /** character style id, if any */
  charStyle?: string;
  charStyleName?: string;
  /** Verbatim-style emphasis (bold + underline + box, or a style named Emphasis) */
  emphasis: boolean;
}

export interface DocParagraph {
  index: number;
  styleId?: string;
  styleName?: string;
  /** 1 = Pocket, 2 = Hat, 3 = Block, 4 = Tag; 0 = body text */
  headingLevel: 0 | 1 | 2 | 3 | 4;
  runs: DocRun[];
  text: string;
  inTable: boolean;
}

export interface ParsedDocx {
  paragraphs: DocParagraph[];
  styles: Map<string, StyleDef>;
  warnings: string[];
  stats: { paragraphs: number; characters: number; underlinedChars: number; highlightedChars: number };
}

const HIGHLIGHT_NAMES: Record<string, HighlightColor> = {
  yellow: "yellow",
  cyan: "cyan",
  green: "green",
  brightGreen: "green",
  magenta: "magenta",
  red: "red",
  blue: "blue",
  darkYellow: "darkYellow",
  lightGray: "lightGray",
  darkGray: "gray",
  gray: "gray",
};

const SHADE_HEX: Record<string, HighlightColor> = {
  FFFF00: "yellow",
  "00FFFF": "cyan",
  "00FF00": "green",
  FF00FF: "magenta",
  FF0000: "red",
  "0000FF": "blue",
  "808000": "darkYellow",
  C0C0C0: "lightGray",
  D9D9D9: "lightGray",
  BFBFBF: "lightGray",
  "808080": "gray",
};

function boolVal(attrs: Record<string, string>): boolean {
  const v = attrs["w:val"];
  return v === undefined || !(v === "0" || v === "false" || v === "off" || v === "none");
}

/** Apply a run-property element to a props object. */
function applyRPrElement(props: RunProps, name: string, attrs: Record<string, string>) {
  switch (name) {
    case "w:b":
      props.bold = boolVal(attrs);
      break;
    case "w:i":
      props.italic = boolVal(attrs);
      break;
    case "w:u": {
      const v = attrs["w:val"];
      props.underline = !!v && v !== "none";
      if (v === undefined) props.underline = true;
      break;
    }
    case "w:highlight": {
      const v = attrs["w:val"];
      if (!v || v === "none") props.highlight = undefined;
      else props.highlight = HIGHLIGHT_NAMES[v] ?? "yellow";
      break;
    }
    case "w:shd": {
      const fill = (attrs["w:fill"] ?? "").toUpperCase();
      if (fill && fill !== "AUTO" && fill !== "FFFFFF" && SHADE_HEX[fill]) props.highlight = props.highlight ?? SHADE_HEX[fill];
      break;
    }
    case "w:sz":
      if (attrs["w:val"]) props.size = Number(attrs["w:val"]);
      break;
    case "w:bdr":
      props.border = attrs["w:val"] !== undefined && attrs["w:val"] !== "none" && attrs["w:val"] !== "nil";
      break;
    case "w:strike":
    case "w:dstrike":
      props.strike = boolVal(attrs);
      break;
    case "w:vanish":
      props.vanish = boolVal(attrs);
      break;
  }
}

function parseStyles(xml: string | undefined): { styles: Map<string, StyleDef>; defaults: RunProps } {
  const styles = new Map<string, StyleDef>();
  const defaults: RunProps = {};
  if (!xml) return { styles, defaults };
  let cur: StyleDef | null = null;
  let inRPr = false;
  let inDefaultsRPr = false;
  let inRPrDefault = false;
  for (const t of tokenize(xml)) {
    if (t.type === "open") {
      switch (t.name) {
        case "w:rPrDefault":
          inRPrDefault = true;
          break;
        case "w:style":
          cur = {
            id: t.attrs["w:styleId"] ?? "",
            name: "",
            type: (t.attrs["w:type"] as StyleDef["type"]) ?? "paragraph",
            rPr: {},
          };
          break;
        case "w:name":
          if (cur) cur.name = t.attrs["w:val"] ?? "";
          break;
        case "w:basedOn":
          if (cur) cur.basedOn = t.attrs["w:val"];
          break;
        case "w:outlineLvl":
          if (cur) cur.outlineLevel = Number(t.attrs["w:val"]);
          break;
        case "w:rPr":
          if (cur) inRPr = true;
          else if (inRPrDefault) inDefaultsRPr = true;
          if (t.selfClosing) inRPr = inDefaultsRPr = false;
          break;
        default:
          if (inRPr && cur) applyRPrElement(cur.rPr, t.name, t.attrs);
          else if (inDefaultsRPr) applyRPrElement(defaults, t.name, t.attrs);
      }
    } else if (t.type === "close") {
      if (t.name === "w:style" && cur) {
        styles.set(cur.id, cur);
        cur = null;
      } else if (t.name === "w:rPr") {
        inRPr = false;
        inDefaultsRPr = false;
      } else if (t.name === "w:rPrDefault") inRPrDefault = false;
    }
  }
  return { styles, defaults };
}

function resolveStyleChain(styles: Map<string, StyleDef>, id: string | undefined): StyleDef[] {
  const chain: StyleDef[] = [];
  const seen = new Set<string>();
  let cur = id ? styles.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.basedOn ? styles.get(cur.basedOn) : undefined;
  }
  return chain;
}

function mergedRPr(styles: Map<string, StyleDef>, id: string | undefined): RunProps {
  const out: RunProps = {};
  for (const s of resolveStyleChain(styles, id)) Object.assign(out, stripUndefined(s.rPr));
  return out;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (r as Record<string, unknown>)[k] = v;
  return r;
}

const HEADING_NAME_LEVEL: Array<[RegExp, 1 | 2 | 3 | 4]> = [
  [/\bpocket\b/i, 1],
  [/\bhat\b/i, 2],
  [/\bblock\b/i, 3],
  [/\btag\b/i, 4],
  [/^heading\s*1\b/i, 1],
  [/^heading\s*2\b/i, 2],
  [/^heading\s*3\b/i, 3],
  [/^heading\s*4\b/i, 4],
];

export function headingLevelFor(styles: Map<string, StyleDef>, styleId: string | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!styleId) return 0;
  const chain = resolveStyleChain(styles, styleId).reverse();
  for (const s of chain) {
    // Style names can carry aliases: "Heading 4,Tag,Big card"
    for (const alias of s.name.split(",").map((a) => a.trim())) {
      for (const [re, lvl] of HEADING_NAME_LEVEL) if (re.test(alias)) return lvl;
    }
    if (s.outlineLevel !== undefined && s.outlineLevel >= 0 && s.outlineLevel <= 3) return (s.outlineLevel + 1) as 1 | 2 | 3 | 4;
  }
  // Built-in heading ids when styles.xml lacks names
  const m = /^Heading([1-4])$/i.exec(styleId);
  if (m) return Number(m[1]) as 1 | 2 | 3 | 4;
  return 0;
}

function isEmphasisStyle(name: string | undefined): boolean {
  return !!name && /emphasis|emph\b/i.test(name) && !/subtle|intense quote/i.test(name);
}

function isUnderlineStyle(name: string | undefined): boolean {
  return !!name && /underline/i.test(name);
}

const SKIP_CONTAINERS = new Set(["w:drawing", "w:pict", "mc:Fallback", "w:object", "w:instrText", "w:delText", "w:del", "w:footnoteReference", "w:endnoteReference", "w:commentReference"]);

export function parseDocx(bytes: Uint8Array): ParsedDocx {
  const warnings: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => f.name === "word/document.xml" || f.name === "word/styles.xml",
    });
  } catch {
    throw new DocxError("This file is not a valid .docx (zip) file. If it is an old .doc file, open it in Word and save it as .docx.");
  }
  const docXml = files["word/document.xml"];
  if (!docXml) throw new DocxError("The .docx has no main document part (word/document.xml).");
  const { styles, defaults } = parseStyles(files["word/styles.xml"] ? strFromU8(files["word/styles.xml"]) : undefined);
  const xml = strFromU8(docXml);

  const paragraphs: DocParagraph[] = [];
  let para: DocParagraph | null = null;
  let paraStyleId: string | undefined;
  let run: { text: string; direct: RunProps; charStyle?: string } | null = null;
  let inRPr = false;
  let inPPr = false;
  let skipDepth = 0;
  let tableDepth = 0;
  let inText = false;

  const finishRun = () => {
    if (!run || !para) return;
    if (run.text) {
      const paraProps = mergedRPr(styles, paraStyleId);
      const charStyle = run.charStyle ? styles.get(run.charStyle) : undefined;
      const charProps = mergedRPr(styles, run.charStyle);
      const props: RunProps = { ...stripUndefined(defaults), ...stripUndefined(paraProps), ...stripUndefined(charProps), ...stripUndefined(run.direct) };
      if (isUnderlineStyle(charStyle?.name) && props.underline === undefined) props.underline = true;
      const emphasis = isEmphasisStyle(charStyle?.name) || (!!props.bold && !!props.underline && !!props.border);
      if (!props.vanish) {
        para.runs.push({ text: run.text, props, charStyle: run.charStyle, charStyleName: charStyle?.name, emphasis });
      }
    }
    run = null;
  };

  for (const t of tokenize(xml)) {
    if (t.type === "open") {
      if (skipDepth > 0) {
        if (!t.selfClosing && SKIP_CONTAINERS.has(t.name)) skipDepth++;
        continue;
      }
      if (SKIP_CONTAINERS.has(t.name)) {
        if (!t.selfClosing) skipDepth = 1;
        continue;
      }
      switch (t.name) {
        case "w:tbl":
          if (!t.selfClosing) tableDepth++;
          break;
        case "w:p":
          if (para) {
            // Nested paragraph (e.g. text box) — flush the current one first.
            finishRun();
            paragraphs.push(finalizeParagraph(para, styles, paraStyleId));
          }
          para = { index: paragraphs.length, headingLevel: 0, runs: [], text: "", inTable: tableDepth > 0 };
          paraStyleId = undefined;
          if (t.selfClosing) {
            paragraphs.push(finalizeParagraph(para, styles, paraStyleId));
            para = null;
          }
          break;
        case "w:pPr":
          inPPr = !t.selfClosing;
          break;
        case "w:pStyle":
          if (inPPr) paraStyleId = t.attrs["w:val"];
          break;
        case "w:r":
          if (para) run = { text: "", direct: {} };
          if (t.selfClosing) run = null;
          break;
        case "w:rPr":
          inRPr = !!run && !t.selfClosing;
          break;
        case "w:rStyle":
          if (run && inRPr) run.charStyle = t.attrs["w:val"];
          break;
        case "w:t":
          inText = !!run && !t.selfClosing;
          break;
        case "w:tab":
          if (run && !inRPr && !inPPr) run.text += "\t";
          break;
        case "w:br":
        case "w:cr":
          if (run && !inRPr) run.text += "\n";
          break;
        case "w:noBreakHyphen":
          if (run) run.text += "-";
          break;
        case "w:sym":
          break;
        default:
          if (run && inRPr) applyRPrElement(run.direct, t.name, t.attrs);
      }
    } else if (t.type === "close") {
      if (skipDepth > 0) {
        if (SKIP_CONTAINERS.has(t.name)) skipDepth--;
        continue;
      }
      switch (t.name) {
        case "w:tbl":
          tableDepth = Math.max(0, tableDepth - 1);
          break;
        case "w:t":
          inText = false;
          break;
        case "w:rPr":
          inRPr = false;
          break;
        case "w:pPr":
          inPPr = false;
          break;
        case "w:r":
          finishRun();
          break;
        case "w:p":
          finishRun();
          if (para) {
            paragraphs.push(finalizeParagraph(para, styles, paraStyleId));
            para = null;
          }
          break;
      }
    } else if (inText && run && skipDepth === 0) {
      run.text += t.text;
    }
  }
  if (para) paragraphs.push(finalizeParagraph(para, styles, paraStyleId));
  paragraphs.forEach((p, i) => (p.index = i));

  let characters = 0;
  let underlinedChars = 0;
  let highlightedChars = 0;
  for (const p of paragraphs) {
    for (const r of p.runs) {
      characters += r.text.length;
      if (r.props.underline || r.emphasis) underlinedChars += r.text.length;
      if (r.props.highlight) highlightedChars += r.text.length;
    }
  }
  if (characters === 0) warnings.push("The document contains no text. If it is a scanned document, upload the PDF instead so it can be OCR'd.");
  return { paragraphs, styles, warnings, stats: { paragraphs: paragraphs.length, characters, underlinedChars, highlightedChars } };
}

function finalizeParagraph(p: DocParagraph, styles: Map<string, StyleDef>, styleId: string | undefined): DocParagraph {
  // Merge adjacent runs with identical formatting.
  const merged: DocRun[] = [];
  for (const r of p.runs) {
    const last = merged[merged.length - 1];
    if (last && sameFormat(last, r)) last.text += r.text;
    else merged.push({ ...r });
  }
  const style = styleId ? styles.get(styleId) : undefined;
  return {
    ...p,
    styleId,
    styleName: style?.name,
    headingLevel: headingLevelFor(styles, styleId),
    runs: merged,
    text: merged.map((r) => r.text).join(""),
  };
}

function sameFormat(a: DocRun, b: DocRun): boolean {
  return (
    !!a.props.bold === !!b.props.bold &&
    !!a.props.underline === !!b.props.underline &&
    a.props.highlight === b.props.highlight &&
    a.props.size === b.props.size &&
    !!a.props.italic === !!b.props.italic &&
    a.emphasis === b.emphasis &&
    a.charStyle === b.charStyle
  );
}

export class DocxError extends Error {}
