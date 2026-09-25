"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/client/api";
import { useDocSync, useYDocValue } from "@/client/sync/hooks";
import { Button, cn, Dialog, Spinner, Tabs, TabsList, TabsTrigger, Textarea, toast } from "@/components/ui";
import { TeamScope, useApp } from "@/components/shell/app-shell";
import { nextSpeechFor, SPEECH_IDS, type SpeechId } from "@/domain/format";
import { readGraph, readSlots, recordedSpeeches } from "@/shared/round-doc";
import type { RoundBundle, RoundRecord } from "./types";
import { useWorkspace } from "./store";
import { TopBar, SpeechStepper } from "./top-bar";
import { CoveragePanel } from "./coverage-panel";
import { SpeechPanel } from "./speech-panel";
import { FlowGrid } from "./flow-grid";
import { ResearchDialog } from "./round-research";
import { SidePanel } from "./side-panel";
import { setRoundDoc } from "./editor/active-editor";
import { setActivityUser } from "./ai-activity";

export function aiEnabledFor(round: RoundRecord): boolean {
  if (round.aiOverride) return true;
  if (round.aiPolicy === "allowed") return true;
  if (round.aiPolicy === "prep_only") return round.phase === "prep";
  return false;
}

export function RoundWorkspace({ roundId }: { roundId: string }) {
  const { user } = useApp();
  const qc = useQueryClient();
  const ws = useWorkspace();
  const bundle = useQuery({ queryKey: ["round", roundId], queryFn: () => api<RoundBundle>(`/api/rounds/${roundId}`), refetchInterval: 10_000 });
  const round = bundle.data?.round;
  const { sync: stateSync, snapshot: stateSnap } = useDocSync(round?.stateDocId);
  const doc = stateSync?.doc ?? null;
  const slots = useYDocValue(doc, readSlots);
  const graph = useYDocValue(doc, (d) => readGraph(d, round?.ourSide ?? "aff"), [round?.ourSide]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  useEffect(() => {
    setRoundDoc(doc);
    setActivityUser({ id: user.id, name: user.name });
    return () => setRoundDoc(null);
  }, [doc, user.id, user.name]);

  // Reset per-round UI state when switching rounds.
  useEffect(() => {
    if (ws.roundId !== roundId) ws.set({ roundId, speech: null, draftId: null, selectedArgId: null, selectedSectionId: null, basket: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const hasDoc = useMemo(() => {
    const s = new Set<SpeechId>();
    for (const u of bundle.data?.uploads ?? []) if (u.attribution?.speech) s.add(u.attribution.speech);
    return s;
  }, [bundle.data?.uploads]);

  // One definition shared with the server (src/shared/round-doc.ts); slots and graph re-run it when the doc changes.
  const recorded = useMemo(() => (doc ? recordedSpeeches(doc, hasDoc) : new Set<SpeechId>(hasDoc)), [doc, hasDoc, slots, graph]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the selected speech: the one in the URL (so a mid-round refresh keeps your place), else the
  // next one we give (speeches with any record count as having happened).
  useEffect(() => {
    if (!round || !slots || ws.roundId !== roundId || ws.speech) return;
    const fromUrl = new URLSearchParams(window.location.search).get("speech");
    if (fromUrl && (SPEECH_IDS as readonly string[]).includes(fromUrl)) return ws.set({ speech: fromUrl as SpeechId });
    const st = SPEECH_IDS.map((id) => ({ speech: id, status: recorded.has(id) ? ("delivered" as const) : slots[id].status, hasDocument: hasDoc.has(id), hasNotes: !!slots[id].notes }));
    ws.set({ speech: nextSpeechFor(round.ourSide, st) ?? (round.ourSide === "aff" ? "2AR" : "2NR") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, slots, ws.roundId, ws.speech, recorded]);

  // Keep the selected speech in the URL.
  useEffect(() => {
    if (!ws.speech || ws.roundId !== roundId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("speech") === ws.speech) return;
    url.searchParams.set("speech", ws.speech);
    window.history.replaceState(window.history.state, "", url);
  }, [ws.speech, ws.roundId, roundId]);

  const draftSnaps = useMemo(() => [stateSnap], [stateSnap]);

  if (bundle.isLoading || !round) {
    return (
      <div className="flex h-full items-center justify-center">
        {bundle.error ? <p className="text-[13px] text-bad">{(bundle.error as Error).message}</p> : <Spinner />}
      </div>
    );
  }

  const aiEnabled = aiEnabledFor(round);

  async function patchRound(patch: Partial<RoundRecord>) {
    try {
      await api(`/api/rounds/${roundId}`, { method: "PATCH", json: patch });
      await qc.invalidateQueries({ queryKey: ["round", roundId] });
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  return (
    <TeamScope teamId={round.teamId}>
    <div className="flex h-full flex-col">
      <TopBar
        round={round}
        doc={doc}
        slots={slots}
        hasDoc={hasDoc}
        snapshots={draftSnaps}
        offsetMs={stateSnap?.serverOffsetMs ?? 0}
        others={(stateSnap?.others ?? []).map((o) => ({ name: o.state.name, section: o.state.section }))}
        onPhase={(phase) => patchRound({ phase })}
        onSettings={(settings) => patchRound({ settings })}
        onOverride={() => setOverrideOpen(true)}
        aiEnabled={aiEnabled}
      />
      <div className="border-b border-line bg-elev px-3 py-1.5 lg:hidden">
        <SpeechStepper slots={slots} ourSide={round.ourSide} hasDoc={hasDoc} />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[320px] shrink-0 flex-col border-r border-line bg-elev md:flex">
          <CoveragePanel round={round} doc={doc} graph={graph} recorded={recorded} slots={slots} aiEnabled={aiEnabled} />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <Tabs value={ws.center} onValueChange={(v) => ws.set({ center: v as "speech" | "flow" })} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="bg-elev">
              <TabsTrigger value="speech">{ws.speech ?? "Speech"}</TabsTrigger>
              <TabsTrigger value="flow">Flow</TabsTrigger>
            </TabsList>
            <div className={cn("min-h-0 flex-1", ws.center !== "speech" && "hidden")}>
              <SpeechPanel round={round} bundle={bundle.data!} doc={doc} graph={graph} slots={slots} aiEnabled={aiEnabled} userId={user.id} />
            </div>
            <div className={cn("min-h-0 flex-1 overflow-auto", ws.center !== "flow" && "hidden")}>
              <FlowGrid round={round} doc={doc} graph={graph} />
            </div>
          </Tabs>
        </section>
        <aside className="hidden w-[380px] shrink-0 flex-col border-l border-line bg-elev xl:flex">
          <SidePanel round={round} bundle={bundle.data!} doc={doc} graph={graph} aiEnabled={aiEnabled} />
        </aside>
      </div>
      <OverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        round={round}
        onConfirm={(reason) => {
          setOverrideOpen(false);
          void patchRound({ aiOverride: { by: user.id, at: new Date().toISOString(), reason } } as Partial<RoundRecord>);
        }}
      />
      {aiEnabled ? <ResearchDialog round={round} /> : null}
    </div>
    </TeamScope>
  );
}

function OverrideDialog({ open, onOpenChange, round, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; round: RoundRecord; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Turn on AI for this round?"
      description={round.aiPolicy === "prep_only" ? "This round is set to allow AI only before the round starts." : "AI is off for this round."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep it off
          </Button>
          <Button variant="primary" disabled={reason.trim().length < 8} onClick={() => onConfirm(reason.trim())}>
            I understand — turn it on
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p>
          Many tournaments restrict in-round assistance. NSDA prohibits using devices to receive &ldquo;information not generated by the participating competitors in your round&rdquo; (penalty: disqualification). Some invitations
          ban outside assistance entirely. Confirm this tournament allows it.
        </p>
        <p className="text-muted">Your confirmation is recorded on the round.</p>
        <Textarea rows={2} placeholder="Why this is allowed (e.g. practice round; tournament rules permit AI)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}
