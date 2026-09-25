"use client";

import { useMemo, useState } from "react";
import type * as Y from "yjs";
import { AlertTriangle, ChevronDown, ChevronRight, CircleDashed, Info, Sparkles } from "lucide-react";
import { Badge, Button, cn, EmptyState, Tooltip } from "@/components/ui";
import { detectConflicts, liveOffenseOnKickedPositions, possiblyKickedPositions, POSITION_KIND_LABEL, type ArgUnit, type CoverageItem, type CoverageStatus, type RoundGraph } from "@/domain/flow";
import { getFormat, SPEECHES, speechesToAnswer, validatePrepContext, type SpeechId, SPEECH_IDS } from "@/domain/format";
import { prepUsedMs, readTimers, type SlotRecord } from "@/shared/round-doc";
import { useDocSync, useYDocValue } from "@/client/sync/hooks";
import { prepGuide } from "@/domain/analytic-checks";
import { formatClock } from "@/domain/timing";
import { useNow } from "./ai-progress";
import type { RoundRecord } from "./types";
import { useWorkspace } from "./store";
import { useDraft } from "./draft-hooks";
import { checkSections, checkSpeech } from "@/domain/speech-checks";
import { changeSet } from "@/domain/patch";
import { startPatchOp } from "./ai-actions";
import { useProposals } from "./proposals";

export const STATUS_META: Record<CoverageStatus, { label: string; tone: "ok" | "teal" | "info" | "neutral" | "bad" | "warn"; hint: string }> = {
  answered: { label: "Answered", tone: "ok", hint: "A section of your draft answers this argument directly." },
  grouped: { label: "Grouped", tone: "teal", hint: "Answered as part of a group with other arguments." },
  cross_applied: { label: "Cross-applied", tone: "info", hint: "Addressed by cross-applying an argument from elsewhere." },
  conceded: { label: "Conceded", tone: "neutral", hint: "You chose to concede or kick this." },
  deprioritized: { label: "Deprioritized", tone: "neutral", hint: "You chose not to spend time on this." },
  unanswered: { label: "Unanswered", tone: "bad", hint: "Nothing in your draft addresses this yet." },
  uncertain: { label: "Uncertain", tone: "warn", hint: "Unclear whether this was read, or the reading of it is low-confidence." },
};

export function ArgLine({ arg, compact }: { arg: ArgUnit; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={cn("text-[13px] leading-snug", compact && "line-clamp-2")}>
        {arg.label ? <span className="mr-1 font-semibold text-muted">{arg.label}.</span> : null}
        {arg.text}
        {arg.evidence === "analytic" ? <span className="ml-1.5 rounded bg-sunken px-1 text-[10.5px] font-medium text-muted">analytic</span> : null}
      </div>
      {arg.cites?.length ? <div className="mt-0.5 truncate text-[11.5px] text-faint">{arg.cites.join(", ")}</div> : null}
    </div>
  );
}

export function CoveragePanel({ round, doc, graph, recorded, slots, aiEnabled }: { round: RoundRecord; doc: Y.Doc | null; graph: RoundGraph | null; recorded: Set<SpeechId>; slots: Record<SpeechId, SlotRecord> | null; aiEnabled: boolean }) {
  const ws = useWorkspace();
  const speech = ws.speech;
  const { sync: draftSync } = useDocSync(ws.draftId);
  const draft = useDraft(draftSync?.doc);
  const ours = speech ? SPEECHES[speech].side === round.ourSide : false;

  const checked = useMemo(() => {
    if (!graph || !speech || !ours) return null;
    const exp = round.judges?.[0]?.profile?.experience?.value;
    return checkSpeech({ graph, speech, sections: checkSections(draft), recorded, judgeLay: exp === "lay" || exp === "parent", newArgumentPolicy: getFormat(round.formatId, round.formatOverrides as never).newArgumentPolicy });
  }, [graph, speech, ours, draft, recorded, round.judges, round.formatId, round.formatOverrides]);
  const report = checked?.coverage ?? null;
  const [showAllChecks, setShowAllChecks] = useState(false);
  // What an update of the open draft would answer (final rebuttals: only the flows the draft goes for).
  const toAnswer = useMemo(() => (graph && speech && ours && draft ? changeSet({ graph, speech, draft, recorded }).unanswered.length : 0), [graph, speech, ours, draft, recorded]);
  const updating = useProposals((s) => s.proposals.some((p) => p.kind === "patch" && p.draftId === ws.draftId && p.status === "running" && !p.auto));
  // How much prep to spend on this speech (Snider's caps), from the round's prep clock.
  const timers = useYDocValue(doc, readTimers);
  const now = useNow(!!timers?.running);
  const prepTotal = getFormat(round.formatId, round.formatOverrides as never).prepSecondsPerTeam;
  const prep = speech && ours && timers && slots?.[speech]?.status !== "delivered" ? prepGuide(speech, prepTotal, prepUsedMs(timers, round.ourSide, now) / 1000) : null;

  const issues = useMemo(() => {
    if (!speech || !slots) return [];
    return validatePrepContext(
      speech,
      round.ourSide,
      SPEECH_IDS.map((id) => ({ speech: id, status: slots[id].status === "not_started" && recorded.has(id) ? "documented" : slots[id].status, hasDocument: recorded.has(id), hasNotes: !!slots[id].notes })),
    )
      .filter((i) => i.severity !== "info")
      // Looking back at a speech that already happened is normal; only warn when preparing an unrecorded one.
      .filter((i) => !(i.code === "later_speech_present" && recorded.has(speech)));
  }, [speech, slots, recorded, round.ourSide]);

  const kicked = useMemo(() => (graph && speech && ours ? possiblyKickedPositions(graph, speech, recorded) : []), [graph, speech, ours, recorded]);
  const liveOffense = useMemo(() => (graph && speech && ours ? liveOffenseOnKickedPositions(graph, round.ourSide, speech, recorded) : []), [graph, speech, ours, recorded, round.ourSide]);

  const conflicts = useMemo(() => {
    if (!graph || !speech || !ours || !draft) return [];
    // Planned arguments = draft sections with a role, treated as our units on their position.
    const planned: ArgUnit[] = [];
    const walk = (items: typeof draft.items) => {
      for (const it of items) {
        if (it.type !== "section") continue;
        const s = it.section;
        const pos = s.positionId ?? (s.targets[0] ? graph.args.find((a) => a.id === s.targets[0])?.positionId : undefined);
        if (s.role && pos) planned.push({ id: s.id, positionId: pos, speech, side: round.ourSide, order: 0, text: s.title, role: s.role as ArgUnit["role"], cardIds: [], provenance: { type: "draft", draftId: ws.draftId ?? "", sectionId: s.id }, delivery: "planned" });
        walk(s.items);
      }
    };
    walk(draft.items);
    const prior = graph.args.filter((a) => a.side === round.ourSide);
    return detectConflicts(graph, round.ourSide, [...prior, ...planned]).filter((c) => c.severity !== "info" || planned.some((p) => c.argIds.includes(p.id)));
  }, [graph, speech, ours, draft, round.ourSide, ws.draftId]);

  if (!speech) return null;

  if (!ours) {
    return <OpponentSpeechSummary speech={speech} graph={graph} slots={slots} recorded={recorded} />;
  }

  const groups = new Map<string, CoverageItem[]>();
  for (const it of report?.items ?? []) {
    const key = it.position?.id ?? "unknown";
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const answerFrom = speechesToAnswer(speech);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-2.5">
        <div className="text-[13px] font-semibold">What the {speech} must answer</div>
        <div className="text-xs text-muted">{answerFrom.length ? `From the ${answerFrom.join(" + ")}` : "The 1AC starts the round."}</div>
        {report ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {(["unanswered", "uncertain", "answered", "grouped", "cross_applied", "deprioritized", "conceded"] as CoverageStatus[])
              .filter((k) => report.counts[k] > 0)
              .map((k) => (
                <Badge key={k} tone={STATUS_META[k].tone} title={STATUS_META[k].hint}>
                  {report.counts[k]} {STATUS_META[k].label.toLowerCase()}
                </Badge>
              ))}
          </div>
        ) : null}
        {prep ? (
          <Tooltip content={prep.note}>
            <div className="mt-1.5 text-[11.5px] text-muted">
              Prep for the {speech}: {prep.maxNowSec > 0 ? `up to ${formatClock(prep.maxNowSec)} more` : speech === "1NR" ? "none needed" : "past the usual share; save the rest"}
            </div>
          </Tooltip>
        ) : null}
        {aiEnabled && ws.draftId && toAnswer > 0 ? (
          <Tooltip content="Adds answers to just these arguments (or links the sections that already answer them). Nothing else in your draft changes; you review before it goes in.">
            <Button size="xs" variant="primary" className="mt-2" loading={updating} onClick={() => void startPatchOp({ round, speech, draftId: ws.draftId! })}>
              <Sparkles className="size-3" /> Answer the {toAnswer} remaining
            </Button>
          </Tooltip>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {report?.items.some((i) => i.arg.delivery === "documented") ? (
          <div className="border-b border-line px-3 py-2 text-xs text-muted">
            Some of these come from their document and aren&apos;t confirmed as read. Confirm or mark skipped cards on their speech; unconfirmed items are never treated as dropped.
          </div>
        ) : null}
        {issues.length || report?.recordWarnings.length ? (
          <div className="space-y-1.5 border-b border-line p-3">
            {issues.map((i, k) => (
              <div key={k} className={cn("flex gap-2 rounded-md px-2 py-1.5 text-xs", i.severity === "error" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{i.message}</span>
              </div>
            ))}
          </div>
        ) : null}
        {checked?.checks.length ? (
          <div className="space-y-1.5 border-b border-line p-3">
            <div className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-faint">
              Speech checks
              <span className="ml-auto font-normal normal-case tracking-normal">
                {checked.checks.filter((c) => c.severity === "critical").length} critical · {checked.checks.length} total
              </span>
            </div>
            {(showAllChecks ? checked.checks : checked.checks.slice(0, 5)).map((c, k) => (
              <button
                key={k}
                onClick={() => (c.argIds?.[0] ? ws.set({ selectedArgId: c.argIds[0], right: "details" }) : undefined)}
                className={cn("block w-full rounded-md px-2 py-1.5 text-left text-xs", c.severity === "critical" ? "bg-bad-soft text-bad" : c.severity === "warning" ? "bg-warn-soft text-warn" : "bg-sunken text-muted")}
              >
                {c.severity === "critical" ? <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" /> : null}
                {c.message}
              </button>
            ))}
            {checked.checks.length > 5 ? (
              <button onClick={() => setShowAllChecks(!showAllChecks)} className="text-[11.5px] text-accent-text hover:underline">
                {showAllChecks ? "Show fewer" : `Show all ${checked.checks.length}`}
              </button>
            ) : null}
          </div>
        ) : null}
        {conflicts.length ? (
          <div className="space-y-1.5 border-b border-line p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Strategy conflicts</div>
            {conflicts.map((c, k) => (
              <div key={k} className={cn("rounded-md px-2 py-1.5 text-xs", c.severity === "error" ? "bg-bad-soft text-bad" : c.severity === "warning" ? "bg-warn-soft text-warn" : "bg-sunken text-muted")}>
                {c.message}
              </div>
            ))}
          </div>
        ) : null}
        {!report?.items.length ? (
          <EmptyState icon={<CircleDashed className="size-7" />} title={speech === "1AC" || speech === "1NC" ? "Nothing to answer yet" : "No opponent arguments recorded"}>
            {speech === "1AC"
              ? "Build or import your 1AC."
              : `Add the ${answerFrom.join(" and ")} document(s) in the Docs tab, or type what they said. The flow fills in from there; missing speeches are never treated as concessions.`}
          </EmptyState>
        ) : (
          [...groups.entries()].map(([posId, items]) => <PositionGroup key={posId} items={items} ourSide={round.ourSide} />)
        )}
        {liveOffense.length ? (
          <div className="border-t border-line p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Live offense on kicked positions</div>
            {liveOffense.map(({ position, turns }) => (
              <div key={position.id} className="mb-2 rounded-md bg-ok-soft px-2 py-1.5 text-xs text-ok">
                <span className="font-semibold">{position.name}:</span> they stopped extending it, but your {turns.map((t) => t.text).join("; ")} still stands. Extend it as offense.
              </div>
            ))}
          </div>
        ) : null}
        {kicked.filter((k) => !liveOffense.some((l) => l.position.id === k.position.id)).length ? (
          <div className="border-t border-line p-3 text-xs text-muted">
            <div className="mb-1 flex items-center gap-1 font-semibold text-faint">
              <Info className="size-3.5" /> Not extended by the other side
            </div>
            {kicked.map((k) => (
              <div key={k.position.id}>
                {k.position.name} {k.certain ? "(appears kicked)" : "(unclear — their speech record is incomplete)"}
              </div>
            ))}
          </div>
        ) : null}
        {checked?.theirDrops.length ? (
          <div className="border-t border-line p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">They dropped (extend as offense)</div>
            {checked.theirDrops.map((d) => (
              <button key={d.arg.id} onClick={() => ws.set({ selectedArgId: d.arg.id, right: "details" })} className="mb-1 block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover">
                <div className="flex items-center gap-1.5">
                  <Tooltip content={d.reason}>
                    <span>
                      <Badge tone={d.safeToClaim ? "ok" : "neutral"}>{d.safeToClaim ? "Dropped" : "Maybe dropped"}</Badge>
                    </span>
                  </Tooltip>
                  <span className="text-[11px] text-faint">
                    {d.arg.speech} · {d.position?.name ?? ""}
                  </span>
                </div>
                <ArgLine arg={d.arg} compact />
                {!d.safeToClaim ? <div className="mt-0.5 text-[11px] text-muted">{d.reason}</div> : null}
              </button>
            ))}
          </div>
        ) : null}
        {report?.extensions.length ? (
          <div className="border-t border-line p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Your arguments to extend</div>
            {report.extensions.map((e) => (
              <button key={e.ours.id} onClick={() => ws.set({ selectedArgId: e.ours.id, right: "details" })} className="mb-1 block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover">
                <div className="flex items-center gap-1.5">
                  <Badge tone={e.extendedBy.length ? "ok" : "warn"}>{e.extendedBy.length ? "Extended" : "Not extended"}</Badge>
                  <span className="text-[11px] text-faint">{e.ours.speech}</span>
                </div>
                <ArgLine arg={e.ours} compact />
                {e.against.length ? <div className="mt-0.5 text-[11.5px] text-muted">vs {e.against.map((a) => a.text).join("; ")}</div> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PositionGroup({ items, ourSide }: { items: CoverageItem[]; ourSide: "aff" | "neg" }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(true);
  const pos = items[0].position;
  const unanswered = items.filter((i) => i.status === "unanswered").length;
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-hover">
        {open ? <ChevronDown className="size-3.5 text-faint" /> : <ChevronRight className="size-3.5 text-faint" />}
        <span className="flex-1 truncate text-[13px] font-semibold">{pos?.name ?? "Unsorted"}</span>
        {pos ? <span className="text-[11px] text-faint">{POSITION_KIND_LABEL[pos.kind]}</span> : null}
        {unanswered ? <Badge tone="bad">{unanswered}</Badge> : <Badge tone="ok">✓</Badge>}
      </button>
      {open ? (
        <ul className="pb-1.5">
          {items.map((it) => {
            const meta = STATUS_META[it.status];
            const selected = ws.selectedArgId === it.arg.id;
            return (
              <li key={it.arg.id}>
                <button
                  onClick={() => ws.set({ selectedArgId: it.arg.id, right: "details" })}
                  className={cn("flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-hover", selected && "bg-accent-soft/60")}
                >
                  <Tooltip content={meta.hint + (it.note ? ` ${it.note}` : "")}>
                    <span className="mt-0.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </span>
                  </Tooltip>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-faint">{it.arg.speech}</div>
                    <ArgLine arg={it.arg} compact />
                    {it.note ? <div className="mt-0.5 text-[11px] text-warn">{it.note}</div> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {open && pos ? (
        // A file of answers to this position, for next time (built in the library; opens in a new tab).
        <a
          href={`/library/build?kind=answers&side=${ourSide}&argument=${encodeURIComponent(`${pos.name}: ${items.slice(0, 6).map((i) => i.arg.text).join("; ")}`.slice(0, 1400))}&target=${encodeURIComponent(pos.name)}`}
          target="_blank"
          rel="noreferrer"
          className="block px-3 pb-2 text-[11.5px] text-accent hover:underline"
        >
          Build a file of answers to this →
        </a>
      ) : null}
    </div>
  );
}

function OpponentSpeechSummary({ speech, graph, slots, recorded }: { speech: SpeechId; graph: RoundGraph | null; slots: Record<SpeechId, SlotRecord> | null; recorded: Set<SpeechId> }) {
  const ws = useWorkspace();
  const args = (graph?.args ?? []).filter((a) => a.speech === speech);
  const byPos = new Map<string, ArgUnit[]>();
  for (const a of args) byPos.set(a.positionId, [...(byPos.get(a.positionId) ?? []), a]);
  const posName = new Map((graph?.positions ?? []).map((p) => [p.id, p.name]));
  const st = slots?.[speech];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-2.5">
        <div className="text-[13px] font-semibold">Their {speech}</div>
        <div className="text-xs text-muted">
          {st?.status === "delivered" ? "Marked delivered" : recorded.has(speech) ? "Document added — delivery not confirmed" : "No record yet"}
          {st?.readConfirmed ? " · read confirmed" : ""}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {args.length === 0 ? (
          <EmptyState icon={<CircleDashed className="size-7" />} title={`No ${speech} arguments on the flow`}>
            Add their document in the Docs tab, or add arguments by hand in the Flow tab.
          </EmptyState>
        ) : (
          [...byPos.entries()].map(([pid, list]) => (
            <div key={pid} className="border-b border-line py-1.5">
              <div className="px-3 py-1 text-[13px] font-semibold">{posName.get(pid) ?? "Unsorted"}</div>
              {list
                .sort((a, b) => a.order - b.order)
                .map((a) => (
                  <button key={a.id} onClick={() => ws.set({ selectedArgId: a.id, right: "details" })} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-hover">
                    <DeliveryBadge arg={a} />
                    <ArgLine arg={a} compact />
                  </button>
                ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DeliveryBadge({ arg }: { arg: ArgUnit }) {
  const map: Record<ArgUnit["delivery"], { tone: "ok" | "warn" | "neutral" | "info"; label: string; hint: string }> = {
    confirmed: { tone: "ok", label: "Read", hint: "Confirmed delivered." },
    documented: { tone: "warn", label: "Doc", hint: "In their document; not confirmed as read." },
    not_read: { tone: "neutral", label: "Not read", hint: "In the document but not read." },
    uncertain: { tone: "warn", label: "?", hint: "Unclear whether this was read." },
    planned: { tone: "info", label: "Plan", hint: "Planned in a draft." },
  };
  const m = map[arg.delivery];
  const ai = arg.provenance.type === "ai_inferred";
  return (
    <Tooltip content={`${m.hint}${ai ? " Interpreted by AI — check it." : ""}`}>
      <span className="mt-0.5 flex shrink-0 items-center gap-1">
        <Badge tone={m.tone}>{m.label}</Badge>
        {ai ? <span className="text-[10px] font-semibold text-info">AI</span> : null}
      </span>
    </Tooltip>
  );
}
