"use client";

import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { api } from "@/client/api";
import { cn, Dialog, Spinner } from "@/components/ui";

export type ExplainTarget = { kind: "card"; cardId: string; roundId?: string } | { kind: "argument"; roundId: string; argId: string } | { kind: "position"; roundId: string; positionId: string };

interface Explanation {
  title: string;
  whose: "ours" | "theirs" | "library";
  simple: string;
  why: string;
  words: { term: string; meaning: string }[];
  respond: string[];
  watch: string[];
  flags: string[];
}

const useExplain = create<{ teamId: string | null; target: ExplainTarget | null; show: (teamId: string, target: ExplainTarget) => void; hide: () => void }>((set) => ({
  teamId: null,
  target: null,
  show: (teamId, target) => set({ teamId, target }),
  hide: () => set({ teamId: null, target: null }),
}));

/** "Explain" for any card or argument: opens the one explanation window (see ExplainHost). */
export function ExplainButton({ teamId, target, label = "Explain", icon = false, className }: { teamId: string; target: ExplainTarget; label?: string; icon?: boolean; className?: string }) {
  const show = useExplain((s) => s.show);
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        show(teamId, target);
      }}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-md text-xs text-accent hover:underline", icon ? "p-1 hover:bg-hover hover:no-underline" : "", className)}
      aria-label={icon ? `${label}: ${target.kind === "position" ? "this whole argument" : target.kind}` : undefined}
      title={icon ? "Explain in simple words" : undefined}
    >
      <Lightbulb className="size-3.5" />
      {icon ? null : label}
    </button>
  );
}

/**
 * The explanation window, mounted once for the app: any card or argument in very simple words, in the context of
 * the round and the topic. It stays open while lists around it refresh; the team shares each explanation.
 */
export function ExplainHost() {
  const { teamId, target, hide } = useExplain();
  const q = useQuery({
    queryKey: ["explain", teamId, target],
    queryFn: () => api<{ explanation: Explanation }>("/api/explain", { method: "POST", json: { teamId, target } }),
    enabled: !!teamId && !!target,
    staleTime: Infinity,
    retry: false,
  });
  const e = q.data?.explanation;
  return (
    <Dialog open={!!target} onOpenChange={(o) => (o ? undefined : hide())} title="In simple words" description={e?.title ?? undefined} width="max-w-xl">
      {q.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
          <Spinner className="size-4" /> Reading it and explaining…
        </div>
      ) : q.error ? (
        <p className="text-[13px] text-bad">{(q.error as Error).message}</p>
      ) : e ? (
        <div className="space-y-3 text-[13.5px] leading-relaxed">
          <p className="text-[14.5px]">{e.simple}</p>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Why it matters here</h3>
            <p>{e.why}</p>
          </section>
          {e.words.length ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Words to know</h3>
              <ul className="mt-0.5 space-y-0.5">
                {e.words.map((w, i) => (
                  <li key={i}>
                    <strong>{w.term}</strong>: {w.meaning}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {e.respond.length ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{e.whose === "theirs" ? "How to answer it" : "How to use it"}</h3>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {e.respond.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {e.watch.length ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Watch out</h3>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {e.watch.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {e.flags.map((f, i) => (
            <p key={i} className="rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">
              {f}
            </p>
          ))}
          <p className="text-[11px] text-faint">AI explanation from the card&apos;s own words: for understanding, not evidence to read.</p>
        </div>
      ) : null}
    </Dialog>
  );
}
