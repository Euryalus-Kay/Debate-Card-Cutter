"use client";

/**
 * Cross-examination notes, one shared text per CX period. Partners can type at
 * the same time; notes stay off the flow until a speech uses them (SEQ-4).
 */

import type * as Y from "yjs";
import { cn } from "@/components/ui";
import { DEFAULT_CX, SPEECHES, type CxDef, type SpeechId } from "@/domain/format";
import { cxText } from "@/shared/round-doc";
import { useBoundText } from "./use-bound-text";
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
  const { ref: padRef, value: padValue, onChange: onPadChange } = useBoundText(cxText(doc, cx.id));
  return (
    <label className={cn("block rounded-lg border p-2", active ? "border-accent" : "border-line")}>
      <span className="mb-1 block text-[11.5px] font-semibold text-muted">{label(cx, ourSide)}</span>
      <textarea
        ref={padRef}
        value={padValue}
        rows={active ? 8 : 3}
        onChange={onPadChange}
        placeholder="Q: … / A: …"
        className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] leading-relaxed outline-none focus:border-accent"
        aria-label={`Notes: CX of the ${cx.after}`}
      />
    </label>
  );
}
