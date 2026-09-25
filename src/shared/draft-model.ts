/**
 * Conversions between editor documents (ProseMirror JSON) and the domain
 * model: cards (BodyBlock spans), sections with targets, and time loads.
 */

import type { BodyBlock, BodyText, HighlightColor, HighlightSpan, Span } from "@/domain/card";
import { normalizeHighlights, normalizeSpans, readAloud } from "@/domain/card";
import { addLoads, countWords, EMPTY_LOAD, type WordLoad } from "@/domain/timing";
import type { SectionKind, SectionRelation } from "./editor/schema";
import { makeId } from "./editor/schema";

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNodeJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNodeJSON[];
  text?: string;
  marks?: PMMark[];
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export interface CardInsert {
  instanceId?: string;
  cardId?: string | null;
  sourceId?: string | null;
  tag: string;
  shortCite: string;
  fullCite: string;
  citeGaps?: string[];
  body: BodyBlock[];
  verification: string;
  textHash?: string | null;
}

function marksAt(block: BodyText, pos: number): PMMark[] {
  const marks: PMMark[] = [];
  const within = (spans: Span[]) => spans.some((s) => pos >= s.start && pos < s.end);
  if (within(block.emphasis)) marks.push({ type: "emphasis" });
  else if (within(block.underline)) marks.push({ type: "underline" });
  const h = block.highlight.find((s) => pos >= s.start && pos < s.end);
  if (h) marks.push({ type: "highlight", attrs: { color: highlightCss(h.color) } });
  return marks;
}

const HL_CSS: Record<HighlightColor, string> = {
  yellow: "#fff34f",
  cyan: "#5ce1ff",
  green: "#7ef08c",
  magenta: "#ff8af0",
  gray: "#b8b8b8",
  red: "#ff8a8a",
  blue: "#8ab4ff",
  darkYellow: "#d6c24a",
  lightGray: "#dcdcdc",
};
const CSS_HL = Object.fromEntries(Object.entries(HL_CSS).map(([k, v]) => [v, k])) as Record<string, HighlightColor>;

export function highlightCss(c: HighlightColor): string {
  return HL_CSS[c] ?? HL_CSS.yellow;
}
export function highlightFromCss(css: unknown): HighlightColor {
  if (typeof css !== "string") return "yellow";
  return CSS_HL[css.toLowerCase()] ?? "yellow";
}

function textToInline(block: BodyText): PMNodeJSON[] {
  const len = block.text.length;
  const cuts = new Set<number>([0, len]);
  for (const s of [...block.underline, ...block.emphasis, ...block.highlight]) {
    cuts.add(Math.max(0, Math.min(len, s.start)));
    cuts.add(Math.max(0, Math.min(len, s.end)));
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const out: PMNodeJSON[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (b <= a) continue;
    const marks = marksAt(block, a);
    out.push({ type: "text", text: block.text.slice(a, b), ...(marks.length ? { marks } : {}) });
  }
  return out;
}

export function cardToPM(c: CardInsert): PMNodeJSON {
  const paras: PMNodeJSON[] = [];
  let current: PMNodeJSON | null = null;
  const pushPara = (newParagraph: boolean) => {
    current = { type: "cardPara", attrs: { newParagraph }, content: [] };
    paras.push(current);
  };
  for (const b of c.body) {
    if (b.kind === "text") {
      if (b.newParagraph || !current) pushPara(b.newParagraph || !current);
      current!.content!.push(...textToInline(b));
    } else if (b.kind === "omission") {
      if (!current) pushPara(true);
      current!.content!.push({ type: "omission", attrs: { marker: b.marker } });
    } else {
      if (!current) pushPara(true);
      current!.content!.push({ type: "insertion", attrs: { text: b.text, read: b.read } });
    }
  }
  if (paras.length === 0) pushPara(true);
  for (const p of paras) if (p.content!.length === 0) delete p.content;
  return {
    type: "card",
    attrs: {
      id: c.instanceId ?? makeId("cin"),
      cardId: c.cardId ?? null,
      sourceId: c.sourceId ?? null,
      verification: c.verification,
      textHash: c.textHash ?? null,
      textEdited: false,
      read: "planned",
    },
    content: [
      { type: "cardTag", ...(c.tag ? { content: [{ type: "text", text: c.tag }] } : {}) },
      { type: "cardCite", attrs: { short: c.shortCite, full: c.fullCite, gaps: c.citeGaps ?? [] } },
      { type: "cardBody", content: paras },
    ],
  };
}

/** Rebuild BodyBlocks (verbatim text + spans) from a card node. */
export function pmCardBody(card: PMNodeJSON): BodyBlock[] {
  const body = card.content?.find((n) => n.type === "cardBody");
  const out: BodyBlock[] = [];
  for (const para of body?.content ?? []) {
    let block: BodyText | null = null;
    let first = true;
    const startText = () => {
      block = { kind: "text", text: "", newParagraph: first ? para.attrs?.newParagraph !== false : false, underline: [], emphasis: [], highlight: [] };
      first = false;
      out.push(block);
    };
    for (const inl of para.content ?? []) {
      if (inl.type === "text") {
        if (!block) startText();
        const b = block as unknown as BodyText;
        const start = b.text.length;
        b.text += inl.text ?? "";
        const end = b.text.length;
        for (const m of inl.marks ?? []) {
          if (m.type === "underline") b.underline.push({ start, end });
          else if (m.type === "emphasis") {
            b.emphasis.push({ start, end });
            b.underline.push({ start, end });
          } else if (m.type === "highlight") b.highlight.push({ start, end, color: highlightFromCss(m.attrs?.color) });
        }
      } else if (inl.type === "omission") {
        block = null;
        out.push({ kind: "omission", marker: String(inl.attrs?.marker ?? "[…]") });
      } else if (inl.type === "insertion") {
        block = null;
        out.push({ kind: "insertion", text: String(inl.attrs?.text ?? ""), read: inl.attrs?.read !== false });
      }
    }
    if (first) {
      // empty paragraph
      out.push({ kind: "text", text: "", newParagraph: true, underline: [], emphasis: [], highlight: [] });
    }
  }
  return out
    .map((b) => {
      if (b.kind !== "text") return b;
      const len = b.text.length;
      return { ...b, underline: normalizeSpans(b.underline, len), emphasis: normalizeSpans(b.emphasis, len), highlight: normalizeHighlights(b.highlight as HighlightSpan[], len) };
    })
    .filter((b) => b.kind !== "text" || b.text.length > 0);
}

export function inlineText(n: PMNodeJSON | undefined): string {
  if (!n) return "";
  if (n.type === "text") return n.text ?? "";
  if (n.type === "insertion") return `[${String(n.attrs?.text ?? "")}]`;
  if (n.type === "omission") return String(n.attrs?.marker ?? "…");
  if (n.type === "hardBreak") return "\n";
  return (n.content ?? []).map(inlineText).join("");
}

// ---------------------------------------------------------------------------
// Draft structure
// ---------------------------------------------------------------------------

export type DraftItem =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "note"; text: string }
  | { type: "card"; instanceId: string; cardId: string | null; tag: string; shortCite: string; fullCite: string; body: BodyBlock[]; verification: string; textEdited: boolean; read?: string }
  | { type: "section"; section: DraftSection };

export interface DraftSection {
  id: string;
  kind: SectionKind;
  relation: SectionRelation;
  targets: string[];
  positionId: string | null;
  role: string | null;
  locked: boolean;
  owner: string | null;
  budgetSec: number | null;
  origin: string;
  aiOpId: string | null;
  appliedHash: string | null;
  crossApplyFrom: string | null;
  priority: number | null;
  basis: Record<string, string> | null;
  title: string;
  items: DraftItem[];
}

export interface Draft {
  items: DraftItem[];
}

function sectionFrom(n: PMNodeJSON): DraftSection {
  const items = (n.content ?? []).map(itemFrom).filter((x): x is DraftItem => !!x);
  const heading = items.find((i) => i.type === "heading") as { text: string } | undefined;
  const a = n.attrs ?? {};
  return {
    id: String(a.id ?? ""),
    kind: (a.kind as SectionKind) ?? "other",
    relation: (a.relation as SectionRelation) ?? "none",
    targets: Array.isArray(a.targets) ? (a.targets as string[]) : [],
    positionId: (a.positionId as string) ?? null,
    role: (a.role as string) ?? null,
    locked: !!a.locked,
    owner: (a.owner as string) ?? null,
    budgetSec: typeof a.budgetSec === "number" ? a.budgetSec : null,
    origin: String(a.origin ?? "human"),
    aiOpId: (a.aiOpId as string) ?? null,
    appliedHash: (a.appliedHash as string) ?? null,
    crossApplyFrom: (a.crossApplyFrom as string) ?? null,
    priority: typeof a.priority === "number" ? a.priority : null,
    basis: a.basis && typeof a.basis === "object" ? (a.basis as Record<string, string>) : null,
    title: heading?.text ?? "",
    items,
  };
}

function itemFrom(n: PMNodeJSON): DraftItem | null {
  switch (n.type) {
    case "heading":
      return { type: "heading", level: Number(n.attrs?.level ?? 3), text: inlineText(n) };
    case "paragraph":
      return { type: "paragraph", text: inlineText(n) };
    case "note":
      return { type: "note", text: inlineText(n) };
    case "section":
      return { type: "section", section: sectionFrom(n) };
    case "card": {
      const cite = n.content?.find((c) => c.type === "cardCite");
      return {
        type: "card",
        instanceId: String(n.attrs?.id ?? ""),
        cardId: (n.attrs?.cardId as string) ?? null,
        tag: inlineText(n.content?.find((c) => c.type === "cardTag")),
        shortCite: String(cite?.attrs?.short ?? ""),
        fullCite: String(cite?.attrs?.full ?? ""),
        body: pmCardBody(n),
        verification: String(n.attrs?.verification ?? "unverified"),
        textEdited: !!n.attrs?.textEdited,
        read: String(n.attrs?.read ?? "planned"),
      };
    }
    case "bulletList":
    case "orderedList":
      return { type: "paragraph", text: inlineText(n) };
    default:
      return null;
  }
}

export function draftFromPM(doc: PMNodeJSON): Draft {
  return { items: (doc.content ?? []).map(itemFrom).filter((x): x is DraftItem => !!x) };
}

export function allSections(d: Draft | DraftSection): DraftSection[] {
  const out: DraftSection[] = [];
  const walk = (items: DraftItem[]) => {
    for (const it of items) {
      if (it.type === "section") {
        out.push(it.section);
        walk(it.section.items);
      }
    }
  };
  walk("items" in d ? d.items : []);
  return out;
}

// ---------------------------------------------------------------------------
// Time loads
// ---------------------------------------------------------------------------

export function itemLoad(it: DraftItem): WordLoad {
  switch (it.type) {
    case "heading":
      // Headings are signposts ("On the DA", "Next off"): read at tag rate, count as a transition.
      return { ...EMPTY_LOAD, tagWords: countWords(it.text), transitions: 1 };
    case "paragraph":
      return { ...EMPTY_LOAD, analyticWords: countWords(it.text) };
    case "note":
      return EMPTY_LOAD;
    case "card": {
      const read = readAloud(it.body);
      return { cardWords: countWords(read.text), tagWords: countWords(it.tag) + countWords(it.shortCite), analyticWords: 0, cards: 1, transitions: 0 };
    }
    case "section":
      return sectionLoad(it.section);
  }
}

export function sectionLoad(s: DraftSection): WordLoad {
  return addLoads(...s.items.map(itemLoad));
}

export function draftLoad(d: Draft): WordLoad {
  return addLoads(...d.items.map(itemLoad));
}

/** Stable content hash for staleness detection (FNV-1a over canonical JSON). */
export function contentHash(value: unknown): string {
  // Canonical form: sorted keys; null/undefined values and empty objects dropped. The synced
  // document omits null attributes and writes attribute-less marks as {attrs: {}}, while editor
  // nodes spell nulls out and omit empty attrs; both must hash the same.
  const isEmptyObject = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 0;
  const s = JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== null && x !== undefined && !isEmptyObject(x))
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Hash of a section's content only (not attrs like locked/owner). */
export function sectionContentHash(section: PMNodeJSON): string {
  return contentHash(section.content ?? []);
}

function plainText(n: PMNodeJSON): string {
  if (n.type === "text") return n.text ?? "";
  return (n.content ?? []).map(plainText).join(n.type === "doc" || n.type === "section" || n.type === "card" ? "\n" : "");
}

/**
 * Hash of what a section itself says: its headings, paragraphs and notes (text only), each card
 * as {cardId, text}, and each nested section as a reference. Unlike sectionContentHash it ignores
 * edits inside nested sections, marks (re-highlighting, bold), and card state (read, verification),
 * so a parent isn't mistaken for human-edited when a child changes or a card is re-highlighted.
 */
export function sectionOwnHash(section: PMNodeJSON): string {
  const own = (section.content ?? []).map((c) => {
    if (c.type === "section") return { type: "sectionRef", id: String(c.attrs?.id ?? "") };
    if (c.type === "card") return { type: "card", cardId: (c.attrs?.cardId as string) ?? null, text: contentHash(plainText(c)) };
    return { type: c.type, level: c.type === "heading" ? Number(c.attrs?.level ?? 3) : undefined, text: plainText(c) };
  });
  return contentHash(own);
}

/** A section counts as human-edited when AI never wrote it, or its own content changed since. */
export function isHumanEdited(section: PMNodeJSON): boolean {
  const a = section.attrs ?? {};
  if (a.origin !== "ai" || !a.appliedHash) return true;
  return sectionOwnHash(section) !== a.appliedHash;
}
