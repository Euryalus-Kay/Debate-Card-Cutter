/**
 * Pasted rich text (Word / Google Docs / web clipboard HTML) → paragraphs
 * with run formatting, the same shape the DOCX parser produces.
 */

import { parseHTML } from "linkedom";
import type { HighlightColor } from "@/domain/card";
import type { DocParagraph, DocRun, RunProps } from "./docx";

const BLOCK = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TR", "SECTION", "ARTICLE", "PRE"]);

const NAMED_HL: Record<string, HighlightColor> = { yellow: "yellow", cyan: "cyan", aqua: "cyan", lime: "green", green: "green", magenta: "magenta", fuchsia: "magenta", red: "red", blue: "blue", gray: "gray", grey: "gray", silver: "lightGray", lightgray: "lightGray", olive: "darkYellow" };

function colorToHighlight(value: string): HighlightColor | undefined {
  const v = value.trim().toLowerCase();
  if (!v || v === "transparent" || v === "white" || v === "#ffffff" || v === "#fff" || v === "rgb(255, 255, 255)" || v === "inherit" || v === "initial") return undefined;
  if (NAMED_HL[v]) return NAMED_HL[v];
  let r = 0,
    g = 0,
    b = 0;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return undefined;
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  } else return undefined;
  if (r > 200 && g > 200 && b < 140) return "yellow";
  if (r < 140 && g > 200 && b > 200) return "cyan";
  if (r < 160 && g > 200 && b < 160) return "green";
  if (r > 200 && g < 160 && b > 200) return "magenta";
  if (r > 200 && g < 150 && b < 150) return "red";
  if (r < 150 && g < 180 && b > 200) return "blue";
  if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && r < 235) return r > 180 ? "lightGray" : "gray";
  return undefined;
}

function styleProps(el: Element, inherited: RunProps): RunProps {
  const p: RunProps = { ...inherited };
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") p.bold = true;
  if (tag === "I" || tag === "EM") p.italic = true;
  if (tag === "U" || tag === "INS") p.underline = true;
  if (tag === "MARK") p.highlight = "yellow";
  const style = (el.getAttribute("style") ?? "").toLowerCase();
  if (style) {
    for (const decl of style.split(";")) {
      const [k, ...rest] = decl.split(":");
      const key = k?.trim();
      const val = rest.join(":").trim();
      if (!key) continue;
      if (key === "font-weight") p.bold = val === "bold" || Number(val) >= 600;
      else if (key === "font-style") p.italic = val === "italic";
      else if (key === "text-decoration" || key === "text-decoration-line") p.underline = /underline/.test(val) ? true : val === "none" ? false : p.underline;
      else if (key === "background-color" || key === "background") {
        const h = colorToHighlight(val.split(" ")[0]);
        if (h) p.highlight = h;
      } else if (key === "mso-highlight") {
        const h = colorToHighlight(val);
        if (h) p.highlight = h;
      } else if (key === "font-size") {
        const pt = /([\d.]+)pt/.exec(val);
        const px = /([\d.]+)px/.exec(val);
        if (pt) p.size = Math.round(Number(pt[1]) * 2);
        else if (px) p.size = Math.round(Number(px[1]) * 0.75 * 2);
      } else if (key === "border" || key === "mso-border-alt") {
        if (!/none/.test(val)) p.border = true;
      }
    }
  }
  return p;
}

function headingLevel(el: Element): 0 | 1 | 2 | 3 | 4 {
  const m = /^H([1-6])$/.exec(el.tagName);
  if (m) return Math.min(4, Number(m[1])) as 1 | 2 | 3 | 4;
  const cls = el.getAttribute("class") ?? "";
  const hm = /MsoHeading(\d)|Heading(\d)/i.exec(cls);
  if (hm) return Math.min(4, Number(hm[1] ?? hm[2])) as 1 | 2 | 3 | 4;
  return 0;
}

export function parseHtmlToParagraphs(html: string): DocParagraph[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const paragraphs: DocParagraph[] = [];
  let current: DocParagraph | null = null;

  const start = (level: 0 | 1 | 2 | 3 | 4) => {
    finish();
    current = { index: paragraphs.length, headingLevel: level, runs: [], text: "", inTable: false };
  };
  const finish = () => {
    if (current && current.runs.some((r) => r.text.trim())) {
      current.text = current.runs.map((r) => r.text).join("");
      paragraphs.push(current);
    }
    current = null;
  };
  const addText = (text: string, props: RunProps) => {
    if (!current) start(0);
    const cur = current as unknown as DocParagraph;
    const t = text.replace(/[\r\n]+/g, " ").replace(/ /g, " ");
    const last = cur.runs[cur.runs.length - 1] as DocRun | undefined;
    const emphasis = !!props.bold && !!props.underline && !!props.border;
    if (last && JSON.stringify(last.props) === JSON.stringify(props)) last.text += t;
    else cur.runs.push({ text: t, props, emphasis });
  };

  const walk = (node: Node, props: RunProps, level: 0 | 1 | 2 | 3 | 4) => {
    if (node.nodeType === 3) {
      addText(node.textContent ?? "", props);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (["SCRIPT", "STYLE", "HEAD", "META", "TITLE", "O:P"].includes(el.tagName)) return;
    if (el.tagName === "BR") {
      addText("\n", props);
      return;
    }
    const isBlock = BLOCK.has(el.tagName);
    const lvl = isBlock ? headingLevel(el) || level : level;
    if (isBlock) start(headingLevel(el));
    const p = styleProps(el, props);
    for (const child of Array.from(el.childNodes)) walk(child as Node, p, lvl);
    if (isBlock) finish();
  };
  walk(document.body as unknown as Node, {}, 0);
  finish();
  return paragraphs.map((p, i) => ({ ...p, index: i }));
}

/** Plain text → paragraphs (blank lines separate paragraphs). */
export function parsePlainText(text: string): DocParagraph[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n|\n(?=\s*[A-Z0-9][^\n]{0,200}\n)/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, index) => ({ index, headingLevel: 0 as const, runs: [{ text: t, props: {}, emphasis: false }], text: t, inTable: false }));
}
