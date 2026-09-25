/**
 * Highlights for anchored spans (A7): words an AI edit is working on, and
 * words partners commented on. The spans are Yjs-anchored, so they are
 * resolved against the current document on every render and follow the text.
 */

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import * as Y from "yjs";
import { relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import type { SpanAnchor } from "./anchors";

export interface AnchoredMark {
  key: string;
  anchor: SpanAnchor;
  className: string;
  title?: string;
  onClick?: () => void;
}

export const anchoredMarksKey = new PluginKey<Map<string, AnchoredMark[]>>("anchoredMarks");

function resolve(state: EditorState, a: SpanAnchor): { from: number; to: number } | null {
  const b = ySyncPluginKey.getState(state)?.binding as { type: Y.XmlFragment; mapping: Map<unknown, unknown>; doc?: Y.Doc } | undefined;
  if (!b?.type || !b.mapping) return null;
  try {
    const doc = b.doc ?? b.type.doc!;
    const from = relativePositionToAbsolutePosition(doc, b.type, Y.createRelativePositionFromJSON(a.start), b.mapping as never);
    const to = relativePositionToAbsolutePosition(doc, b.type, Y.createRelativePositionFromJSON(a.end), b.mapping as never);
    if (from === null || to === null || to <= from || to > state.doc.content.size) return null;
    return { from, to };
  } catch {
    return null;
  }
}

/** Replace one group of marks ("span-ai", "comments") on an editor. */
export function setAnchoredMarks(editor: Editor | null, group: string, marks: AnchoredMark[]) {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(anchoredMarksKey, { group, marks }).setMeta("addToHistory", false));
}

export const AnchoredMarks = Extension.create({
  name: "anchoredMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin<Map<string, AnchoredMark[]>>({
        key: anchoredMarksKey,
        state: {
          init: () => new Map(),
          apply(tr, value) {
            const m = tr.getMeta(anchoredMarksKey) as { group: string; marks: AnchoredMark[] } | undefined;
            if (!m) return value;
            const next = new Map(value);
            next.set(m.group, m.marks);
            return next;
          },
        },
        props: {
          decorations(state) {
            const groups = anchoredMarksKey.getState(state);
            if (!groups?.size) return null;
            const decos: Decoration[] = [];
            for (const marks of groups.values()) {
              for (const mk of marks) {
                const r = resolve(state, mk.anchor);
                if (r) decos.push(Decoration.inline(r.from, r.to, { class: mk.className, ...(mk.title ? { title: mk.title } : {}), "data-anchor-key": mk.key }));
              }
            }
            return decos.length ? DecorationSet.create(state.doc, decos) : null;
          },
          handleClick(view, _pos, event) {
            const el = (event.target as HTMLElement | null)?.closest("[data-anchor-key]");
            if (!el) return false;
            const key = el.getAttribute("data-anchor-key");
            for (const marks of anchoredMarksKey.getState(view.state)?.values() ?? []) {
              const hit = marks.find((m) => m.key === key);
              if (hit?.onClick) {
                hit.onClick();
                return false; // keep the normal caret placement too
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
