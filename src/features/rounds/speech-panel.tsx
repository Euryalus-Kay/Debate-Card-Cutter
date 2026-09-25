"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type * as Y from "yjs";
import { Download, FilePlus2, Plus, Sparkles, CheckCircle2, Copy, Scissors, History } from "lucide-react";
import { api, downloadFrom } from "@/client/api";
import { flushDoc, useDocSync, useYDocValue } from "@/client/sync/hooks";
import { Badge, Button, cn, EmptyState, Menu, MenuContent, MenuItem, MenuTrigger, Textarea, Tooltip, toast } from "@/components/ui";
import { useApp } from "@/components/shell/app-shell";
import { getFormat, speechSeconds, SPEECH_IDS, SPEECHES, type SpeechId } from "@/domain/format";
import type { RoundGraph } from "@/domain/flow";
import { capRatesForJudge, estimate, formatClock } from "@/domain/timing";
import { itemLoad, type DraftItem } from "@/shared/draft-model";
import { prepUsedMs, readSlots, readTimers, updateSlot, type SlotRecord } from "@/shared/round-doc";
import { useRateProfile } from "@/client/use-settings";
import type { RoundBundle, RoundRecord } from "./types";
import { useWorkspace } from "./store";
import { claimForSection, useRoundResearch } from "./round-research";
import { findSectionNode } from "./proposals";
import { HistoryDialog } from "./history-dialog";
import { speechSpeaker, useTeamMembers } from "./speakers";
import { EditorRoundCtx } from "./editor/context";
import { EditorToolbar, SpeechEditorView, useSpeechEditor } from "./editor/speech-editor";
import { useDraft } from "./draft-hooks";
import { OpponentDocView } from "./docs-panel";
import { GenerateDialog, runSectionAi, startFitOp } from "./ai-actions";
import { registerEditor } from "./editor/active-editor";

export function SpeechPanel({
  round,
  bundle,
  doc,
  graph,
  slots,
  aiEnabled,
  userId,
}: {
  round: RoundRecord;
  bundle: RoundBundle;
  doc: Y.Doc | null;
  graph: RoundGraph | null;
  slots: Record<SpeechId, SlotRecord> | null;
  aiEnabled: boolean;
  userId: string;
}) {
  const ws = useWorkspace();
  const speech = ws.speech;
  if (!speech) return null;
  const ours = SPEECHES[speech].side === round.ourSide;
  if (!ours) return <OpponentSpeechView round={round} bundle={bundle} doc={doc} speech={speech} slots={slots} />;
  return <OurSpeechView round={round} bundle={bundle} doc={doc} graph={graph} speech={speech} aiEnabled={aiEnabled} userId={userId} />;
}

function OurSpeechView({ round, bundle, doc, graph, speech, aiEnabled, userId }: { round: RoundRecord; bundle: RoundBundle; doc: Y.Doc | null; graph: RoundGraph | null; speech: SpeechId; aiEnabled: boolean; userId: string }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { user } = useApp();
  const drafts = bundle.drafts.filter((d) => d.speech === speech);
  const [creating, setCreating] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!drafts.length) {
      if (ws.draftId) ws.set({ draftId: null });
      return;
    }
    if (!ws.draftId || !drafts.some((d) => d.id === ws.draftId)) ws.set({ draftId: drafts[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech, drafts.map((d) => d.id).join(",")]);

  const { sync: draftSync, snapshot } = useDocSync(ws.draftId);
  const draftDoc = draftSync?.doc ?? null;
  const editor = useSpeechEditor(draftDoc, true);
  useEffect(() => {
    if (!ws.draftId) return;
    registerEditor(ws.draftId, editor);
    return () => registerEditor(ws.draftId!, null);
  }, [editor, ws.draftId]);
  const draft = useDraft(draftDoc);
  const ownRates = useRateProfile();
  // Time the speech at its speaker's pace (FMT-2), capped at the judge's pace if their paradigm limits speed (TIME-6).
  const members = useTeamMembers(round.teamId);
  const speaker = speechSpeaker(round, speech, members.data?.members, ownRates);
  const judgeSpeed = round.judges?.[0]?.profile?.speed?.value;
  const { profile: rates, cap: judgeCap } = useMemo(() => capRatesForJudge(speaker.rates, judgeSpeed), [speaker.rates, judgeSpeed]);
  const fmt = getFormat(round.formatId, round.formatOverrides as never);
  // Prep overage, when the tournament deducts it, comes off our next undelivered speech.
  const timers = useYDocValue(doc, readTimers);
  const slotsNow = useYDocValue(doc, readSlots);
  const now = useNow(!!timers?.running);
  const overSec = timers ? Math.max(0, (prepUsedMs(timers, round.ourSide, now) - fmt.prepSecondsPerTeam * 1000) / 1000) : 0;
  const nextOurs = slotsNow ? SPEECH_IDS.find((s) => SPEECHES[s].side === round.ourSide && slotsNow[s].status !== "delivered") : undefined;
  const deduction = round.settings?.prepOverage === "deduct" && overSec > 0 && nextOurs === speech ? Math.round(overSec) : 0;
  const limit = speechSeconds(fmt, speech) - deduction;
  const partnerSections = useMemo(() => new Map((snapshot?.others ?? []).filter((o) => o.state.section).map((o) => [o.state.section!, o.state.name ?? "Partner"])), [snapshot?.others]);

  useEffect(() => {
    draftSync?.setPresence({ section: ws.selectedSectionId ?? undefined, activity: "editing", name: user.name });
  }, [draftSync, ws.selectedSectionId, user.name]);

  async function createDraft(variant?: string) {
    setCreating(true);
    try {
      const r = await api<{ id: string }>(`/api/rounds/${round.id}/drafts`, { method: "POST", json: { speech, variant, title: variant ? `${speech} — ${variant}` : `${speech} draft` } });
      await qc.invalidateQueries({ queryKey: ["round", round.id] });
      ws.set({ draftId: r.id });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setCreating(false);
    }
  }

  async function markDelivered() {
    if (!doc || !ws.draftId) return;
    doc.transact(() => updateSlot(doc, speech, { status: "delivered", deliveredDraftId: ws.draftId, deliveredAt: Date.now() }));
    try {
      await flushDoc(ws.draftId); // the delivered snapshot must include the last edits
      await api(`/api/docs/${ws.draftId}/deliver`, { method: "POST", json: {} });
      toast(`Saved a delivered snapshot of the ${speech}. Later edits won't change it.`, "ok");
      await qc.invalidateQueries({ queryKey: ["round", round.id] });
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  if (!drafts.length) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          icon={<FilePlus2 className="size-8" />}
          title={`Start the ${speech}`}
          action={
            <div className="flex gap-2">
              <Button onClick={() => createDraft()} loading={creating}>
                Blank draft
              </Button>
              {aiEnabled ? (
                <Button
                  variant="primary"
                  onClick={async () => {
                    await createDraft();
                    setGenOpen(true);
                  }}
                >
                  <Sparkles className="size-4" /> Build with AI
                </Button>
              ) : null}
            </div>
          }
        >
          {SPEECHES[speech].name}. {Math.round(limit / 60)} minutes.{" "}
          {aiEnabled ? "Build it from your flow and selected evidence, or start from scratch." : "AI is off for this round; build it by hand from the flow and your library."}
        </EmptyState>
        <GenerateDialog open={genOpen} onOpenChange={setGenOpen} round={round} speech={speech} draftDoc={draftDoc} editor={editor} graph={graph} />
      </div>
    );
  }

  const topItems: DraftItem[] = draft?.items ?? [];
  const lines = topItems.map((it, i) => {
    const e = estimate(itemLoad(it), rates);
    const label = it.type === "section" ? it.section.title || "Section" : it.type === "card" ? it.tag.slice(0, 40) || "Card" : it.type === "heading" ? it.text : "Text";
    return { key: it.type === "section" ? it.section.id : `i${i}`, label, seconds: e.seconds, budget: it.type === "section" ? it.section.budgetSec : null };
  });
  const total = lines.reduce((a, l) => a + l.seconds, 0);
  const u = rates.uncertainty;
  const over = total - limit;
  const currentDraft = drafts.find((d) => d.id === ws.draftId);

  return (
    <EditorRoundCtx.Provider
      value={{
        graph,
        rates,
        userId,
        userName: user.name,
        partnerSections,
        aiEnabled,
        onSectionAi: (sectionId, action) => runSectionAi({ round, speech, draftId: ws.draftId!, editor, sectionId, action }),
        onSectionResearch: (sectionId) => {
          if (!editor) return;
          const found = findSectionNode(editor, sectionId);
          let heading = "";
          found?.node.forEach((c) => {
            if (!heading && c.type.name === "heading") heading = c.textContent.trim();
          });
          useRoundResearch.getState().open({ sectionId, draftId: ws.draftId, claim: claimForSection(editor, sectionId), context: `${round.ourSide === "aff" ? "Aff" : "Neg"} ${speech}${heading ? ` — ${heading}` : ""}` });
        },
        onCardOpen: (cardId) => {
          if (cardId) window.open(`/library/cards/${cardId}`, "_blank");
        },
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line bg-elev px-2">
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => ws.set({ draftId: d.id })}
              className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium", d.id === ws.draftId ? "bg-hover text-fg" : "text-muted hover:bg-hover")}
            >
              {d.variant || "Main"}
              {d.status === "delivered" ? <CheckCircle2 className="size-3.5 text-ok" /> : null}
            </button>
          ))}
          <Menu>
            <MenuTrigger asChild>
              <Button size="xs" variant="ghost" aria-label="New draft">
                <Plus className="size-3.5" />
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem
                onSelect={() => {
                  const name = window.prompt("Name this alternative strategy", "Alt");
                  if (name) void createDraft(name);
                }}
              >
                <Copy className="size-3.5" /> New alternative strategy
              </MenuItem>
            </MenuContent>
          </Menu>
          <div className="ml-auto flex items-center gap-1.5">
            {aiEnabled ? (
              <Button size="sm" variant="primary" onClick={() => setGenOpen(true)}>
                <Sparkles className="size-3.5" /> Build / revise
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setHistoryOpen(true)} aria-label="Draft history">
              <History className="size-3.5" /> History
            </Button>
            <Button
              size="sm"
              aria-label="Download as .docx"
              onClick={async () => {
                // The file is built on the server: send the latest keystrokes first.
                await flushDoc(ws.draftId!);
                downloadFrom(`/api/docs/${ws.draftId}/export`);
              }}
            >
              <Download className="size-3.5" /> .docx
            </Button>
            <Tooltip content="Save a frozen copy as what was actually delivered. The flow will treat it as delivered.">
              <Button size="sm" variant={currentDraft?.status === "delivered" ? "subtle" : "secondary"} onClick={markDelivered}>
                <CheckCircle2 className="size-3.5" /> {currentDraft?.status === "delivered" ? "Delivered" : "Mark delivered"}
              </Button>
            </Tooltip>
          </div>
        </div>
        <EditorToolbar editor={editor} />
        <SpeechEditorView editor={editor} />
        <div className="shrink-0 border-t border-line bg-elev px-3 py-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-medium">
              ~{formatClock(total)} <span className="text-faint">of</span> {formatClock(limit)}
            </span>
            <span className="text-faint">
              range {formatClock(total * (1 - u))}–{formatClock(total * (1 + u))}
              {rates.observations.length ? "" : " · uncalibrated"}
              {speaker.name ? ` · ${speaker.name}${speaker.usesSpeakerRates ? "'s pace" : " (uncalibrated, your pace)"}` : ""}
              {judgeCap ? ` · at the judge's ${judgeCap} pace` : ""}
              {deduction ? ` · ${formatClock(deduction)} prep overage deducted` : ""}
            </span>
            {over > 0 ? <Badge tone="bad">over by ~{formatClock(over)}</Badge> : total > 0 ? <Badge tone="ok">{formatClock(limit - total)} to spare</Badge> : null}
            {aiEnabled && ws.draftId && (over > 0 || (total > 0 && total < limit * 0.9)) ? (
              <Tooltip content={over > 0 ? "Plan cuts and condensing so the speech fits, keeping what decides the round." : "The speech leaves time unused: plan where to add warrants, comparison, and evidence."}>
                <Button size="xs" className="ml-auto" onClick={() => void startFitOp({ round, speech, draftId: ws.draftId! })}>
                  <Scissors className="size-3.5" /> {over > 0 ? "Fit to time" : "Fill to time"}
                </Button>
              </Tooltip>
            ) : null}
          </div>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
            {lines.map((l, i) => (
              <div
                key={l.key}
                title={`${l.label}: ~${formatClock(l.seconds)}`}
                className={cn("h-full border-r border-elev", i % 2 ? "bg-accent/70" : "bg-accent/45", l.budget && l.seconds > l.budget * 1.05 && "bg-bad/70")}
                style={{ width: `${Math.min(100, (l.seconds / Math.max(limit, total)) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} round={round} speech={speech} draftDoc={draftDoc} editor={editor} graph={graph} />
      {ws.draftId ? <HistoryDialog draftId={ws.draftId} open={historyOpen} onOpenChange={setHistoryOpen} /> : null}
    </EditorRoundCtx.Provider>
  );
}

function OpponentSpeechView({ round, bundle, doc, speech, slots }: { round: RoundRecord; bundle: RoundBundle; doc: Y.Doc | null; speech: SpeechId; slots: Record<SpeechId, SlotRecord> | null }) {
  const uploads = bundle.uploads.filter((u) => u.attribution?.speech === speech);
  const slot = useYDocValue(doc, (d) => readSlots(d)[speech], [speech]) ?? slots?.[speech];
  // Local edits until blur; reset when the shared notes (or the speech) change underneath.
  const shared = `${speech}\u0000${slot?.notes ?? ""}`;
  const [notes, setNotes] = useState(slot?.notes ?? "");
  const [base, setBase] = useState(shared);
  if (base !== shared) {
    setBase(shared);
    setNotes(slot?.notes ?? "");
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-line bg-elev px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">
            Their {speech} <span className="font-normal text-muted">· {SPEECHES[speech].name}</span>
          </div>
          <div className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              variant={slot?.status === "delivered" ? "subtle" : "secondary"}
              onClick={() => doc && doc.transact(() => updateSlot(doc, speech, { status: slot?.status === "delivered" ? "documented" : "delivered" }))}
            >
              <CheckCircle2 className="size-3.5" /> {slot?.status === "delivered" ? "Delivered" : "Mark delivered"}
            </Button>
            <Tooltip content="Confirm that everything in their document was read, except cards you mark as not read. Until then, items stay 'documented, not confirmed'.">
              <Button size="sm" variant={slot?.readConfirmed ? "subtle" : "secondary"} onClick={() => doc && doc.transact(() => updateSlot(doc, speech, { readConfirmed: !slot?.readConfirmed }))}>
                {slot?.readConfirmed ? "Read confirmed" : "Confirm read as documented"}
              </Button>
            </Tooltip>
          </div>
        </div>
        <label className="mt-3 block text-xs font-medium text-muted">What they actually said (notes, analytics not in the doc, cards they skipped)</label>
        <Textarea
          rows={3}
          className="mt-1"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => doc && notes !== (slot?.notes ?? "") && doc.transact(() => updateSlot(doc, speech, { notes }))}
          placeholder="e.g. 2NC only read the first 3 link cards; added an analytic that the perm severs"
        />
      </div>
      {uploads.length === 0 ? (
        <EmptyState title={`No ${speech} document`}>Add their speech document in the Docs tab on the right (upload .docx/.pdf or paste). It will be marked as documented, not confirmed delivered.</EmptyState>
      ) : (
        uploads.map((u) => <OpponentDocView key={u.id} upload={u} roundId={round.id} doc={doc} />)
      )}
    </div>
  );
}

/** Current time, ticking once a second while `active` (e.g. a prep clock is running). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
