/**
 * Anchors that follow the text (A7): a span of the draft stored as Yjs
 * relative positions, so it stays on the same words while either partner
 * types above, below, or inside the document. Used by AI edits of a
 * selection (the answer lands on the words that were asked about, or is
 * refused if they changed) and by comment threads.
 */

import type { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";

interface Binding {
  type: Y.XmlFragment;
  mapping: Map<Y.AbstractType<unknown>, unknown>;
  doc: Y.Doc;
}

function binding(editor: Editor): Binding | null {
  const st = ySyncPluginKey.getState(editor.state) as { binding?: Binding } | undefined;
  const b = st?.binding;
  return b && b.type && b.mapping ? { ...b, doc: b.doc ?? b.type.doc! } : null;
}

export interface SpanAnchor {
  start: unknown;
  end: unknown;
}

/** Anchor the range [from, to) of the editor's document. Null when the editor isn't collaborative. */
export function anchorRange(editor: Editor, from: number, to: number): SpanAnchor | null {
  const b = binding(editor);
  if (!b) return null;
  const start = absolutePositionToRelativePosition(from, b.type, b.mapping as never);
  const end = absolutePositionToRelativePosition(to, b.type, b.mapping as never);
  return { start: Y.relativePositionToJSON(start), end: Y.relativePositionToJSON(end) };
}

/** Where an anchored span is now, or null if its text was deleted. */
export function resolveRange(editor: Editor, a: SpanAnchor): { from: number; to: number } | null {
  const b = binding(editor);
  if (!b) return null;
  try {
    const from = relativePositionToAbsolutePosition(b.doc, b.type, Y.createRelativePositionFromJSON(a.start), b.mapping as never);
    const to = relativePositionToAbsolutePosition(b.doc, b.type, Y.createRelativePositionFromJSON(a.end), b.mapping as never);
    if (from === null || to === null || to <= from) return null;
    return { from, to };
  } catch {
    return null;
  }
}

export const squash = (t: string) => t.replace(/\s+/g, " ").trim();

/** The text of a range, blocks separated by newlines. */
export function rangeText(editor: Editor, from: number, to: number): string {
  return editor.state.doc.textBetween(from, to, "\n", " ");
}

/** The section (by id) that contains a position, innermost first. */
export function sectionAt(editor: Editor, pos: number): { id: string; locked: boolean } | null {
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d);
    if (n.type.name === "section") {
      let locked = false;
      for (let e = d; e > 0; e--) if ($pos.node(e).type.name === "section" && $pos.node(e).attrs.locked) locked = true;
      return { id: String(n.attrs.id), locked };
    }
  }
  return null;
}

/** True if the range touches a card (card text is verbatim and never edited by AI). */
export function touchesCard(editor: Editor, from: number, to: number): boolean {
  let hit = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (hit) return false;
    if (node.type.name === "card") hit = true;
    return !hit;
  });
  const $from = editor.state.doc.resolve(from);
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "card") hit = true;
  return hit;
}
