"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import { api } from "@/client/api";
import { useDocSync } from "@/client/sync/hooks";
import { Badge, Button, cn, EmptyState, toast } from "@/components/ui";
import { useApp } from "@/components/shell/app-shell";
import { formatClock } from "@/domain/timing";
import type { AlternativesOutput, SectionRevisionOutput, SpeechDraftOutput } from "@/server/ai/schemas";
import { useWorkspace } from "./store";
import { applyDraft, applyRevision, fetchCards, sectionNodes, useProposals, type Proposal } from "./proposals";
import type { RoundRecord } from "./types";
import { getActiveEditor } from "./editor/active-editor";

interface OpRow {
  id: string;
  kind: string;
  status: string;
  model: string;
  createdAt: string;
  error: string | null;
  docId: string | null;
  target: { speech?: string; sectionId?: string | null };
  output: unknown;
}

export function AiPanel({ round, aiEnabled }: { round: RoundRecord; aiEnabled: boolean }) {
  const proposals = useProposals((s) => s.proposals).filter((p) => p.draftId);
  const history = useQuery({ queryKey: ["ai-ops", round.id], queryFn: () => api<{ ops: OpRow[] }>(`/api/rounds/${round.id}/ai-ops`), refetchInterval: 15_000 });
  // Rehydrate finished-but-unapplied proposals (after refresh, or ones your partner started).
  useEffect(() => {
    const ops = history.data?.ops ?? [];
    const store = useProposals.getState();
    for (const o of [...ops].reverse()) {
      if (!o.output || !o.docId || store.proposals.some((p) => p.opId === o.id)) continue;
      const base = { id: `op-${o.id}`, opId: o.id, draftId: o.docId, speech: o.target.speech ?? "", status: "ready" as const, partial: null, error: null, startedAt: new Date(o.createdAt).getTime() };
      if (o.kind === "draft_speech") store.add({ ...base, kind: "draft", result: o.output as never, baseDraftHash: null });
      else if (o.kind.startsWith("revise:") && o.target.sectionId) store.add({ ...base, kind: o.kind === "revise:alternatives" ? "alternatives" : "revision", sectionId: o.target.sectionId, action: o.kind.slice(7), result: o.output as never } as Proposal);
    }
  }, [history.data]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!aiEnabled ? (
        <div className="m-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">AI is off for this round (tournament rules setting). Flow, evidence, timers, and drafting still work.</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {proposals.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-7" />} title="No AI suggestions yet">
            Use &ldquo;Build / revise&rdquo; above the draft, or the ✦ menu on any section. Suggestions appear here for you to review; nothing changes your draft until you apply it.
          </EmptyState>
        ) : (
          proposals.map((p) => <ProposalCard key={p.id} p={p} />)
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

function ProposalCard({ p }: { p: Proposal }) {
  const upd = useProposals((s) => s.update);
  const { team } = useApp();
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const isCurrentDraft = ws.draftId === p.draftId;
  const { sync } = useDocSync(p.draftId);
  void sync;

  async function markOp(field: "applied" | "dismissed") {
    if (p.opId) await api(`/api/ai/ops/${p.opId}`, { method: "PATCH", json: { [field]: true } }).catch(() => {});
  }

  const title =
    p.kind === "draft" ? `${p.speech} draft` : p.kind === "alternatives" ? "Three approaches" : `Revise section: ${"action" in p ? p.action : ""}`;

  return (
    <div className={cn("mb-3 rounded-xl border bg-elev p-3", p.status === "failed" ? "border-bad/40" : "border-line")}>
      <div className="mb-2 flex items-center gap-2">
        {p.status === "running" ? <Loader2 className="size-3.5 animate-spin text-accent" /> : p.status === "ready" ? <Sparkles className="size-3.5 text-accent" /> : p.status === "applied" ? <Check className="size-3.5 text-ok" /> : p.status === "failed" ? <AlertTriangle className="size-3.5 text-bad" /> : <X className="size-3.5 text-faint" />}
        <span className="text-[13px] font-semibold">{title}</span>
        <Badge tone={p.status === "ready" ? "accent" : p.status === "applied" ? "ok" : p.status === "failed" ? "bad" : "neutral"}>{p.status}</Badge>
        {!isCurrentDraft ? <span className="ml-auto text-[11px] text-faint">other draft</span> : null}
      </div>
      {p.error ? <p className="text-xs text-bad">{p.error}</p> : null}
      {p.kind === "draft" ? <DraftProposal p={p} busy={busy} setBusy={setBusy} teamId={team.id} markOp={markOp} upd={upd} /> : <SectionProposal p={p} busy={busy} setBusy={setBusy} teamId={team.id} markOp={markOp} upd={upd} />}
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
      {out?.strategy?.summary ? <p className="mb-2 text-fg">{out.strategy.summary}</p> : p.status === "running" ? <Thinking since={p.startedAt} label="Planning the speech" /> : null}
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
          <div className={cn("text-xs", v.estimatedSeconds > v.limitSeconds ? "text-bad" : "text-muted")}>
            Estimated {formatClock(v.estimatedSeconds)} of {formatClock(v.limitSeconds)}
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

function Thinking({ since, label }: { since: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - since) / 1000));
  return (
    <p className="animate-pulse-soft text-muted">
      {label}… {s}s{s > 20 ? " (deep reasoning takes longer before text appears)" : ""}
    </p>
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
