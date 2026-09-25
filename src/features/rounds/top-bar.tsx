"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, CloudOff, Loader2, Pause, Play, TriangleAlert, Sparkles, Radio } from "lucide-react";
import type * as Y from "yjs";
import { Badge, Button, cn, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui";
import { SPEECH_IDS, SPEECHES, getFormat, type SpeechId } from "@/domain/format";
import { prepUsedMs, readTimers, togglePrep, type SlotRecord } from "@/shared/round-doc";
import { formatClock } from "@/domain/timing";
import { useYDocValue } from "@/client/sync/hooks";
import type { SyncSnapshot } from "@/client/sync/doc-sync";
import type { RoundRecord } from "./types";
import { useWorkspace } from "./store";

export function SyncIndicator({ snapshots }: { snapshots: (SyncSnapshot | null)[] }) {
  const s = snapshots.filter(Boolean) as SyncSnapshot[];
  const pending = s.reduce((a, x) => a + x.pending, 0);
  const statuses = s.map((x) => x.status);
  const localOk = s.every((x) => x.localPersistence);
  let icon = <Check className="size-3.5 text-ok" />;
  let text = "All changes saved";
  let tip = "Every edit has been acknowledged by the server.";
  if (statuses.includes("loading")) {
    icon = <Loader2 className="size-3.5 animate-spin text-muted" />;
    text = "Loading";
    tip = "Opening documents.";
  } else if (statuses.includes("error")) {
    icon = <TriangleAlert className="size-3.5 text-bad" />;
    text = pending ? `Not saved to server (${pending})` : "Sync problem";
    tip = (s.find((x) => x.status === "error")?.lastError ?? "Server error.") + (localOk ? " Edits are kept on this device and will retry." : " This browser can't store edits locally — don't close the tab.");
  } else if (statuses.includes("offline")) {
    icon = <CloudOff className="size-3.5 text-warn" />;
    text = pending ? `Offline · ${pending} change${pending === 1 ? "" : "s"} on this device` : "Offline";
    tip = localOk ? "Your edits are stored in this browser and will upload when the connection returns." : "Offline and this browser can't store edits locally. Keep this tab open.";
  } else if (statuses.includes("saving") || pending) {
    icon = <Loader2 className="size-3.5 animate-spin text-muted" />;
    text = "Saving…";
    tip = "Sending edits to the server.";
  }
  return (
    <Tooltip content={tip}>
      <div className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted" role="status" aria-live="polite">
        {icon}
        <span className="whitespace-nowrap">{text}</span>
      </div>
    </Tooltip>
  );
}

function PrepClock({ doc, side, label, budgetMs, offsetMs, isOurs }: { doc: Y.Doc; side: "aff" | "neg"; label: string; budgetMs: number; offsetMs: number; isOurs: boolean }) {
  const timers = useYDocValue(doc, readTimers);
  const [now, setNow] = useState(() => Date.now());
  const running = timers?.running === (side === "aff" ? "aff_prep" : "neg_prep");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  if (!timers) return null;
  const used = prepUsedMs(timers, side, now + offsetMs);
  const remaining = budgetMs - used;
  return (
    <button
      onClick={() => togglePrep(doc, side, Date.now() + offsetMs)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs tabular transition-colors",
        running ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-elev text-muted hover:bg-hover",
        remaining < 0 && "border-bad text-bad",
      )}
      title={`${label} prep. Click to ${running ? "stop" : "start"}; your partner sees the same clock.`}
    >
      {running ? <Pause className="size-3" /> : <Play className="size-3" />}
      <span className={cn("font-medium", isOurs ? "text-fg" : "")}>{label}</span>
      <span className="font-mono text-[12.5px]">{formatClock(remaining / 1000)}</span>
    </button>
  );
}

export function SpeechStepper({ slots, ourSide, hasDoc }: { slots: Record<SpeechId, SlotRecord> | null; ourSide: "aff" | "neg"; hasDoc: Set<SpeechId> }) {
  const { speech, set } = useWorkspace();
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-sunken p-0.5" role="tablist" aria-label="Speeches">
      {SPEECH_IDS.map((id) => {
        const def = SPEECHES[id];
        const st = slots?.[id]?.status ?? "not_started";
        const ours = def.side === ourSide;
        const active = speech === id;
        const documented = hasDoc.has(id) || st === "documented";
        return (
          <Tooltip key={id} content={`${def.name} · ${ours ? "your speech" : "opponent"} · ${st === "delivered" ? "delivered" : documented ? "document added, delivery not confirmed" : "no record yet"}`}>
            <button
              role="tab"
              aria-selected={active}
              onClick={() => set({ speech: id, center: "speech" })}
              className={cn(
                "relative flex h-7 min-w-11 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] font-semibold transition-colors",
                active ? "bg-elev text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              <span className={cn(ours ? (ourSide === "aff" ? "text-aff" : "text-neg") : "")}>{id}</span>
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  st === "delivered" ? "bg-ok" : documented ? "bg-warn" : "border border-line-strong",
                )}
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function TopBar({
  round,
  doc,
  slots,
  hasDoc,
  snapshots,
  offsetMs,
  others,
  onPhase,
  onOverride,
  aiEnabled,
}: {
  round: RoundRecord;
  doc: Y.Doc | null;
  slots: Record<SpeechId, SlotRecord> | null;
  hasDoc: Set<SpeechId>;
  snapshots: (SyncSnapshot | null)[];
  offsetMs: number;
  others: { name?: string; section?: string }[];
  onPhase: (p: RoundRecord["phase"]) => void;
  onOverride: () => void;
  aiEnabled: boolean;
}) {
  const fmt = getFormat(round.formatId, round.formatOverrides as never);
  const opp = round.opponent?.code || round.opponent?.school || "Opponent";
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-elev px-3">
      <Link href="/rounds" className="rounded-md p-1 text-muted hover:bg-hover" aria-label="All rounds">
        <ArrowLeft className="size-4" />
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <Badge tone={round.ourSide === "aff" ? "aff" : "neg"}>{round.ourSide.toUpperCase()}</Badge>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight">{round.title}</div>
          <div className="truncate text-[11px] text-muted leading-tight">vs {opp}</div>
        </div>
      </div>
      <div className="mx-2 hidden lg:block">
        <SpeechStepper slots={slots} ourSide={round.ourSide} hasDoc={hasDoc} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {doc ? (
          <>
            <PrepClock doc={doc} side="aff" label="Aff" budgetMs={fmt.prepSecondsPerTeam * 1000} offsetMs={offsetMs} isOurs={round.ourSide === "aff"} />
            <PrepClock doc={doc} side="neg" label="Neg" budgetMs={fmt.prepSecondsPerTeam * 1000} offsetMs={offsetMs} isOurs={round.ourSide === "neg"} />
          </>
        ) : null}
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant={round.phase === "live" ? "subtle" : "ghost"}>
              {round.phase === "live" ? <Radio className="size-3.5 text-bad" /> : null}
              {round.phase === "prep" ? "Prep" : round.phase === "live" ? "Live" : "Done"}
              <span className={cn("ml-1 flex items-center gap-1 text-[11px]", aiEnabled ? "text-accent-text" : "text-faint")}>
                <Sparkles className="size-3" />
                {aiEnabled ? "AI on" : "AI off"}
              </span>
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Round phase</MenuLabel>
            <MenuItem onSelect={() => onPhase("prep")}>Prep (before the round)</MenuItem>
            <MenuItem onSelect={() => onPhase("live")}>Live (round in progress)</MenuItem>
            <MenuItem onSelect={() => onPhase("done")}>Done</MenuItem>
            <MenuSeparator />
            <MenuLabel>AI policy: {round.aiPolicy === "prep_only" ? "prep only" : round.aiPolicy}</MenuLabel>
            {!aiEnabled && round.aiPolicy !== "off" ? <MenuItem onSelect={onOverride}>Override for this round…</MenuItem> : null}
          </MenuContent>
        </Menu>
        {others.length ? (
          <div className="flex -space-x-1.5">
            {others.slice(0, 3).map((o, i) => (
              <Tooltip key={i} content={`${o.name ?? "Partner"} is here`}>
                <span className="flex size-6 items-center justify-center rounded-full border-2 border-elev bg-info-soft text-[10px] font-semibold text-info">
                  {(o.name ?? "?").slice(0, 2).toUpperCase()}
                </span>
              </Tooltip>
            ))}
          </div>
        ) : null}
        <SyncIndicator snapshots={snapshots} />
      </div>
    </header>
  );
}
