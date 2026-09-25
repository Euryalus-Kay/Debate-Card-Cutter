"use client";

/**
 * How close an AI job is to done (A4): its stage ("Writing section 4 of 9:
 * Politics DA"), a bar, and time left counting down between server updates.
 * Before the first update it shows the time spent so far.
 */

import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
import { formatEta, type Progress } from "@/domain/progress";

export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** "7/15" while parts are being written; otherwise the stage itself ("Trimming to fit"). */
function shortStage(p: Progress): string {
  if (p.total && /^(Writing|Planning section|Reading line)/.test(p.stage)) return `${Math.min(p.done + 1, p.total)}/${p.total}`;
  const last = p.stage.split(";").pop()!.trim();
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Time left now: the server's estimate minus what has passed since it arrived. */
function leftMs(p: Progress, now: number): number | null {
  if (p.etaMs === null) return null;
  return Math.max(0, p.etaMs - (p.at ? now - p.at : 0));
}

export function AiProgress({ progress, since, label, compact, className }: { progress: Progress | null | undefined; since: number; label: string; compact?: boolean; className?: string }) {
  const now = useNow(true);
  const elapsed = Math.max(0, Math.round((now - since) / 1000));
  if (!progress) {
    return compact ? (
      <span className={cn("animate-pulse-soft text-[11.5px] text-muted", className)}>
        {label}… {elapsed}s
      </span>
    ) : (
      <p className={cn("animate-pulse-soft text-muted", className)}>
        {label}… {elapsed}s{elapsed > 20 ? " (deep reasoning takes longer before text appears)" : ""}
      </p>
    );
  }
  const left = leftMs(progress, now);
  const eta = formatEta(left);
  // Between updates the bar creeps toward where the time estimate says it should be, never past the next stage.
  const pct = Math.round(Math.min(0.99, progress.fraction) * 100);
  if (compact) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted", className)} role="status" aria-live="polite">
        <span className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-sunken">
          <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </span>
        <span className="truncate">
          {shortStage(progress)}
          {eta ? ` · ${eta.replace("about ", "~")}` : ""}
        </span>
      </span>
    );
  }
  return (
    <div className={cn("space-y-1", className)} role="status" aria-live="polite">
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-fg">{progress.stage}</span>
        <span className="shrink-0 font-mono tabular text-[11px] text-faint">{eta || `${elapsed}s`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
