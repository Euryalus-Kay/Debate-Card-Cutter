/**
 * Editor schema shared by the browser editor and the server (imports,
 * exports, AI context). No React here.
 *
 * Structure of a speech draft:
 *   doc → (section | heading | paragraph | card | note)+
 *   section(id, kind, relation, targets, locked, …) → (heading | paragraph | card | note | section)+
 *   card(id, cardId, verification, …) → cardTag cardCite cardBody
 *   cardBody → cardPara+ ; cardPara → text with underline/emphasis/highlight marks,
 *              plus inline omission / insertion atoms
 *
 * Integrity rules enforced by plugins:
 *   - Locked sections reject local edits.
 *   - Card evidence text cannot be changed (marks can), unless the
 *     transaction explicitly allows it (which flags the card as edited).
 */

import { Extension, Mark, Node, mergeAttributes, type AnyExtension } from "@tiptap/core";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep, ReplaceAroundStep } from "@tiptap/pm/transform";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

/**
 * Version of the editor schema (node types and attributes). y-tiptap drops any
 * attribute the local schema doesn't declare, so a tab running an older build
 * would silently strip newer attributes from sections it edits. Sync refuses
 * clients below the server's minimum (see /api/docs/[docId]/sync). Bump this
 * whenever node attributes change.
 */
export const EDITOR_SCHEMA_VERSION = 2;
export const SCHEMA_HEADER = "x-clash-schema";

export const ALLOW_CARD_TEXT_EDIT = "allowCardTextEdit";
export const BYPASS_LOCKS = "bypassLocks";

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/** Verbatim "Emphasis": bold + underline + box. */
export const Emphasis = Mark.create({
  name: "emphasis",
  parseHTML() {
    return [{ tag: "span[data-emphasis]" }, { tag: "strong.emphasis" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-emphasis": "", class: "mark-emphasis" }), 0];
  },
});

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

const jsonAttr = (name: string, fallback: unknown) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${name}`);
    if (!v) return fallback;
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
});

const strAttr = (name: string, fallback: string | null = null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
  renderHTML: (attrs: Record<string, unknown>) => (attrs[name] == null ? {} : { [`data-${name}`]: String(attrs[name]) }),
});

export type SectionKind = "position" | "response" | "overview" | "extension" | "analytic" | "other";
export type SectionRelation = "answers" | "group" | "cross_apply" | "extend" | "new" | "none";

export const Section = Node.create({
  name: "section",
  group: "block",
  content: "block+",
  defining: true,
  isolating: false,
  addAttributes() {
    return {
      id: strAttr("id"),
      kind: strAttr("kind", "other"),
      relation: strAttr("relation", "none"),
      targets: jsonAttr("targets", []),
      positionId: strAttr("position-id"),
      /** argument role of this section when it is a single argument (e.g. link_turn), used for contradiction checks */
      role: strAttr("role"),
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-locked") === "true",
        renderHTML: (a: Record<string, unknown>) => ({ "data-locked": a.locked ? "true" : "false" }),
      },
      lockedBy: strAttr("locked-by"),
      owner: strAttr("owner"),
      budgetSec: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-budget") ? Number(el.getAttribute("data-budget")) : null),
        renderHTML: (a: Record<string, unknown>) => (a.budgetSec == null ? {} : { "data-budget": String(a.budgetSec) }),
      },
      origin: strAttr("origin", "human"),
      aiOpId: strAttr("ai-op"),
      /** hash of the section's own content (sectionOwnHash) when AI wrote it; a different hash later means a human edited it */
      appliedHash: strAttr("applied-hash"),
      /** for cross-applications: the id of our argument being cross-applied */
      crossApplyFrom: strAttr("cross-apply-from"),
      /** 1 = must keep, 2 = important, 3 = cut first */
      priority: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-priority") ? Number(el.getAttribute("data-priority")) : null),
        renderHTML: (a: Record<string, unknown>) => (a.priority == null ? {} : { "data-priority": String(a.priority) }),
      },
      /** argument id → hash of that argument's text when this section was written (to spot answers that went stale) */
      basis: jsonAttr("basis", null),
    };
  },
  parseHTML() {
    return [{ tag: "section[data-section]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-section": "" }), 0];
  },
});

export const Note = Node.create({
  name: "note",
  group: "block",
  content: "inline*",
  marks: "bold italic",
  addAttributes() {
    return { author: strAttr("author") };
  },
  parseHTML() {
    return [{ tag: "p[data-note]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { "data-note": "", class: "node-note" }), 0];
  },
});

export const Card = Node.create({
  name: "card",
  group: "block",
  content: "cardTag cardCite cardBody",
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      id: strAttr("id"),
      cardId: strAttr("card-id"),
      sourceId: strAttr("source-id"),
      verification: strAttr("verification", "unverified"),
      /** hash of the verbatim text when inserted; differs if the text was edited */
      textHash: strAttr("text-hash"),
      textEdited: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-text-edited") === "true",
        renderHTML: (a: Record<string, unknown>) => (a.textEdited ? { "data-text-edited": "true" } : {}),
      },
      /** reading status within a delivered speech */
      read: strAttr("read", "planned"),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-card]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-card": "", class: "node-card" }), 0];
  },
});

export const CardTag = Node.create({
  name: "cardTag",
  content: "inline*",
  marks: "bold italic underline emphasis highlight",
  defining: true,
  parseHTML() {
    return [{ tag: "h4[data-card-tag]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["h4", mergeAttributes(HTMLAttributes, { "data-card-tag": "", class: "card-tag" }), 0];
  },
});

/** Citation is an atom: edited through the card editor so field provenance is kept. */
export const CardCite = Node.create({
  name: "cardCite",
  atom: true,
  selectable: false,
  addAttributes() {
    return { short: strAttr("short", ""), full: strAttr("full", ""), gaps: jsonAttr("gaps", []) };
  },
  parseHTML() {
    return [{ tag: "p[data-card-cite]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, { "data-card-cite": "", class: "card-cite" }),
      ["strong", { class: "cite-short" }, String(node.attrs.short ?? "")],
      ["span", { class: "cite-full" }, ` ${String(node.attrs.full ?? "")}`],
    ];
  },
});

export const CardBody = Node.create({
  name: "cardBody",
  content: "cardPara+",
  parseHTML() {
    return [{ tag: "div[data-card-body]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-card-body": "", class: "card-body" }), 0];
  },
});

export const CardPara = Node.create({
  name: "cardPara",
  content: "(text | omission | insertion)*",
  marks: "underline emphasis highlight bold",
  addAttributes() {
    return {
      /** false when this paragraph continues the previous one after an omission */
      newParagraph: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-continued") !== "true",
        renderHTML: (a: Record<string, unknown>) => (a.newParagraph === false ? { "data-continued": "true" } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "p[data-card-para]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { "data-card-para": "" }), 0];
  },
});

export const Omission = Node.create({
  name: "omission",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { marker: strAttr("marker", "[…]") };
  },
  parseHTML() {
    return [{ tag: "span[data-omission]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-omission": "", class: "node-omission", contenteditable: "false" }), String(node.attrs.marker)];
  },
});

export const Insertion = Node.create({
  name: "insertion",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      text: strAttr("text", ""),
      read: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-read") !== "false",
        renderHTML: (a: Record<string, unknown>) => ({ "data-read": a.read ? "true" : "false" }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-insertion]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-insertion": "", class: "node-insertion", contenteditable: "false" }), `[${String(node.attrs.text)}]`];
  },
});

// ---------------------------------------------------------------------------
// Integrity plugins
// ---------------------------------------------------------------------------

function isRemote(tr: Transaction): boolean {
  // Remote Yjs changes and Yjs undo/redo carry the y-sync plugin meta.
  const meta = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean } | undefined;
  return !!meta?.isChangeOrigin;
}

/** Ranges [from, to) of locked sections in the document. */
function lockedRanges(doc: PMNode): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "section" && node.attrs.locked) {
      out.push([pos, pos + node.nodeSize]);
      return false;
    }
    return true;
  });
  return out;
}

/** For each card: the whole node range and its body content range. */
function cardRanges(doc: PMNode): Array<{ card: [number, number]; body: [number, number] }> {
  const out: Array<{ card: [number, number]; body: [number, number] }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "card") return true;
    let body: [number, number] = [pos, pos];
    node.forEach((child, offset) => {
      if (child.type.name === "cardBody") {
        const start = pos + 1 + offset;
        body = [start + 1, start + child.nodeSize - 1];
      }
    });
    out.push({ card: [pos, pos + node.nodeSize], body });
    return false;
  });
  return out;
}

function stepRanges(tr: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  tr.steps.forEach((step, i) => {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      const s = step as unknown as { from: number; to: number };
      // Map positions back to the original document.
      let from = s.from;
      let to = s.to;
      for (let j = i - 1; j >= 0; j--) {
        const inv = tr.steps[j].getMap().invert();
        from = inv.map(from, -1);
        to = inv.map(to, 1);
      }
      ranges.push([from, to]);
    }
  });
  return ranges;
}

// A zero-width range (an insertion) counts when it sits anywhere inside b, edges included:
// inserting at the very start or end of a locked section's content still changes it.
const overlaps = (a: [number, number], b: [number, number]) => (a[0] === a[1] ? a[0] >= b[0] && a[0] <= b[1] : a[0] < b[1] && b[0] < a[1]);

export type BlockedReason = "locked_section" | "card_text";

export const IntegrityGuards = Extension.create<{ onBlocked?: (reason: BlockedReason) => void }>({
  name: "integrityGuards",
  addOptions() {
    return { onBlocked: undefined };
  },
  addProseMirrorPlugins() {
    const onBlocked = this.options.onBlocked;
    return [
      new Plugin({
        key: new PluginKey("integrityGuards"),
        filterTransaction(tr, state) {
          if (!tr.docChanged || isRemote(tr)) return true;
          const ranges = stepRanges(tr);
          if (ranges.length === 0) return true; // mark-only changes are always allowed
          if (!tr.getMeta(BYPASS_LOCKS)) {
            const locked = lockedRanges(state.doc);
            if (ranges.some((r) => locked.some((l) => overlaps(r, [l[0] + 1, l[1] - 1])))) {
              onBlocked?.("locked_section");
              return false;
            }
          }
          if (!tr.getMeta(ALLOW_CARD_TEXT_EDIT)) {
            for (const r of ranges) {
              for (const c of cardRanges(state.doc)) {
                const coversWholeCard = r[0] <= c.card[0] && r[1] >= c.card[1];
                if (!coversWholeCard && overlapsOrInside(r, c.body)) {
                  onBlocked?.("card_text");
                  return false;
                }
              }
            }
          }
          return true;
        },
      }),
    ];
  },
});

function overlapsOrInside(r: [number, number], b: [number, number]): boolean {
  // An insertion point (r[0] === r[1]) strictly inside the body, or any overlap with it.
  if (r[0] === r[1]) return r[0] >= b[0] && r[0] <= b[1];
  return r[0] < b[1] + 1 && b[0] - 1 < r[1];
}

/** Give sections and cards stable ids; re-id duplicates created by copy/paste. */
export const StableIds = Extension.create({
  name: "stableIds",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("stableIds"),
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "section" && node.type.name !== "card") return true;
            const id = node.attrs.id as string | null;
            if (!id || seen.has(id)) {
              tr = tr ?? state.tr;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: makeId(node.type.name === "section" ? "sec" : "cin") });
            } else seen.add(id);
            return true;
          });
          if (tr) (tr as Transaction).setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});

export function makeId(prefix: string): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return `${prefix}_${Array.from(b, (x) => (x % 36).toString(36)).join("")}${Date.now().toString(36).slice(-4)}`;
}

export interface ExtensionOptions {
  /** true when a collaboration extension provides undo/redo */
  collaborative?: boolean;
  onBlocked?: (reason: BlockedReason) => void;
}

export function editorExtensions(opts: ExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: opts.collaborative ? false : undefined,
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      link: false,
      heading: { levels: [1, 2, 3, 4] },
    }),
    Highlight.configure({ multicolor: true }),
    Emphasis,
    Section,
    Note,
    Card,
    CardTag,
    CardCite,
    CardBody,
    CardPara,
    Omission,
    Insertion,
    IntegrityGuards.configure({ onBlocked: opts.onBlocked }),
    StableIds,
  ];
}

let cachedSchema: ReturnType<typeof getSchema> | null = null;
export function draftSchema() {
  if (!cachedSchema) cachedSchema = getSchema(editorExtensions({ collaborative: true }));
  return cachedSchema;
}

export const DRAFT_FRAGMENT = "default";
