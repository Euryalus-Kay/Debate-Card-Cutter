"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type * as Y from "yjs";
import { AlertTriangle, Check, Loader2, RefreshCw, Scissors, Sparkles, X } from "lucide-react";
import { api } from "@/client/api";
import { syncDocNow, useDocSync, useYDocValue } from "@/client/sync/hooks";
import { Badge, Button, cn, EmptyState, toast } from "@/components/ui";
import { useApp } from "@/components/shell/app-shell";
import { formatClock } from "@/domain/timing";
import type { AlternativesOutput, PatchPlanOutput, SectionRevisionOutput, SpeechDraftOutput } from "@/server/ai/schemas";
import type { RoundGraph } from "@/domain/flow";
import type { SpeechId } from "@/domain/format";
import { patchSectionId } from "@/domain/patch";
import { readActivity, readGraph, type AiActivity } from "@/shared/round-doc";
import { useWorkspace } from "./store";
import { applyDraft, applyPatch, applyRevision, fetchCards, findSectionNode, removeSection, sectionNodes, useProposals, type ApplyResult, type PatchOutcome, type Proposal } from "./proposals";
import type { RoundRecord } from "./types";
import { getActiveEditor, getRoundDoc } from "./editor/active-editor";
import { saveVersionBeforeAi } from "./history-dialog";
import { startFitOp } from "./ai-actions";
import { AiProgress, useNow } from "./ai-progress";
import { activityDecided } from "./ai-activity";

interface OpRow {
  id: string;
  kind: string;
  status: string;
  model: string;
  createdAt: string;
  error: string | null;
  docId: string | null;
  target: { speech?: string; sectionId?: string | null; auto?: boolean };
  output: unknown;
}

export function AiPanel({ round, aiEnabled, doc }: { round: RoundRecord; aiEnabled: boolean; doc: Y.Doc | null }) {
  const { user } = useApp();
  // Newest first: a proposal restored from history never sits above the one you just asked for.
  const proposals = useProposals((s) => s.proposals)
    .filter((p) => p.draftId)
    .sort((a, b) => b.startedAt - a.startedAt);
  const history = useQuery({ queryKey: ["ai-ops", round.id], queryFn: () => api<{ ops: OpRow[] }>(`/api/rounds/${round.id}/ai-ops`), refetchInterval: 15_000 });
  const activity = useYDocValue(doc, readActivity) ?? [];
  const others = activity.filter((a) => a.by !== user.id);
  // A partner's job just finished: fetch its proposal now instead of at the next poll.
  const readyKey = others
    .filter((a) => a.status === "ready" && a.opId)
    .map((a) => a.opId)
    .join(",");
  const { refetch } = history;
  useEffect(() => {
    if (readyKey) void refetch();
  }, [readyKey, refetch]);
  // A partner applied or dismissed a proposal (theirs or mine): my copy of it follows.
  const decidedKey = activity
    .filter((a) => (a.status === "applied" || a.status === "dismissed") && a.opId)
    .map((a) => `${a.opId}:${a.status}`)
    .join(",");
  useEffect(() => {
    if (!decidedKey) return;
    const store = useProposals.getState();
    for (const pair of decidedKey.split(",")) {
      const [opId, status] = pair.split(":");
      const p = store.proposals.find((x) => x.opId === opId && x.status === "ready");
      if (p && (p.kind !== "patch" || !Object.keys(p.outcomes ?? {}).length)) store.update(p.id, { status: status as "applied" | "dismissed" });
    }
  }, [decidedKey]);
  // Rehydrate finished-but-unapplied proposals (after refresh, or ones your partner started).
  useEffect(() => {
    const ops = history.data?.ops ?? [];
    const store = useProposals.getState();
    for (const o of [...ops].reverse()) {
      if (!o.output || !o.docId || store.proposals.some((p) => p.opId === o.id)) continue;
      const base = { id: `op-${o.id}`, opId: o.id, draftId: o.docId, speech: o.target.speech ?? "", status: "ready" as const, partial: null, error: null, startedAt: new Date(o.createdAt).getTime() };
      if (o.kind === "draft_speech") store.add({ ...base, kind: "draft", result: o.output as never, baseDraftHash: null });
      else if (o.kind.startsWith("revise:") && o.target.sectionId) store.add({ ...base, kind: o.kind === "revise:alternatives" ? "alternatives" : "revision", sectionId: o.target.sectionId, action: o.kind.slice(7), result: o.output as never } as Proposal);
      else if (o.kind === "fit_speech") store.add({ ...base, kind: "fit", result: o.output as never });
      else if (o.kind === "patch_speech" && !(o.output as { upToDate?: boolean }).upToDate) {
        store.add({ ...base, kind: "patch", result: o.output as never, auto: !!o.target.auto });
        useProposals.getState().supersede(o.docId, base.id);
      }
    }
  }, [history.data]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!aiEnabled ? (
        <div className="m-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">AI is off for this round (tournament rules setting). Flow, evidence, timers, and drafting still work.</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <PartnerActivity items={others} />
        {proposals.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-7" />} title="No AI suggestions yet">
            Use &ldquo;Build / revise&rdquo; above the draft, or the ✦ menu on any section. Suggestions appear here for you to review; nothing changes your draft until you apply it.
          </EmptyState>
        ) : (
          proposals.map((p) => <ProposalCard key={p.id} p={p} round={round} />)
        )}
        {history.data?.ops.length ? (
          <div className="mt-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Recent AI activity (this round)</div>
            {history.data.ops.slice(0, 15).map((o) => (
              <div key={o.id} className="flex items-center gap-2 py-0.5 text-[11.5px] text-muted">
                <span className={cn("size-1.5 rounded-full", o.status === "complete" ? "bg-ok" : o.status === "failed" ? "bg-bad" : "bg-warn")} />
                <span className="truncate">{o.kind.replace("_", " ")}</span>
                <span className="ml-auto shrink-0 text-faint">{new Date(o.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** What the partner's AI is doing right now (and what it just finished). */
function PartnerActivity({ items }: { items: AiActivity[] }) {
  const now = useNow(items.length > 0);
  const shown = items.filter((a) => (a.status === "running" && now - a.at < 5 * 60_000) || (a.status !== "running" && now - a.at < 90_000));
  if (!shown.length) return null;
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-line bg-sunken/60 p-2.5">
      {shown.map((a) => (
        <div key={a.id} className="text-[12.5px]">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-medium">{a.byName.split(" ")[0]}&apos;s AI</span>
            <span className="text-muted">is {a.status === "running" ? a.label : `done ${a.label}`}</span>
            {a.status !== "running" ? <Badge tone={a.status === "failed" ? "bad" : a.status === "ready" ? "accent" : "ok"}>{a.status === "ready" ? "ready below" : a.status}</Badge> : null}
          </div>
          {a.status === "running" ? <AiProgress progress={{ stage: a.stage, done: a.done, total: a.total, etaMs: a.etaMs, fraction: a.fraction, at: a.at }} since={a.startedAt} label={a.stage} /> : <div className="text-[11.5px] text-muted">{a.stage}</div>}
        </div>
      ))}
    </div>
  );
}

function RunInfo({ run }: { run?: { model: string; ttftMs: number | null; totalMs: number; attempts: { model: string; ok: boolean; error?: string }[] } }) {
  if (!run) return null;
  const fallback = run.attempts.length > 1;
  return (
    <div className="mt-2 text-[11px] text-faint">
      {run.model} · first output {run.ttftMs ? `${(run.ttftMs / 1000).toFixed(1)}s` : "—"} · total {(run.totalMs / 1000).toFixed(1)}s
      {fallback ? <span className="text-warn"> · used fallback ({run.attempts.filter((a) => !a.ok).map((a) => `${a.model}: ${a.error}`).join("; ")})</span> : null}
    </div>
  );
}

function ProposalCard({ p, round }: { p: Proposal; round: RoundRecord }) {
  const upd = useProposals((s) => s.update);
  const { team } = useApp();
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const isCurrentDraft = ws.draftId === p.draftId;
  const { sync } = useDocSync(p.draftId);
  void sync;

  async function markOp(field: "applied" | "dismissed") {
    activityDecided(p.opId, field);
    if (p.opId) await api(`/api/ai/ops/${p.opId}`, { method: "PATCH", json: { [field]: true } }).catch(() => {});
  }

  const title =
    p.kind === "draft"
      ? `${p.speech} draft`
      : p.kind === "fit"
        ? `${p.result?.mode === "fill" ? "Fill" : "Fit"} the ${p.speech} to time`
        : p.kind === "patch"
          ? `${p.auto ? "Pre-draft" : "Update"}: ${p.speech}`
        : p.kind === "alternatives"
          ? "Three approaches"
          : `Revise section: ${"action" in p ? p.action : ""}`;

  return (
    <div className={cn("mb-3 rounded-xl border bg-elev p-3", p.status === "failed" ? "border-bad/40" : "border-line")}>
      <div className="mb-2 flex items-center gap-2">
        {p.status === "running" ? <Loader2 className="size-3.5 animate-spin text-accent" /> : p.status === "ready" ? <Sparkles className="size-3.5 text-accent" /> : p.status === "applied" ? <Check className="size-3.5 text-ok" /> : p.status === "failed" ? <AlertTriangle className="size-3.5 text-bad" /> : <X className="size-3.5 text-faint" />}
        <span className="text-[13px] font-semibold">{title}</span>
        <Badge tone={p.status === "ready" ? "accent" : p.status === "applied" ? "ok" : p.status === "failed" ? "bad" : "neutral"}>{p.status}</Badge>
        {!isCurrentDraft ? <span className="ml-auto text-[11px] text-faint">other draft</span> : null}
      </div>
      {p.error ? <p className="text-xs text-bad">{p.error}</p> : null}
      {p.kind === "draft" ? (
        <DraftProposal p={p} busy={busy} setBusy={setBusy} teamId={team.id} markOp={markOp} upd={upd} />
      ) : p.kind === "fit" ? (
        <FitProposal p={p} busy={busy} setBusy={setBusy} teamId={team.id} markOp={markOp} upd={upd} />
      ) : p.kind === "patch" ? (
        <PatchProposal p={p} busy={busy} setBusy={setBusy} teamId={team.id} markOp={markOp} upd={upd} round={round} />
      ) : (
        <SectionProposal p={p} busy={busy} setBusy={setBusy} teamId={team.id} markOp={markOp} upd={upd} />
      )}
    </div>
  );
}

type Upd = (id: string, patch: Partial<Proposal>) => void;

function DraftProposal({ p, busy, setBusy, teamId, markOp, upd }: { p: Extract<Proposal, { kind: "draft" }>; busy: boolean; setBusy: (b: boolean) => void; teamId: string; markOp: (f: "applied" | "dismissed") => Promise<void>; upd: Upd }) {
  const out = (p.result?.output ?? p.partial) as Partial<SpeechDraftOutput> | null;
  const v = p.result?.validation;
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const top = (out?.sections ?? []).filter((s) => s && !s.parentRef);
  async function apply() {
    const editor = getActiveEditor(p.draftId);
    if (!editor || !p.result) return toast("Open this draft to apply the suggestion.", "warn");
    setBusy(true);
    try {
      const cards = await fetchCards(teamId, p.result.output.sections.flatMap((s) => s.cardIds));
      const only = new Set(top.map((s) => s.ref!).filter((r) => !skip.has(r)));
      await saveVersionBeforeAi(p.draftId, `${p.speech} draft`);
      applyDraft(editor, sectionNodes(p.result.output, cards, p.opId, only));
      upd(p.id, { status: "applied" });
      await markOp("applied");
      toast("Added to your draft. Everything is editable; locked sections were not touched.", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="text-[12.5px]">
      {p.status === "running" ? <AiProgress progress={p.progress} since={p.startedAt} label="Planning the speech" className="mb-2" /> : null}
      {out?.strategy?.summary ? <p className="mb-2 text-fg">{out.strategy.summary}</p> : null}
      {out?.strategy?.choices?.length ? (
        <ul className="mb-2 list-disc space-y-0.5 pl-4 text-muted">
          {out.strategy.choices.map((c, i) => (
            <li key={`c${i}`}>{c}</li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-1">
        {top.map((s, i) => (
          <label key={`${s.ref ?? "p"}-${i}`} className="flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
            <input type="checkbox" className="mt-0.5" checked={!skip.has(s.ref!)} onChange={(e) => setSkip((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(s.ref!); else n.add(s.ref!); return n; })} disabled={p.status !== "ready"} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{s.title}</span>
              <span className="ml-1 text-faint">{(out?.sections ?? []).filter((c) => c?.parentRef === s.ref).length} parts</span>
            </span>
            {v?.sectionSeconds?.[s.ref!] !== undefined ? <span className="shrink-0 font-mono text-[11px] text-faint">~{formatClock(v.sectionSeconds[s.ref!] + (out?.sections ?? []).filter((c) => c?.parentRef === s.ref).reduce((a, c) => a + (v.sectionSeconds[c!.ref!] ?? 0), 0))}</span> : null}
          </label>
        ))}
      </div>
      {v ? (
        <div className="mt-2 space-y-1">
          {v.lengthAdjust ? (
            <div className="text-xs text-muted">
              {v.lengthAdjust.mode === "trim" ? "Trimmed" : "Filled out"} from {formatClock(v.lengthAdjust.fromSeconds)} to {formatClock(v.lengthAdjust.toSeconds)} ({v.lengthAdjust.sections} {v.lengthAdjust.sections === 1 ? "section" : "sections"} rewritten to length; cards unchanged).
            </div>
          ) : null}
          <div className={cn("text-xs", v.estimatedSeconds > v.limitSeconds ? "text-bad" : "text-muted")}>
            Estimated {formatClock(v.estimatedSeconds)} of {formatClock(v.limitSeconds)}
            {v.estimatedSeconds < v.limitSeconds * 0.85 ? ` — leaves ~${formatClock(v.limitSeconds - v.estimatedSeconds)} unused; after adding it, "Fill to time" below the draft can expand it.` : ""}
          </div>
          {v.unaddressed.length ? <Warn>Not addressed and not explained: {v.unaddressed.map((u) => u.text).join("; ")}</Warn> : null}
          {out?.omitted?.length ? <div className="text-xs text-muted">Deliberately not answered: {out.omitted.map((o) => o.reason).join("; ")}</div> : null}
          {v.newInRebuttal.length ? <Warn>New arguments in a rebuttal: {v.newInRebuttal.join("; ")}</Warn> : null}
          {v.unsupportedDropClaims?.length ? <Warn>Says something was dropped or conceded, but their speech isn&apos;t confirmed as read: {v.unsupportedDropClaims.join("; ")}. Confirm the record before claiming a drop.</Warn> : null}
          {v.positionsNotInBlock.length ? <Warn>Goes for positions not extended in the block: {v.positionsNotInBlock.join(", ")}</Warn> : null}
          {v.droppedCards.length ? <Warn>{v.droppedCards.length} card reference(s) removed (not in your evidence).</Warn> : null}
          {v.droppedTargets.length ? <Warn>{v.droppedTargets.length} link(s) to arguments not on the flow removed.</Warn> : null}
          {out?.questions?.length ? <div className="text-xs text-info">To confirm: {out.questions.join(" ")}</div> : null}
        </div>
      ) : null}
      <RunInfo run={p.result?.run} />
      {p.status === "ready" ? (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="primary" onClick={apply} loading={busy}>
            Add to draft
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              upd(p.id, { status: "dismissed" });
              void markOp("dismissed");
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SectionProposal({ p, busy, setBusy, teamId, markOp, upd }: { p: Extract<Proposal, { kind: "revision" | "alternatives" }>; busy: boolean; setBusy: (b: boolean) => void; teamId: string; markOp: (f: "applied" | "dismissed") => Promise<void>; upd: Upd }) {
  const [stale, setStale] = useState(false);
  async function apply(rev: { title: string; analytic: string; cardIds: string[]; needsEvidence?: string; role?: string }, force = false) {
    const editor = getActiveEditor(p.draftId);
    if (!editor || !p.result) return toast("Open this draft to apply the suggestion.", "warn");
    setBusy(true);
    try {
      const cards = await fetchCards(teamId, rev.cardIds);
      const r = applyRevision(editor, p.sectionId, rev, p.result.baseHash, cards, p.opId, force);
      if (r === "stale") setStale(true);
      else if (r === "locked") toast("That section is locked now. Unlock it to apply.", "warn");
      else if (r === "missing") toast("That section was deleted.", "warn");
      else {
        upd(p.id, { status: "applied" });
        await markOp("applied");
      }
    } finally {
      setBusy(false);
    }
  }
  if (p.kind === "alternatives") {
    const out = (p.result?.output ?? p.partial) as Partial<AlternativesOutput> | null;
    return (
      <div className="space-y-2 text-[12.5px]">
        {!out?.options?.length && p.status === "running" ? <p className="animate-pulse-soft text-muted">Thinking through different approaches…</p> : null}
        {(out?.options ?? []).map((o, i) =>
          o ? (
            <div key={i} className="rounded-lg border border-line p-2">
              <div className="font-semibold">{o.label}</div>
              <div className="text-muted">{o.approach}</div>
              <div className="mt-1 text-xs text-warn">{o.tradeoff}</div>
              {p.status === "ready" ? (
                <Button size="xs" className="mt-1.5" onClick={() => apply({ title: o.title ?? "", analytic: o.analytic ?? "", cardIds: o.cardIds ?? [], role: o.role })} loading={busy}>
                  Use this approach
                </Button>
              ) : null}
            </div>
          ) : null,
        )}
        {stale ? <StaleNote onForce={() => setStale(false)} /> : null}
        <RunInfo run={p.result?.run} />
      </div>
    );
  }
  const out = (p.result?.output ?? p.partial) as Partial<SectionRevisionOutput> | null;
  return (
    <div className="text-[12.5px]">
      {out?.title ? <div className="font-semibold">{out.title}</div> : null}
      {out?.analytic ? <p className="mt-1 whitespace-pre-wrap text-fg">{out.analytic}</p> : p.status === "running" ? <p className="animate-pulse-soft text-muted">Revising…</p> : null}
      {out?.note ? <p className="mt-1 text-xs text-muted">{out.note}</p> : null}
      {out?.needsEvidence ? <p className="mt-1 text-xs text-info">Evidence to find: {out.needsEvidence}</p> : null}
      {p.result?.estimatedSeconds !== undefined ? (
        <p className="mt-1 text-xs text-faint">
          ~{formatClock(p.result.previousSeconds ?? 0)} → ~{formatClock(p.result.estimatedSeconds)}
        </p>
      ) : null}
      <RunInfo run={p.result?.run} />
      {stale && p.status !== "applied" && p.status !== "dismissed" ? (
        <div className="mt-2 rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">
          The section changed after you asked (you or your partner edited it). Applying would replace those edits.
          <div className="mt-1 flex gap-1.5">
            <Button size="xs" onClick={() => void apply(p.result!.output as SectionRevisionOutput, true)}>
              Replace anyway
            </Button>
            <Button size="xs" variant="ghost" onClick={() => upd(p.id, { status: "dismissed" })}>
              Discard suggestion
            </Button>
          </div>
        </div>
      ) : p.status === "ready" ? (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="primary" onClick={() => void apply(p.result!.output as SectionRevisionOutput)} loading={busy}>
            Apply to section
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              upd(p.id, { status: "dismissed" });
              void markOp("dismissed");
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const OUTCOME: Record<ApplyResult, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  applied: { label: "done", tone: "ok" },
  stale: { label: "changed since — skipped", tone: "warn" },
  locked: { label: "locked — skipped", tone: "warn" },
  missing: { label: "no longer exists", tone: "neutral" },
};

function FitProposal({ p, busy, setBusy, teamId, markOp, upd }: { p: Extract<Proposal, { kind: "fit" }>; busy: boolean; setBusy: (b: boolean) => void; teamId: string; markOp: (f: "applied" | "dismissed") => Promise<void>; upd: Upd }) {
  const r = p.result;
  if (p.status === "running") return <AiProgress progress={p.progress} since={p.startedAt} label="Planning what to keep, condense, and cut" />;
  if (!r) return null;
  // Apply in document order (parents before their subsections) so hashes stay valid.
  const order = Object.keys(r.titles);
  const changes = r.output.plan.filter((e) => e.action !== "keep").sort((a, b) => order.indexOf(a.sectionId) - order.indexOf(b.sectionId));
  // After a reload the plan's outcomes are gone; sections this plan already rewrote carry its op id.
  const inferred: Record<string, ApplyResult> = {};
  const editor = getActiveEditor(p.draftId);
  if (editor && p.opId) {
    for (const e of changes) {
      const found = findSectionNode(editor, e.sectionId);
      if (!found) inferred[e.sectionId] = "missing";
      else if (found.node.attrs.aiOpId === p.opId) inferred[e.sectionId] = "applied";
    }
  }
  const outcomes = { ...inferred, ...(p.outcomes ?? {}) };
  const anyStale = changes.some((e) => outcomes[e.sectionId] === "stale");
  const fits = r.estimatedSeconds <= r.limitSeconds;

  async function apply(force = false) {
    const editor = getActiveEditor(p.draftId);
    if (!editor || !r) return toast("Open this draft to apply the plan.", "warn");
    setBusy(true);
    try {
      const cards = await fetchCards(teamId, changes.flatMap((e) => (e.action === "condense" || e.action === "expand" ? e.cardIds : [])));
      if (!Object.keys(outcomes).length) await saveVersionBeforeAi(p.draftId, `${r.mode === "fill" ? "fill" : "fit"} the ${p.speech} to time`);
      const out: Record<string, ApplyResult> = { ...outcomes };
      for (const e of changes) {
        if (out[e.sectionId] === "applied") continue;
        const hash = r.baseHashes[e.sectionId] ?? "";
        out[e.sectionId] = e.action === "cut" ? removeSection(editor, e.sectionId, hash, force) : applyRevision(editor, e.sectionId, { title: e.title, analytic: e.analytic, cardIds: e.cardIds }, hash, cards, p.opId, force);
      }
      const done = changes.every((e) => out[e.sectionId] === "applied" || out[e.sectionId] === "missing");
      upd(p.id, { outcomes: out, status: done ? "applied" : "ready" });
      if (done) await markOp("applied");
      else toast("Some sections changed or were locked after the plan was made; they were left alone.", "warn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-[12.5px]">
      <p>{r.output.summary}</p>
      <div className="flex items-center gap-2 font-mono tabular text-[12px]">
        <span className="text-muted">~{formatClock(r.previousSeconds)}</span>→<span className={cn("font-semibold", fits ? "text-ok" : "text-bad")}>~{formatClock(r.estimatedSeconds)}</span>
        <span className="text-faint">of {formatClock(r.limitSeconds)}</span>
        {!fits ? <Badge tone="bad">still over</Badge> : null}
      </div>
      {r.newlyUnanswered.length ? (
        <Warn>
          After these cuts, nothing answers: {r.newlyUnanswered.map((a) => `“${a.text.slice(0, 70)}”`).join("; ")}. Make sure that&apos;s a deliberate concession.
        </Warn>
      ) : null}
      {r.output.sacrificed.length ? (
        <div className="text-muted">
          <span className="font-medium text-fg">{r.mode === "fill" ? "Tradeoffs:" : "Gives up:"}</span> {r.output.sacrificed.join(" · ")}
        </div>
      ) : null}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {changes.map((e) => {
          const t = r.perSection[e.sectionId];
          const o = outcomes[e.sectionId];
          return (
            <li key={e.sectionId} className="px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <Badge tone={e.action === "cut" ? "bad" : e.action === "expand" ? "ok" : "accent"}>{e.action}</Badge>
                <span className="min-w-0 flex-1 truncate font-medium">{r.titles[e.sectionId] || "Untitled section"}</span>
                {t ? (
                  <span className="shrink-0 font-mono tabular text-[11px] text-faint">
                    {formatClock(t.before)}→{formatClock(t.after)}
                  </span>
                ) : null}
              </div>
              <div className="text-[11.5px] text-muted">{e.reason}</div>
              {o ? <Badge tone={OUTCOME[o].tone}>{OUTCOME[o].label}</Badge> : null}
            </li>
          );
        })}
        {!changes.length ? <li className="px-2.5 py-1.5 text-muted">No changes proposed.</li> : null}
      </ul>
      <RunInfo run={r.run} />
      {p.status === "ready" && changes.length ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" onClick={() => void apply(false)} loading={busy}>
            Apply {Object.keys(outcomes).length ? "remaining" : "all"}
          </Button>
          {anyStale ? (
            <Button size="sm" onClick={() => void apply(true)} disabled={busy}>
              Apply anyway (replace newer edits)
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              upd(p.id, { status: "dismissed" });
              void markOp("dismissed");
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const PATCH_OUTCOME: Record<PatchOutcome, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  ...OUTCOME,
  answered: { label: "already answered — skipped", tone: "neutral" },
  partner: { label: "partner is editing it — skipped", tone: "warn" },
};

interface PatchRow {
  key: string;
  kind: "add" | "link" | "unlink" | "edit";
  title: string;
  detail: string;
  reason: string;
  warn?: string;
  seconds?: number;
  depth: number;
  defaultOn: boolean;
  text?: string;
}

const EMPTY_GRAPH = (ourSide: "aff" | "neg"): RoundGraph => ({ ourSide, positions: [], args: [], relations: [], decisions: [] });

function PatchProposal({ p, busy, setBusy, teamId, markOp, upd, round }: { p: Extract<Proposal, { kind: "patch" }>; busy: boolean; setBusy: (b: boolean) => void; teamId: string; markOp: (f: "applied" | "dismissed") => Promise<void>; upd: Upd; round: RoundRecord }) {
  const r = p.result;
  const { snapshot } = useDocSync(p.draftId);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<string | null>(null);
  const partial = p.partial as Partial<PatchPlanOutput> | null;
  const dismiss = () => {
    upd(p.id, { status: "dismissed" });
    void markOp("dismissed");
  };
  if (p.status === "running" || !r) {
    return p.status === "running" ? (
      <div className="space-y-1 text-[12.5px]">
        <AiProgress progress={p.progress} since={p.startedAt} label={p.note ?? "Reading what changed"} />
        {(partial?.adds ?? []).filter((a) => a?.title).map((a, i) => (
          <div key={`${a!.ref ?? i}`} className="truncate text-muted">
            + {a!.title}
          </div>
        ))}
      </div>
    ) : null;
  }
  if (r.upToDate) {
    return (
      <div className="text-[12.5px]">
        <p className="text-muted">{r.output.summary}</p>
        {p.status === "ready" ? (
          <Button size="xs" variant="ghost" className="mt-1.5" onClick={dismiss}>
            OK
          </Button>
        ) : null}
      </div>
    );
  }

  const argText = new Map([...r.changes.unanswered, ...r.changes.uncertain, ...r.changes.otherFlows].map((a) => [a.id, a.text]));
  const rows: PatchRow[] = [];
  const adds = r.output.adds;
  const walk = (a: (typeof adds)[number], depth: number) => {
    rows.push({ key: `add:${a.ref}`, kind: "add", title: a.title || "New section", detail: depth ? "" : r.addInfo[a.ref]?.where ?? "", reason: a.targets.map((t) => argText.get(t)).filter(Boolean).length ? `answers “${a.targets.map((t) => argText.get(t)).filter(Boolean).join("”, “").slice(0, 160)}”` : "", seconds: r.addInfo[a.ref]?.seconds, depth, defaultOn: true, text: a.analytic });
    for (const k of adds.filter((x) => x.parentRef === a.ref)) walk(k, depth + 1);
  };
  for (const a of adds.filter((x) => !x.parentRef)) walk(a, 0);
  for (const l of r.output.retargets) {
    const added = l.addTargets.map((t) => argText.get(t) ?? t);
    rows.push({ key: `link:${l.sectionId}`, kind: l.addTargets.length ? "link" : "unlink", title: r.titles[l.sectionId] || "Untitled section", detail: l.addTargets.length ? `also answers “${added.join("”, “").slice(0, 140)}”` : "argument no longer on the flow", reason: l.reason, depth: 0, defaultOn: true });
  }
  for (const e of r.output.edits) {
    const info = r.editInfo[e.sectionId];
    rows.push({
      key: `edit:${e.sectionId}`,
      kind: "edit",
      title: r.titles[e.sectionId] || e.title,
      detail: info ? `changes ${Math.round(info.share * 100)}% of its words` : "",
      reason: e.reason,
      warn: info?.humanEdited ? "You or your partner wrote or changed this section; tick it to replace their words." : info?.large ? "Rewrites most of the section although the argument didn't change." : undefined,
      seconds: info ? info.seconds - info.previousSeconds : undefined,
      depth: 0,
      defaultOn: !!info && !info.humanEdited && !info.large,
      text: e.analytic,
    });
  }

  // After a reload the outcomes are gone; infer them from the live draft.
  const opKey = p.opId ?? p.id;
  const inferred: Record<string, PatchOutcome> = {};
  const editor = getActiveEditor(p.draftId);
  if (editor) {
    for (const a of adds) if (findSectionNode(editor, patchSectionId(opKey, a.ref))) inferred[`add:${a.ref}`] = "applied";
    for (const l of r.output.retargets) {
      const found = findSectionNode(editor, l.sectionId);
      const t = (found?.node.attrs.targets as string[] | undefined) ?? [];
      if (!found) inferred[`link:${l.sectionId}`] = "missing";
      else if (l.addTargets.every((x) => t.includes(x)) && !l.removeTargets.some((x) => t.includes(x))) inferred[`link:${l.sectionId}`] = "applied";
    }
    for (const e of r.output.edits) {
      const found = findSectionNode(editor, e.sectionId);
      if (!found) inferred[`edit:${e.sectionId}`] = "missing";
      else if (p.opId && found.node.attrs.aiOpId === p.opId) inferred[`edit:${e.sectionId}`] = "applied";
    }
  }
  const outcomes: Record<string, PatchOutcome> = { ...inferred, ...(p.outcomes ?? {}) };
  const isOn = (row: PatchRow) => picked[row.key] ?? row.defaultOn;
  const pending = rows.filter((row) => isOn(row) && outcomes[row.key] !== "applied" && outcomes[row.key] !== "answered");
  const anyStale = rows.some((row) => outcomes[row.key] === "stale" || outcomes[row.key] === "partner");
  const fits = r.estimatedSeconds <= r.limitSeconds;
  const critical = r.checks.filter((c) => c.severity === "critical");

  async function apply(force = false) {
    const editor = getActiveEditor(p.draftId);
    if (!editor || !r) return toast("Open this draft to apply the update.", "warn");
    setBusy(true);
    try {
      // Land on the latest draft, and make sure a partner hasn't applied this same update already.
      await syncDocNow(p.draftId);
      if (p.opId && !Object.keys(p.outcomes ?? {}).length) {
        const claim = await api<{ claimed: boolean }>(`/api/ai/ops/${p.opId}`, { method: "PATCH", json: { claim: true } }).catch(() => ({ claimed: true }));
        if (!claim.claimed) {
          upd(p.id, { status: "applied" });
          toast("Your partner already applied this update; it's in the draft.", "ok");
          return;
        }
      }
      const selected = new Set(rows.filter(isOn).map((row) => row.key));
      const cards = await fetchCards(teamId, [...adds.filter((a) => selected.has(`add:${a.ref}`)).flatMap((a) => a.cardIds), ...r.output.edits.filter((e) => selected.has(`edit:${e.sectionId}`)).flatMap((e) => e.cardIds)]);
      if (!Object.keys(outcomes).length) await saveVersionBeforeAi(p.draftId, `update the ${p.speech}`);
      const doc = getRoundDoc();
      const graph = doc ? readGraph(doc, round.ourSide) : EMPTY_GRAPH(round.ourSide);
      const partnerSections = new Set((snapshot?.others ?? []).filter((o) => o.state.activity === "editing" && o.state.section).map((o) => o.state.section!));
      const out = applyPatch(editor, r, { opKey, opId: p.opId, selected, prior: outcomes, cards, graph, partnerSections, force });
      const done = [...selected].every((k) => out[k] === "applied" || out[k] === "answered" || out[k] === "missing");
      upd(p.id, { outcomes: out, status: done ? "applied" : "ready" });
      if (done) await markOp("applied");
      else toast("Some changes were skipped: edited since, locked, or your partner is in that section.", "warn");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-[12.5px]">
      <p>{r.output.summary}</p>
      <div className="flex items-center gap-2 font-mono tabular text-[12px]">
        <span className="text-muted">~{formatClock(r.previousSeconds)}</span>→<span className={cn("font-semibold", fits ? "text-ok" : "text-bad")}>~{formatClock(r.estimatedSeconds)}</span>
        <span className="text-faint">of {formatClock(r.limitSeconds)}</span>
        {!fits ? <Badge tone="bad">over</Badge> : null}
      </div>
      {critical.length ? <Warn>After this update: {critical.map((c) => c.message).join(" ")}</Warn> : null}
      {r.remaining.length ? <Warn>Still unanswered: {r.remaining.map((a) => `“${a.text.slice(0, 70)}”`).join("; ")}</Warn> : null}
      {r.output.notAddressed.length ? <div className="text-xs text-muted">Left unanswered on purpose: {r.output.notAddressed.map((n) => n.reason).join("; ")}</div> : null}
      {r.dropped.duplicates.length ? <div className="text-xs text-muted">Skipped {r.dropped.duplicates.length} answer{r.dropped.duplicates.length === 1 ? "" : "s"} the draft already has.</div> : null}
      {r.dropped.linksInPlace ? <div className="text-xs text-muted">{r.dropped.linksInPlace} suggested link{r.dropped.linksInPlace === 1 ? " was" : "s were"} already in place.</div> : null}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((row) => {
          const o = outcomes[row.key];
          const done = o === "applied" || o === "answered";
          return (
            <li key={row.key} className="py-1.5 pr-2.5" style={{ paddingLeft: 10 + row.depth * 16 }}>
              <label className="flex items-start gap-1.5">
                <input type="checkbox" className="mt-0.5" checked={done || isOn(row)} disabled={p.status !== "ready" || done} onChange={(e) => setPicked((prev) => ({ ...prev, [row.key]: e.target.checked }))} />
                <Badge tone={row.kind === "add" ? "ok" : row.kind === "edit" ? "accent" : row.kind === "link" ? "info" : "neutral"}>{row.kind}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{row.title}</span>
                  {row.detail ? <span className="text-faint"> · {row.detail}</span> : null}
                </span>
                {row.seconds ? <span className="shrink-0 font-mono text-[11px] text-faint">{row.seconds > 0 ? "+" : "−"}{formatClock(Math.abs(row.seconds))}</span> : null}
              </label>
              {row.reason ? <div className="pl-5 text-[11.5px] text-muted">{row.reason}</div> : null}
              {row.warn ? <div className="pl-5 text-[11.5px] text-warn">{row.warn}</div> : null}
              {row.text ? (
                <button type="button" className="pl-5 text-[11.5px] text-accent hover:underline" onClick={() => setShown(shown === row.key ? null : row.key)}>
                  {shown === row.key ? "Hide text" : "Show text"}
                </button>
              ) : null}
              {shown === row.key ? <p className="mt-0.5 whitespace-pre-wrap pl-5 text-[12px] text-fg">{row.text}</p> : null}
              {o ? (
                <div className="pl-5">
                  <Badge tone={PATCH_OUTCOME[o].tone}>{PATCH_OUTCOME[o].label}</Badge>
                </div>
              ) : null}
            </li>
          );
        })}
        {!rows.length ? <li className="px-2.5 py-1.5 text-muted">No changes proposed.</li> : null}
      </ul>
      {r.output.questions.length ? <div className="text-xs text-info">To confirm: {r.output.questions.join(" ")}</div> : null}
      {r.run ? <RunInfo run={r.run} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {p.status === "ready" && pending.length ? (
          <Button size="sm" variant="primary" onClick={() => void apply(false)} loading={busy}>
            <RefreshCw className="size-3.5" /> Apply {Object.keys(outcomes).length ? "remaining" : pending.length === rows.length ? "all" : `${pending.length} selected`}
          </Button>
        ) : null}
        {p.status === "ready" && anyStale ? (
          <Button size="sm" onClick={() => void apply(true)} disabled={busy}>
            Apply anyway (replace newer edits)
          </Button>
        ) : null}
        {!fits && (p.status === "applied" || Object.values(outcomes).includes("applied")) ? (
          <Button size="sm" onClick={() => void startFitOp({ round, speech: p.speech as SpeechId, draftId: p.draftId })}>
            <Scissors className="size-3.5" /> Fit to time
          </Button>
        ) : null}
        {p.status === "ready" ? (
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StaleNote({ onForce }: { onForce: () => void }) {
  return (
    <div className="rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">
      The section changed after you asked. Re-run the suggestion, or apply and replace the newer edits.
      <Button size="xs" className="ml-2" onClick={onForce}>
        OK
      </Button>
    </div>
  );
}
