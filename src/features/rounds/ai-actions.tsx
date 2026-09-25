"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";
import { Sparkles, Zap, Brain, RefreshCw, Copy } from "lucide-react";
import { api } from "@/client/api";
import { runOp, type OpEvent } from "@/client/ai";
import { flushDoc } from "@/client/sync/hooks";
import { Button, cn, Dialog, Field, Textarea, toast } from "@/components/ui";
import type { RoundGraph } from "@/domain/flow";
import type { SpeechId } from "@/domain/format";
import { changeSet, isUpToDate } from "@/domain/patch";
import { sectionContentHash, type PMNodeJSON } from "@/shared/draft-model";
import { makeId } from "@/shared/editor/schema";
import { readStrategy, updateStrategy } from "@/shared/round-doc";
import { useWorkspace } from "./store";
import { findSectionNode, useProposals, type PatchResult, type Proposal } from "./proposals";
import { getRoundDoc } from "./editor/active-editor";
import { useDraft } from "./draft-hooks";
import { activityEnd, activityOp, activityProgress, activityStart } from "./ai-activity";
import type { RoundRecord } from "./types";

function draftHash(editor: Editor | null): string | null {
  return editor ? sectionContentHash(editor.getJSON() as PMNodeJSON) : null;
}

/** A job that failed, or that someone stopped (then it simply closes, with no error). */
function failed(pid: string, e: unknown, quiet = false) {
  const message = (e as Error).message;
  const stopped = /^(Cancelled\.|Stopped by)/.test(message);
  useProposals.getState().update(pid, { status: stopped || quiet ? "dismissed" : "failed", error: stopped ? null : message, progress: null });
  activityEnd(pid, stopped ? "dismissed" : "failed", stopped ? "Stopped" : undefined);
  if (!stopped && !quiet) toast(message, "bad");
}

/** Stop a running AI job (the server notices within a few seconds). */
export async function stopOp(opId: string) {
  await api(`/api/ai/ops/${opId}/cancel`, { method: "POST", json: {} }).catch(() => {});
}

/** Stream events into the proposal, and into the shared activity so the partner sees it. */
function onEvent(pid: string, e: OpEvent) {
  const store = useProposals.getState();
  if (e.t === "op") {
    store.update(pid, { opId: e.id });
    activityOp(pid, e.id);
  }
  if (e.t === "partial") store.update(pid, { partial: e.data as never });
  if (e.t === "status") store.update(pid, { note: e.data });
  if (e.t === "progress") {
    store.update(pid, { progress: { ...e.data, at: Date.now() } });
    activityProgress(pid, e.data);
  }
}

export async function startDraftOp(args: { round: RoundRecord; speech: SpeechId; draftId: string; editor: Editor | null; mode: "fast" | "deep"; instructions: string; cardIds: string[]; evidenceMode: "selected_only" | "selected_plus_library" }) {
  const store = useProposals.getState();
  const pid = makeId("prop");
  store.add({ id: pid, opId: null, kind: "draft", draftId: args.draftId, speech: args.speech, status: "running", partial: null, result: null, error: null, startedAt: Date.now(), baseDraftHash: draftHash(args.editor) });
  useWorkspace.getState().set({ right: "ai" });
  activityStart({ id: pid, kind: "draft", label: `writing the ${args.speech}`, speech: args.speech, draftId: args.draftId });
  await flushDoc(args.draftId);
  try {
    const result = await runOp(
      { kind: "draft_speech", roundId: args.round.id, speech: args.speech, draftId: args.draftId, mode: args.mode, cardIds: args.cardIds, evidenceMode: args.evidenceMode, instructions: args.instructions },
      (e) => onEvent(pid, e),
    );
    useProposals.getState().update(pid, { status: "ready", result: result as never, note: null, progress: null });
    activityEnd(pid, "ready");
  } catch (e) {
    failed(pid, e);
  }
}

/** Ask for a whole-speech keep/condense/cut plan that fits the time limit. */
export async function startFitOp(args: { round: RoundRecord; speech: SpeechId; draftId: string; instructions?: string }) {
  const store = useProposals.getState();
  const pid = makeId("prop");
  store.add({ id: pid, opId: null, kind: "fit", draftId: args.draftId, speech: args.speech, status: "running", partial: null, result: null, error: null, startedAt: Date.now() });
  useWorkspace.getState().set({ right: "ai" });
  activityStart({ id: pid, kind: "fit", label: `fitting the ${args.speech} to time`, speech: args.speech, draftId: args.draftId });
  // Make sure the server sees the latest text.
  await flushDoc(args.draftId);
  try {
    const result = await runOp({ kind: "fit_speech", roundId: args.round.id, speech: args.speech, draftId: args.draftId, instructions: args.instructions ?? "", mode: "fast" }, (e) => onEvent(pid, e));
    useProposals.getState().update(pid, { status: "ready", result: result as never, progress: null });
    activityEnd(pid, "ready");
  } catch (e) {
    failed(pid, e);
  }
}

/**
 * Update a draft for what changed (A3): answers to new arguments, links to the
 * sections that already answer them, minimal edits where an argument changed
 * or the team asked. `auto` marks live pre-drafting, which stays out of the
 * way (no panel switch; nothing shown when the draft is already up to date).
 */
export async function startPatchOp(args: { round: RoundRecord; speech: SpeechId; draftId: string; instructions?: string; cardIds?: string[]; auto?: boolean }): Promise<PatchResult | null> {
  const store = useProposals.getState();
  const pid = makeId("prop");
  store.add({ id: pid, opId: null, kind: "patch", draftId: args.draftId, speech: args.speech, status: "running", partial: null, result: null, error: null, startedAt: Date.now(), auto: args.auto });
  if (!args.auto) useWorkspace.getState().set({ right: "ai" });
  activityStart({ id: pid, kind: "patch", label: args.auto ? `pre-drafting the ${args.speech}` : `updating the ${args.speech}`, speech: args.speech, draftId: args.draftId });
  await flushDoc(args.draftId);
  try {
    const result = (await runOp(
      { kind: "patch_speech", roundId: args.round.id, speech: args.speech, draftId: args.draftId, instructions: args.instructions ?? "", cardIds: args.cardIds ?? useWorkspace.getState().basket, evidenceMode: "selected_plus_library", mode: "fast", auto: !!args.auto },
      (e) => onEvent(pid, e),
    )) as PatchResult;
    useProposals.getState().update(pid, { status: args.auto && result.upToDate ? "dismissed" : "ready", result, note: null, progress: null });
    useProposals.getState().supersede(args.draftId, pid);
    activityEnd(pid, result.upToDate ? "dismissed" : "ready", result.upToDate ? "Nothing to change" : undefined);
    return result;
  } catch (e) {
    failed(pid, e, args.auto);
    return null;
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
  let heading = "";
  found.node.forEach((c) => {
    if (!heading && c.type.name === "heading") heading = c.textContent.trim();
  });
  activityStart({ id: pid, kind: "revision", label: `revising “${heading.slice(0, 40) || "a section"}” (${args.action})`, speech: args.speech, draftId: args.draftId });
  // Make sure the server sees the latest text before it reads the section.
  await flushDoc(args.draftId);
  try {
    const result = await runOp(
      { kind: "revise_section", roundId: args.round.id, speech: args.speech, draftId: args.draftId, sectionId: args.sectionId, action: args.action, instructions: args.instructions ?? "", cardIds: useWorkspace.getState().basket },
      (e) => onEvent(pid, e),
    );
    useProposals.getState().update(pid, { status: "ready", result: result as never });
    activityEnd(pid, "ready");
  } catch (e) {
    failed(pid, e);
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
  versions = 1,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  round: RoundRecord;
  speech: SpeechId;
  draftDoc: Y.Doc | null;
  editor: Editor | null;
  graph: RoundGraph | null;
  /** how many drafts this speech has (names the next version) */
  versions?: number;
}) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [instructions, setInstructions] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [how, setHow] = useState<"update" | "new">("update");
  const draft = useDraft(draftDoc);
  const hasContent = !!draft && draft.items.some((i) => i.type === "section" || i.type === "card" || ("text" in i && i.text.trim() !== ""));
  const updating = hasContent && how === "update";
  // What an update would cover, from the flow as this browser has it (the server re-checks).
  const cs = useMemo(() => (graph && draft && hasContent ? changeSet({ graph, speech, draft, recorded: new Set() }) : null), [graph, draft, speech, hasContent]);
  const evidenceMode = onlySelected ? "selected_only" : "selected_plus_library";

  async function start() {
    if (!ws.draftId) return;
    onOpenChange(false);
    if (updating) {
      void startPatchOp({ round, speech, draftId: ws.draftId, instructions, cardIds: ws.basket });
      return;
    }
    if (hasContent) {
      // A full rebuild goes into a new draft tab; the current draft stays as it is.
      try {
        const n = versions + 1;
        const r = await api<{ id: string }>(`/api/rounds/${round.id}/drafts`, { method: "POST", json: { speech, variant: `v${n}`, title: `${speech} — v${n}` } });
        await qc.invalidateQueries({ queryKey: ["round", round.id] });
        ws.set({ draftId: r.id });
        void startDraftOp({ round, speech, draftId: r.id, editor: null, mode, instructions, cardIds: ws.basket, evidenceMode });
      } catch (e) {
        toast((e as Error).message, "bad");
      }
      return;
    }
    void startDraftOp({ round, speech, draftId: ws.draftId, editor, mode, instructions, cardIds: ws.basket, evidenceMode });
  }

  const pending = cs ? [cs.unanswered.length ? `${cs.unanswered.length} new argument${cs.unanswered.length === 1 ? "" : "s"} with no answer` : "", cs.stale.length ? `${cs.stale.length} answer${cs.stale.length === 1 ? "" : "s"} written before the argument changed` : "", cs.vanished.length ? `${cs.vanished.length} link${cs.vanished.length === 1 ? "" : "s"} to arguments no longer on the flow` : ""].filter(Boolean) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={hasContent ? `Build / revise the ${speech}` : `Build the ${speech}`}
      description={updating ? "Updates only what changed. Everything else in your draft stays exactly as it is, and you choose which changes to apply." : "The AI plans the speech from the flow, your instructions, and your evidence. You review it before anything goes into your draft."}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={!ws.draftId}>
            {updating ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />} {updating ? "Update draft" : hasContent ? "Build new version" : "Generate"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {hasContent ? (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "update", icon: RefreshCw, title: "Update this draft", text: "Adds answers to what's new, relinks, and fixes only answers whose argument changed. Nothing else is rewritten." },
                { v: "new", icon: Copy, title: "New version", text: "Builds the whole speech again in a new draft tab. This draft stays as it is." },
              ] as const
            ).map((m) => (
              <button key={m.v} onClick={() => setHow(m.v)} className={cn("rounded-lg border p-3 text-left", how === m.v ? "border-accent bg-accent-soft/60" : "border-line hover:bg-hover")}>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <m.icon className="size-4" /> {m.title}
                </div>
                <div className="mt-1 text-xs text-muted">{m.text}</div>
              </button>
            ))}
          </div>
        ) : null}
        {updating ? (
          <div className="rounded-lg bg-sunken p-3 text-[13px]">
            {cs && !isUpToDate(cs) ? (
              <>
                <div className="font-medium">Since this draft</div>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {pending.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-muted">The draft already answers everything on the flow. Add an instruction below to change something specific, e.g. “add a perm do both to the States CP”.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "fast", icon: Zap, title: "Fast", text: "First sections in seconds, full speech in about a minute. Best during prep time." },
                { v: "deep", icon: Brain, title: "Deep", text: "Stronger strategy (preferred in about 7 of 10 blind tests); about two minutes. Best before the round or with time to spare." },
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
        )}
        <Field label={updating ? "What else to change (optional)" : "Strategy and instructions"} hint={updating ? "e.g. “add a link turn on Politics with the Lee card” or “the 2NC’s 3rd answer was about Medicare, not Medicaid”." : "e.g. “Go for the DA and case turns; kick the CP by conceding the solvency deficit. Spend 1:30 on the perm.”"}>
          <Textarea
            rows={updating ? 3 : 4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={() => {
              if (!updating && instructions.trim() && ws.roundId) {
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
          {!updating ? (
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} disabled={!ws.basket.length} />
              Use only the selected cards
            </label>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
