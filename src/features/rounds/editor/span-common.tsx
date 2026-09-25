"use client";

/** Shared by selection edits and comment suggestions (A7). */

import { useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { diffWords } from "diff";
import type * as Y from "yjs";
import type { SpeechId } from "@/domain/format";
import { rangeText, resolveRange, sectionAt, squash, touchesCard, type SpanAnchor } from "./anchors";

export interface SpanEnv {
  roundId: string;
  speech: SpeechId;
  draftId: string;
  draftDoc: Y.Doc | null;
  userId: string;
  userName: string;
  aiEnabled: boolean;
}

/**
 * Replace anchored words with new text, unless they changed since (then `stale`), or unless force.
 * `onApplied` gets the new words' range (a comment re-anchors to them: the old anchor sat on replaced words).
 */
export function replaceAnchored(editor: Editor, anchor: SpanAnchor, base: string, replacement: string, force = false, onApplied?: (from: number, to: number) => void): "applied" | "stale" | "missing" | "locked" {
  const r = resolveRange(editor, anchor);
  if (!r) return "missing";
  const current = rangeText(editor, r.from, r.to);
  if (squash(current) !== squash(base) && !force) return "stale";
  if (sectionAt(editor, r.from)?.locked || touchesCard(editor, r.from, r.to)) return "locked";
  const before = editor.state.doc;
  editor.view.dispatch(editor.state.tr.insertText(replacement, r.from, r.to));
  if (editor.state.doc === before) return "locked";
  onApplied?.(r.from, r.from + replacement.length);
  return "applied";
}

/** Word-level diff of a suggestion: removed words struck through, added words marked. */
export function WordDiff({ from, to }: { from: string; to: string }) {
  const parts = useMemo(() => diffWords(from, to), [from, to]);
  return (
    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">
      {parts.map((p, i) => (p.added ? <ins key={i} className="rounded-sm bg-ok-soft text-ok no-underline">{p.value}</ins> : p.removed ? <del key={i} className="rounded-sm bg-bad-soft text-bad">{p.value}</del> : <span key={i}>{p.value}</span>))}
    </p>
  );
}
