"use client";

import { useMemo, useState } from "react";
import type * as Y from "yjs";
import { Check, Link2, Trash2, X } from "lucide-react";
import { Badge, Button, cn, EmptyState, Select, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Tooltip } from "@/components/ui";
import type { ArgRole, ArgUnit, DeliveryStatus, RoundGraph } from "@/domain/flow";
import { SPEECHES, speechesToAnswer, isBefore, type SpeechId } from "@/domain/format";
import { deleteArg, setRelationStatus, upsertArg, upsertDecision, upsertRelation } from "@/shared/round-doc";
import { makeId } from "@/shared/editor/schema";
import type { RoundBundle, RoundRecord } from "./types";
import { useWorkspace, type RightTab } from "./store";
import { DocsPanel } from "./docs-panel";
import { EvidencePanel } from "./evidence-panel";
import { AiPanel } from "./ai-panel";
import { CxPanel } from "./cx-panel";
import { CommentsPanel } from "./comments";
import { useDocSync, useYDocValue } from "@/client/sync/hooks";
import { useApp } from "@/components/shell/app-shell";
import { readThreads } from "@/shared/comments";
import type { SpanEnv } from "./editor/span-common";

export function SidePanel({ round, bundle, doc, graph, aiEnabled }: { round: RoundRecord; bundle: RoundBundle; doc: Y.Doc | null; graph: RoundGraph | null; aiEnabled: boolean }) {
  const ws = useWorkspace();
  const { user } = useApp();
  // Comments belong to the open draft of one of our speeches.
  const ours = !!ws.speech && SPEECHES[ws.speech].side === round.ourSide;
  const { sync: draftSync } = useDocSync(ours ? ws.draftId : null);
  const draftDoc = draftSync?.doc ?? null;
  const openThreads = (useYDocValue(draftDoc, readThreads) ?? []).filter((t) => !t.resolved).length;
  const env: SpanEnv | null = ours && ws.draftId && ws.speech ? { roundId: round.id, speech: ws.speech, draftId: ws.draftId, draftDoc, userId: user.id, userName: user.name, aiEnabled } : null;
  return (
    <Tabs value={ws.right} onValueChange={(v) => ws.set({ right: v as RightTab })} className="flex min-h-0 flex-1 flex-col">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="evidence">Evidence</TabsTrigger>
        <TabsTrigger value="docs">Docs</TabsTrigger>
        <TabsTrigger value="cx">CX</TabsTrigger>
        <TabsTrigger value="comments">{openThreads ? `Comments ${openThreads}` : "Comments"}</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto">
        <ArgDetails round={round} doc={doc} graph={graph} />
      </TabsContent>
      <TabsContent value="evidence" className="flex min-h-0 flex-1 flex-col">
        <EvidencePanel round={round} aiEnabled={aiEnabled} />
      </TabsContent>
      <TabsContent value="docs" className="flex min-h-0 flex-1 flex-col">
        <DocsPanel round={round} bundle={bundle} aiEnabled={aiEnabled} />
      </TabsContent>
      <TabsContent value="cx" className="min-h-0 flex-1 overflow-y-auto">
        <CxPanel round={round} doc={doc} aiEnabled={aiEnabled} />
      </TabsContent>
      <TabsContent value="comments" className="flex min-h-0 flex-1 flex-col">
        <CommentsPanel env={env} />
      </TabsContent>
      <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col">
        <AiPanel round={round} aiEnabled={aiEnabled} doc={doc} />
      </TabsContent>
    </Tabs>
  );
}

const ROLE_OPTIONS: { value: ArgRole; label: string }[] = [
  { value: "claim", label: "Claim (unspecified)" },
  { value: "uniqueness", label: "Uniqueness" },
  { value: "link", label: "Link" },
  { value: "internal_link", label: "Internal link" },
  { value: "impact", label: "Impact" },
  { value: "solvency", label: "Solvency" },
  { value: "plan_text", label: "Plan text" },
  { value: "cp_text", label: "CP text" },
  { value: "net_benefit", label: "Net benefit" },
  { value: "perm", label: "Permutation" },
  { value: "interpretation", label: "Interpretation" },
  { value: "violation", label: "Violation" },
  { value: "standard", label: "Standard" },
  { value: "voter", label: "Voter" },
  { value: "alternative", label: "Alternative" },
  { value: "framework", label: "Framework" },
  { value: "theory", label: "Theory" },
  { value: "non_unique", label: "Non-unique" },
  { value: "no_link", label: "No link" },
  { value: "no_internal_link", label: "No internal link / won't happen" },
  { value: "no_impact", label: "No impact" },
  { value: "impact_mitigation", label: "Impact mitigation (not that bad)" },
  { value: "defense", label: "Other defense" },
  { value: "link_turn", label: "Link turn" },
  { value: "impact_turn", label: "Impact turn" },
  { value: "impact_calc", label: "Impact calculus" },
  { value: "overview", label: "Overview" },
  { value: "other", label: "Other" },
];

const DELIVERY: { value: DeliveryStatus; label: string }[] = [
  { value: "documented", label: "In the doc, not confirmed" },
  { value: "confirmed", label: "Confirmed read/said" },
  { value: "not_read", label: "Not read" },
  { value: "uncertain", label: "Unsure" },
];

function provenanceText(a: ArgUnit): string {
  switch (a.provenance.type) {
    case "document":
      return "From an uploaded document";
    case "user_note":
      return "Entered by a teammate";
    case "ai_inferred":
      return `AI interpretation (confidence ${Math.round(a.provenance.confidence * 100)}%) — review`;
    case "draft":
      return "Planned in a draft";
    case "heard":
      return `Heard in the ${a.provenance.speech}${a.provenance.source === "transcript" ? " (transcript)" : " (typed notes)"}: “${a.provenance.quote}”`;
  }
}

function ArgDetails({ round, doc, graph }: { round: RoundRecord; doc: Y.Doc | null; graph: RoundGraph | null }) {
  const ws = useWorkspace();
  const { user } = useApp();
  const arg = graph?.args.find((a) => a.id === ws.selectedArgId) ?? null;
  const [linking, setLinking] = useState(false);
  const pos = graph?.positions.find((p) => p.id === arg?.positionId);
  const argById = useMemo(() => new Map((graph?.args ?? []).map((a) => [a.id, a])), [graph]);

  if (!arg || !doc || !graph) {
    return (
      <EmptyState title="Select an argument">
        Pick an argument in the coverage list or the flow to see what it answers, what answers it, and where it came from. You can correct anything here; your corrections are never overwritten by automatic updates.
      </EmptyState>
    );
  }
  const outgoing = graph.relations.filter((r) => r.from === arg.id);
  const incoming = graph.relations.filter((r) => r.to.includes(arg.id));
  const update = (fields: Partial<ArgUnit>) => doc.transact(() => upsertArg(doc, { id: arg.id, ...fields }, { byHuman: true }));
  // Candidates this argument could answer: the opposing side's earlier arguments on the same position (or any if none).
  const candidates = graph.args.filter((a) => a.side !== arg.side && isBefore(a.speech, arg.speech) && (a.positionId === arg.positionId || !pos));
  const ourSpeech = ws.speech && SPEECHES[ws.speech].side === round.ourSide ? ws.speech : null;
  const mustAnswer = ourSpeech ? speechesToAnswer(ourSpeech).includes(arg.speech) && arg.side !== round.ourSide : false;

  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
          <Badge tone={arg.side === "aff" ? "aff" : "neg"}>{arg.speech}</Badge>
          <span>{pos?.name ?? "Unsorted"}</span>
          {arg.humanEdited ? <Badge tone="accent">corrected</Badge> : null}
        </div>
        <Textarea rows={3} defaultValue={arg.text} key={arg.id + arg.text} onBlur={(e) => e.target.value.trim() !== arg.text && update({ text: e.target.value.trim() })} className="text-[13px]" />
        <div className={cn("mt-1 text-[11px]", arg.provenance.type === "ai_inferred" ? "text-info" : "text-faint")}>{provenanceText(arg)}</div>
        {arg.provenance.type === "document" && arg.provenance.excerpt ? <div className="mt-1 rounded bg-sunken px-2 py-1 text-[11.5px] text-muted">&ldquo;{arg.provenance.excerpt}&rdquo;</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-medium text-muted">
          Role
          <Select value={arg.role} onChange={(e) => update({ role: e.target.value as ArgRole })} className="mt-1 h-8 text-[12.5px]">
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-[11px] font-medium text-muted">
          Delivery
          <Select value={arg.delivery} onChange={(e) => update({ delivery: e.target.value as DeliveryStatus })} className="mt-1 h-8 text-[12.5px]" disabled={arg.delivery === "planned"}>
            {(arg.delivery === "planned" ? [{ value: "planned" as DeliveryStatus, label: "Planned" }] : DELIVERY).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block text-[11px] font-medium text-muted">
        Warrant (why it&apos;s true)
        <Textarea rows={2} defaultValue={arg.warrant ?? ""} key={arg.id + (arg.warrant ?? "")} onBlur={(e) => (e.target.value.trim() || undefined) !== arg.warrant && update({ warrant: e.target.value.trim() })} className="mt-1 text-[12.5px]" placeholder="Their reasoning or evidence, as you understand it" />
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Answers</span>
          <Button size="xs" variant="ghost" onClick={() => setLinking((l) => !l)}>
            <Link2 className="size-3" /> Link
          </Button>
        </div>
        {outgoing.length === 0 ? <div className="text-xs text-faint">Not linked to anything it answers.</div> : null}
        {outgoing.map((r) =>
          r.to.map((t) => (
            <RelationRow key={r.id + t} label={`${r.type.replace("_", " ")}${r.grouped ? " (group)" : ""}`} target={argById.get(t)} suggested={r.status === "suggested"} ai={r.provenance.type === "ai_inferred"} onConfirm={() => doc.transact(() => setRelationStatus(doc, r.id, "confirmed"))} onReject={() => doc.transact(() => setRelationStatus(doc, r.id, "rejected"))} />
          )),
        )}
        {linking ? (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">
            {candidates.length === 0 ? <div className="p-2 text-xs text-faint">No earlier opposing arguments on this position.</div> : null}
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  doc.transact(() => upsertRelation(doc, { id: makeId("rel"), type: "answers", from: arg.id, to: [c.id], provenance: { type: "user_note", by: user.id }, status: "confirmed" }));
                  setLinking(false);
                }}
                className="block w-full border-b border-line px-2 py-1.5 text-left text-xs last:border-0 hover:bg-hover"
              >
                <span className="font-semibold text-faint">{c.speech}</span> {c.text}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Answered by</div>
        {incoming.length === 0 ? <div className="text-xs text-faint">Nothing on the flow answers this yet.</div> : null}
        {incoming.map((r) => (
          <RelationRow key={r.id} label={r.type.replace("_", " ")} target={argById.get(r.from)} suggested={r.status === "suggested"} ai={r.provenance.type === "ai_inferred"} onConfirm={() => doc.transact(() => setRelationStatus(doc, r.id, "confirmed"))} onReject={() => doc.transact(() => setRelationStatus(doc, r.id, "rejected"))} />
        ))}
      </div>

      {mustAnswer && ourSpeech ? (
        <div className="rounded-lg border border-line p-2.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">In the {ourSpeech}</div>
          <div className="flex flex-wrap gap-1.5">
            <Tooltip content="Record that you are choosing not to answer this. Coverage shows it as deprioritized, not unanswered.">
              <Button size="xs" onClick={() => doc.transact(() => upsertDecision(doc, { id: makeId("dec"), speech: ourSpeech, kind: "deprioritize", targets: [arg.id], reason: window.prompt("Why? (optional)") ?? "" }))}>
                Deprioritize
              </Button>
            </Tooltip>
            <Button size="xs" onClick={() => doc.transact(() => upsertDecision(doc, { id: makeId("dec"), speech: ourSpeech, kind: "concede", targets: [arg.id], reason: window.prompt("Why concede this? (e.g. to kick the DA)") ?? "" }))}>
              Concede
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          size="xs"
          variant="ghost"
          className="text-bad"
          onClick={() => {
            if (window.confirm("Remove this argument from the flow?")) {
              doc.transact(() => deleteArg(doc, arg.id));
              ws.set({ selectedArgId: null });
            }
          }}
        >
          <Trash2 className="size-3" /> Remove from flow
        </Button>
      </div>
    </div>
  );
}

function RelationRow({ label, target, suggested, ai, onConfirm, onReject }: { label: string; target?: ArgUnit; suggested: boolean; ai: boolean; onConfirm: () => void; onReject: () => void }) {
  const ws = useWorkspace();
  if (!target) return null;
  return (
    <div className={cn("mb-1 flex items-start gap-1.5 rounded-md px-1.5 py-1 text-xs", suggested && "bg-info-soft/60")}>
      <span className="mt-px shrink-0 text-faint">{label}</span>
      <button className="min-w-0 flex-1 text-left hover:underline" onClick={() => ws.set({ selectedArgId: target.id })}>
        <span className="font-semibold text-faint">{target.speech}</span> {target.text}
      </button>
      {suggested ? (
        <span className="flex shrink-0 gap-0.5">
          <Tooltip content={ai ? "AI suggested this link. Confirm it." : "Confirm link"}>
            <button onClick={onConfirm} className="rounded p-0.5 text-ok hover:bg-hover" aria-label="Confirm link">
              <Check className="size-3.5" />
            </button>
          </Tooltip>
          <button onClick={onReject} className="rounded p-0.5 text-bad hover:bg-hover" aria-label="Reject link">
            <X className="size-3.5" />
          </button>
        </span>
      ) : null}
    </div>
  );
}

export type { SpeechId };
