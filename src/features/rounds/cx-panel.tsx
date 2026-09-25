"use client";

/**
 * Cross-examination notes, one shared text per CX period. Partners can type at
 * the same time; notes stay off the flow until a speech uses them (SEQ-4).
 */

import { useState } from "react";
import type * as Y from "yjs";
import { MessageCircleQuestion, Plus } from "lucide-react";
import { api } from "@/client/api";
import { Button, cn, toast } from "@/components/ui";
import { DEFAULT_CX, SPEECHES, type CxDef, type SpeechId } from "@/domain/format";
import { cxText } from "@/shared/round-doc";
import { useBoundText } from "./use-bound-text";
import type { RoundRecord } from "./types";
import { useWorkspace } from "./store";

export function CxPanel({ round, doc, aiEnabled = false }: { round: RoundRecord; doc: Y.Doc | null; aiEnabled?: boolean }) {
  const ws = useWorkspace();
  if (!doc) return null;
  return (
    <div className="space-y-3 p-3">
      <p className="text-[12px] text-muted">Cross-ex notes aren&apos;t arguments until a speech makes them. Write what was asked and admitted; the AI sees these notes labeled as CX.</p>
      {DEFAULT_CX.map((cx) => (
        <CxBox key={cx.id} doc={doc} cx={cx} ourSide={round.ourSide} active={ws.speech === cx.after} roundId={round.id} aiEnabled={aiEnabled} />
      ))}
    </div>
  );
}

function label(cx: CxDef, ourSide: "aff" | "neg"): string {
  const answererSide = SPEECHES[cx.after as SpeechId].side;
  return `CX of the ${cx.after} — ${cx.asker} asks ${cx.answerer} (${answererSide === ourSide ? "they question us" : "we question them"})`;
}

interface CxHelp {
  mode: "ask" | "answer";
  questions?: { target: string; question: string; goal: string; why: string; followUp: string }[];
  answers?: { target: string; likelyQuestion: string; answer: string; avoid: string }[];
}

function CxBox({ doc, cx, ourSide, active, roundId, aiEnabled }: { doc: Y.Doc; cx: CxDef; ourSide: "aff" | "neg"; active: boolean; roundId: string; aiEnabled: boolean }) {
  const { ref: padRef, value: padValue, onChange: onPadChange } = useBoundText(cxText(doc, cx.id));
  const weAsk = SPEECHES[cx.after as SpeechId].side !== ourSide;
  const [help, setHelp] = useState<CxHelp | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  async function ask() {
    setBusy(true);
    try {
      setHelp(await api<CxHelp>(`/api/rounds/${roundId}/cx`, { method: "POST", json: { cxId: cx.id } }));
      setAdded(new Set());
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }
  function addToNotes(i: number, text: string) {
    const t = cxText(doc, cx.id);
    const cur = t.toString();
    doc.transact(() => t.insert(t.length, `${cur && !cur.endsWith("\n") ? "\n" : ""}${text}\n`));
    setAdded((s) => new Set(s).add(i));
  }
  return (
    <div className={cn("block rounded-lg border p-2", active ? "border-accent" : "border-line")}>
      <div className="mb-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[11.5px] font-semibold text-muted">{label(cx, ourSide)}</span>
        {aiEnabled ? (
          <Button size="xs" variant="ghost" onClick={() => void ask()} loading={busy}>
            <MessageCircleQuestion className="size-3.5" /> {weAsk ? "Suggest questions" : "Prep answers"}
          </Button>
        ) : null}
      </div>
      {help ? (
        <ul className="mb-2 space-y-1.5">
          {(help.questions ?? []).map((q, i) => (
            <li key={`q${i}`} className="flex items-start gap-1.5 rounded-md bg-sunken px-2 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{q.question}</span>
                <span className="block text-[11.5px] text-muted">{q.why}</span>
                {q.followUp ? <span className="block text-[11.5px] text-faint">If they dodge: {q.followUp}</span> : null}
              </span>
              <Button size="xs" variant="ghost" onClick={() => addToNotes(i, `Q: ${q.question}`)} disabled={added.has(i)} aria-label="Add question to notes">
                <Plus className="size-3.5" />
              </Button>
            </li>
          ))}
          {(help.answers ?? []).map((a, i) => (
            <li key={`a${i}`} className="flex items-start gap-1.5 rounded-md bg-sunken px-2 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="font-medium">If they ask: {a.likelyQuestion}</span>
                <span className="block">Say: {a.answer}</span>
                {a.avoid ? <span className="block text-[11.5px] text-warn">Don&apos;t: {a.avoid}</span> : null}
              </span>
              <Button size="xs" variant="ghost" onClick={() => addToNotes(i, `Q: ${a.likelyQuestion}\nA: ${a.answer}`)} disabled={added.has(i)} aria-label="Add answer to notes">
                <Plus className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="block">
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
    </div>
  );
}
