"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Hammer, Search } from "lucide-react";
import { api } from "@/client/api";
import { Badge, Button, EmptyState, Input, Spinner, toast } from "@/components/ui";

interface Spec {
  claim: string;
  source: string;
}
interface Review {
  summary: string;
  positions: { side: "aff" | "neg"; name: string; status: "ready" | "thin" | "missing"; have: string; missing: string[] }[];
  gaps: { side: "aff" | "neg"; title: string; why: string; priority: number; kind: "cards" | "block" | "file"; cards: Spec[] }[];
  ideas: { side: "aff" | "neg"; kind: string; title: string; pitch: string; whyUnique: string; firstCards: Spec[] }[];
}
interface Job {
  id: string;
  status: string;
  result: { review: Review; inventory: { cards: number; blocks: number; positions: number } } | null;
  error: string | null;
  input: { focus?: string };
  createdAt: string;
}

const STATUS_TONE = { ready: "ok", thin: "warn", missing: "bad" } as const;
// What a card for this side is usually cut for, in the card maker.
const FOR = { aff: "2AC:aff", neg: "block:neg" } as const;
const BUILD_KIND: Record<string, string> = { disad: "da", counterplan: "cp", kritik: "k", topicality: "t", theory: "theory", case_turn: "case_neg", aff: "aff", advantage: "aff", add_on: "aff" };

function findHref(side: "aff" | "neg", spec: Spec, about: string) {
  return `/research?claim=${encodeURIComponent(spec.claim)}&context=${encodeURIComponent(`${about}. Look in: ${spec.source}`)}&for=${FOR[side]}`;
}

/**
 * The library against the topic: what each position has, what is thin or missing, and arguments worth building,
 * with links that start the research or the file. Partners see the same review.
 */
export function GapsPanel({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const [focus, setFocus] = useState("");
  const [starting, setStarting] = useState(false);
  const q = useQuery({
    queryKey: ["library-gaps", teamId],
    queryFn: () => api<{ job: Job | null }>(`/api/library/gaps?teamId=${teamId}`),
    refetchInterval: (query) => (query.state.data?.job?.status === "running" ? 3000 : false),
  });
  const job = q.data?.job ?? null;
  async function start() {
    setStarting(true);
    try {
      await api("/api/library/gaps", { method: "POST", json: { teamId, focus: focus.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: ["library-gaps", teamId] });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setStarting(false);
    }
  }
  const review = job?.status === "succeeded" ? job.result?.review : null;
  return (
    <>
      <div className="mb-4 rounded-xl border border-line bg-elev p-3">
        <p className="text-[12.5px] text-muted">Review your library against this season&apos;s topic: what each position has, what&apos;s thin or missing for each speech, and arguments worth building that fewer teams will be ready for. Uses your cards&apos; labels and analytics (about $0.30 of AI).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus: e.g. 'our aff is single payer; we need 2AC answers' or 'new negs for UKTOC'" className="min-w-72 flex-1" aria-label="Review focus" />
          <Button variant="primary" loading={starting || job?.status === "running"} onClick={() => void start()}>
            <Compass className="size-4" /> {review ? "Review again" : "Review my library"}
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : job?.status === "running" ? (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-elev px-3 py-2 text-[12.5px]">
          <Spinner className="size-3.5" /> Reviewing every position against the topic. This takes about a minute; you can leave this page.
        </div>
      ) : job?.status === "failed" ? (
        <div className="rounded-lg bg-bad-soft px-3 py-2 text-[12.5px] text-bad">The review didn&apos;t finish: {job.error}</div>
      ) : !review ? (
        <EmptyState icon={<Compass className="size-8" />} title="No review yet">
          Import your files first, then review the library to see its gaps and new arguments to build.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-elev px-4 py-3 text-[13px]">
            <div className="mb-1 text-xs text-faint">
              {job?.result?.inventory.cards} cards, {job?.result?.inventory.blocks} analytics blocks · {new Date(job!.createdAt).toLocaleString()}
              {job?.input.focus ? ` · focus: ${job.input.focus}` : ""}
            </div>
            {review.summary}
          </div>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold">Positions</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
              {review.positions.map((p, i) => (
                <li key={i} className="px-4 py-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={p.side}>{p.side}</Badge>
                    <span className="font-medium">{p.name}</span>
                    <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  </div>
                  <div className="mt-0.5 text-muted">{p.have}</div>
                  {p.missing.length ? <div className="mt-0.5">Missing: {p.missing.join("; ")}</div> : null}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold">Gaps to fill first</h2>
            <ul className="space-y-2">
              {[...review.gaps].sort((a, b) => a.priority - b.priority).map((g, i) => (
                <li key={i} className="rounded-xl border border-line bg-elev px-4 py-3 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={g.priority === 1 ? "bad" : g.priority === 2 ? "warn" : "neutral"}>{g.priority === 1 ? "next tournament" : g.priority === 2 ? "soon" : "later"}</Badge>
                    <Badge tone={g.side}>{g.side}</Badge>
                    <span className="font-medium">{g.title}</span>
                  </div>
                  <div className="mt-0.5 text-muted">{g.why}</div>
                  <ul className="mt-1.5 space-y-1">
                    {g.cards.map((c, j) => (
                      <li key={j} className="flex flex-wrap items-center gap-2">
                        <span>
                          {c.claim} <span className="text-faint">({c.source})</span>
                        </span>
                        <Link href={findHref(g.side, c, g.title)} className="inline-flex items-center gap-1 text-accent hover:underline">
                          <Search className="size-3" /> Find this card
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold">Arguments worth building</h2>
            <ul className="space-y-2">
              {review.ideas.map((d, i) => (
                <li key={i} className="rounded-xl border border-line bg-elev px-4 py-3 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={d.side}>{d.side}</Badge>
                    <Badge>{d.kind.replace("_", " ")}</Badge>
                    <span className="font-medium">{d.title}</span>
                    <Link href={`/library/build?kind=${BUILD_KIND[d.kind] ?? "da"}&side=${d.side}&argument=${encodeURIComponent(`${d.title}: ${d.pitch}`)}`} className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
                      <Hammer className="size-3" /> Build a file
                    </Link>
                  </div>
                  <div className="mt-0.5">{d.pitch}</div>
                  <div className="mt-0.5 text-muted">Why it&apos;s unique: {d.whyUnique}</div>
                  <ul className="mt-1.5 space-y-1">
                    {d.firstCards.map((c, j) => (
                      <li key={j} className="flex flex-wrap items-center gap-2">
                        <span>
                          {c.claim} <span className="text-faint">({c.source})</span>
                        </span>
                        <Link href={findHref(d.side, c, d.title)} className="inline-flex items-center gap-1 text-accent hover:underline">
                          <Search className="size-3" /> Find this card
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-[11.5px] text-faint">The review describes the kind of source to look for; every card you cut is checked word for word against its source.</p>
        </div>
      )}
    </>
  );
}
