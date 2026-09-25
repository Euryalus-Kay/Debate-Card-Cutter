"use client";

/**
 * Cross-examination notes, one shared text per CX period. Partners can type at
 * the same time; notes stay off the flow until a speech uses them (SEQ-4).
 */

import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { cn } from "@/components/ui";
import { DEFAULT_CX, SPEECHES, type CxDef, type SpeechId } from "@/domain/format";
import { applyTextDiff, cxText } from "@/shared/round-doc";
import type { RoundRecord } from "./types";
import { useWorkspace } from "./store";

export function CxPanel({ round, doc }: { round: RoundRecord; doc: Y.Doc | null }) {
  const ws = useWorkspace();
  if (!doc) return null;
  return (
    <div className="space-y-3 p-3">
      <p className="text-[12px] text-muted">Cross-ex notes aren&apos;t arguments until a speech makes them. Write what was asked and admitted; the AI sees these notes labeled as CX.</p>
      {DEFAULT_CX.map((cx) => (
        <CxBox key={cx.id} doc={doc} cx={cx} ourSide={round.ourSide} active={ws.speech === cx.after} />
      ))}
    </div>
  );
}

function label(cx: CxDef, ourSide: "aff" | "neg"): string {
  const answererSide = SPEECHES[cx.after as SpeechId].side;
  return `CX of the ${cx.after} — ${cx.asker} asks ${cx.answerer} (${answererSide === ourSide ? "they question us" : "we question them"})`;
}

function CxBox({ doc, cx, ourSide, active }: { doc: Y.Doc; cx: CxDef; ourSide: "aff" | "neg"; active: boolean }) {
  const text = cxText(doc, cx.id);
  const [value, setValue] = useState(() => text.toString());
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // Remote edits: update the box and keep the cursor where it was relative to the text around it.
    const onChange = (e: Y.YTextEvent, tr: Y.Transaction) => {
      const el = ref.current;
      const next = text.toString();
      if (tr.local || !el || document.activeElement !== el) {
        setValue(next);
        return;
      }
      let pos = 0;
      let start = el.selectionStart;
      let end = el.selectionEnd;
      for (const d of e.delta) {
        if (d.retain) pos += d.retain;
        else if (typeof d.insert === "string") {
          if (pos <= start) start += d.insert.length;
          if (pos <= end) end += d.insert.length;
          pos += d.insert.length;
        } else if (d.delete) {
          if (pos < start) start -= Math.min(d.delete, start - pos);
          if (pos < end) end -= Math.min(d.delete, end - pos);
        }
      }
      setValue(next);
      requestAnimationFrame(() => el.setSelectionRange(start, end));
    };
    text.observe(onChange);
    return () => text.unobserve(onChange);
  }, [text]);
  return (
    <label className={cn("block rounded-lg border p-2", active ? "border-accent" : "border-line")}>
      <span className="mb-1 block text-[11.5px] font-semibold text-muted">{label(cx, ourSide)}</span>
      <textarea
        ref={ref}
        value={value}
        rows={active ? 8 : 3}
        onChange={(e) => {
          setValue(e.target.value);
          applyTextDiff(text, e.target.value);
        }}
        placeholder="Q: … / A: …"
        className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] leading-relaxed outline-none focus:border-accent"
        aria-label={`Notes: CX of the ${cx.after}`}
      />
    </label>
  );
}
