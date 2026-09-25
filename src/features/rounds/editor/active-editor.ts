"use client";

import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";

/** Editors by draft id, so panels outside the editor tree (AI, evidence) can apply changes. */
const editors = new Map<string, Editor>();
let roundDoc: Y.Doc | null = null;

export function registerEditor(draftId: string, editor: Editor | null) {
  if (editor) editors.set(draftId, editor);
  else editors.delete(draftId);
}

export function getActiveEditor(draftId: string): Editor | null {
  const e = editors.get(draftId);
  return e && !e.isDestroyed ? e : null;
}

export function setRoundDoc(d: Y.Doc | null) {
  roundDoc = d;
}

export function getRoundDoc(): Y.Doc | null {
  return roundDoc;
}
