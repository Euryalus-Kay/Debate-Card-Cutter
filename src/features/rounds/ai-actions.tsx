"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";
import { Sparkles, Zap, Brain } from "lucide-react";
import { runOp } from "@/client/ai";
import { Button, cn, Dialog, Field, Textarea, toast } from "@/components/ui";
import { useApp } from "@/components/shell/app-shell";
import type { RoundGraph } from "@/domain/flow";
import type { SpeechId } from "@/domain/format";
import { sectionContentHash, type PMNodeJSON } from "@/shared/draft-model";
import { makeId } from "@/shared/editor/schema";
import { readStrategy, updateStrategy } from "@/shared/round-doc";
import { useWorkspace } from "./store";
import { findSectionNode, useProposals, type Proposal } from "./proposals";
import { getRoundDoc } from "./editor/active-editor";
import type { RoundRecord } from "./types";

function draftHash(editor: Editor | null): string | null {
  return editor ? sectionContentHash(editor.getJSON() as PMNodeJSON) : null;
}

export async function startDraftOp(args: { round: RoundRecord; speech: SpeechId; draftId: string; editor: Editor | null; mode: "fast" | "deep"; instructions: string; cardIds: string[]; evidenceMode: "selected_only" | "selected_plus_library" }) {
  const store = useProposals.getState();
  const pid = makeId("prop");
  store.add({ id: pid, opId: null, kind: "draft", draftId: args.draftId, speech: args.speech, status: "running", partial: null, result: null, error: null, startedAt: Date.now(), baseDraftHash: draftHash(args.editor) });
  useWorkspace.getState().set({ right: "ai" });
  try {
    const result = await runOp(
      { kind: "draft_speech", roundId: args.round.id, speech: args.speech, draftId: args.draftId, mode: args.mode, cardIds: args.cardIds, evidenceMode: args.evidenceMode, instructions: args.instructions },
      (e) => {
        if (e.t === "op") store.update(pid, { opId: e.id });
        if (e.t === "partial") useProposals.getState().update(pid, { partial: e.data as never });
      },
    );
    useProposals.getState().update(pid, { status: "ready", result: result as never });
  } catch (e) {
    useProposals.getState().update(pid, { status: "failed", error: (e as Error).message });
    toast((e as Error).message, "bad");
  }
}

export async function runSectionAi(args: { round: RoundRecord; speech: SpeechId; draftId: string; editor: Editor | null; sectionId: string; action: string; instructions?: string }) {
  if (!args.editor) return;
  const found = findSectionNode(args.editor, args.sectionId);
  if (!found) return toast("That section no longer exists.", "warn");
  const store = useProposals.getState();
  const pid = makeId("prop");
  const kind = args.action === "alternatives" ? "alternatives" : "revision";
  store.add({ id: pid, opId: null, kind, draftId: args.draftId, speech: args.speech, sectionId: args.sectionId, action: args.action, status: "running", partial: null, result: null, error: null, startedAt: Date.now() } as Proposal);
  useWorkspace.getState().set({ right: "ai" });
  // Make sure the server sees the latest text before it reads the section.
  await new Promise((r) => setTimeout(r, 400));
  try {
    const result = await runOp(
      { kind: "revise_section", roundId: args.round.id, speech: args.speech, draftId: args.draftId, sectionId: args.sectionId, action: args.action, instructions: args.instructions ?? "", cardIds: useWorkspace.getState().basket },
      (e) => {
        if (e.t === "op") store.update(pid, { opId: e.id });
        if (e.t === "partial") useProposals.getState().update(pid, { partial: e.data });
      },
    );
    useProposals.getState().update(pid, { status: "ready", result: result as never });
  } catch (e) {
    useProposals.getState().update(pid, { status: "failed", error: (e as Error).message });
    toast((e as Error).message, "bad");
  }
}

export function GenerateDialog({
  open,
  onOpenChange,
  round,
  speech,
  draftDoc,
  editor,
  graph,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  round: RoundRecord;
  speech: SpeechId;
  draftDoc: Y.Doc | null;
  editor: Editor | null;
  graph: RoundGraph | null;
}) {
  const ws = useWorkspace();
  const { team } = useApp();
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [instructions, setInstructions] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  void team;
  void graph;
  void draftDoc;

  function start() {
    if (!ws.draftId) return;
    onOpenChange(false);
    void startDraftOp({ round, speech, draftId: ws.draftId, editor, mode, instructions, cardIds: ws.basket, evidenceMode: onlySelected ? "selected_only" : "selected_plus_library" });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Build the ${speech}`}
      description="The AI plans the speech from the flow, your instructions, and your evidence. You review it before anything goes into your draft."
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} disabled={!ws.draftId}>
            <Sparkles className="size-4" /> Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "fast", icon: Zap, title: "Fast", text: "First sections in seconds, full speech in about a minute. Best during prep time." },
              { v: "deep", icon: Brain, title: "Deep", text: "More strategic reasoning; about two minutes. Best before the round or with time to spare." },
            ] as const
          ).map((m) => (
            <button key={m.v} onClick={() => setMode(m.v)} className={cn("rounded-lg border p-3 text-left", mode === m.v ? "border-accent bg-accent-soft/60" : "border-line hover:bg-hover")}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                <m.icon className="size-4" /> {m.title}
              </div>
              <div className="mt-1 text-xs text-muted">{m.text}</div>
            </button>
          ))}
        </div>
        <Field label="Strategy and instructions" hint="e.g. “Go for the DA and case turns; kick the CP by conceding the solvency deficit. Spend 1:30 on the perm.”">
          <Textarea
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={() => {
              if (instructions.trim() && ws.roundId) {
                // Keep the team's instructions on the round so the partner sees them too.
                const doc = getRoundDoc();
                if (doc) doc.transact(() => updateStrategy(doc, speech, { instructions: instructions.trim() || readStrategy(doc, speech).instructions }));
              }
            }}
          />
        </Field>
        <div className="rounded-lg bg-sunken p-3 text-[13px]">
          <div className="font-medium">Evidence</div>
          <div className="mt-1 text-muted">{ws.basket.length ? `${ws.basket.length} card${ws.basket.length === 1 ? "" : "s"} selected in the Evidence tab.` : "No cards selected. Select cards in the Evidence tab to steer the draft."}</div>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} disabled={!ws.basket.length} />
            Use only the selected cards
          </label>
        </div>
      </div>
    </Dialog>
  );
}
