"use client";

/**
 * Build a file (Phase E): describe an argument → the AI plans the whole kit (every speech's sections, card
 * claims to find, analytics written out) → the team reviews the plan and its cost → cards come from the
 * library first, then from real sources (each verified word for word) → the file lands in the library's
 * Files, ready to insert into speeches or download for Word.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, Download, FileText, FlaskConical, Loader2, X } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, cn, Field, Input, Select, Spinner, Textarea, toast } from "@/components/ui";
import { analyticLine } from "@/domain/analytic-line";

const KINDS: [string, string][] = [
  ["da", "Disadvantage"],
  ["cp", "Counterplan"],
  ["k", "Kritik"],
  ["t", "Topicality"],
  ["theory", "Theory"],
  ["case_neg", "Case negative (against one aff)"],
  ["aff", "Affirmative"],
  ["answers", "Answers to one of their arguments"],
];
const RESOLUTION = "Resolved: The United States federal government should establish national health insurance in the United States.";
const RESEARCH_COST = 0.25;

interface Item {
  kind: "card" | "analytic" | "text";
  label: string;
  text: string;
  search: string;
}
interface Plan {
  title: string;
  notes: string;
  sections: { heading: string; speech: string; blocks: { heading: string; items: Item[] }[] }[];
  questions: string[];
}
interface BuildItem {
  key: string;
  label: string;
  status: "pending" | "library" | "researching" | "cut" | "not_found" | "removed";
  note?: string;
}
interface Build {
  id: string;
  status: string;
  input: { kind: string; argument: string; maxCards: number };
  checkpoint: { stage: string; plan?: Plan; items: BuildItem[]; uploadId?: string; fileName?: string };
  result: { uploadId: string; fileName: string; cards: number; fromLibrary: number; researched: number; missing: string[] } | null;
  error: string | null;
}

export function FileBuilder() {
  const { team } = useApp();
  const router = useRouter();
  const jobId = useSearchParams().get("job");
  const builds = useQuery({ queryKey: ["file-builds", team.id], queryFn: () => api<{ builds: { id: string; status: string; input: { argument: string; kind: string }; createdAt: string }[] }>(`/api/files/builds?teamId=${team.id}`) });
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Link href="/library" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Library
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Build a file</h1>
            <p className="text-[13px] text-muted">A complete file for an argument: every speech&apos;s blocks, with analytics written and cards found in your library or cut from real sources, each checked word for word.</p>
          </div>
          <BuildForm onStarted={(id) => router.replace(`/library/build?job=${id}`)} />
          {builds.data?.builds.length ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Recent</div>
              <ul className="space-y-0.5">
                {builds.data.builds.map((b) => (
                  <li key={b.id}>
                    <button onClick={() => router.replace(`/library/build?job=${b.id}`)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover", b.id === jobId && "bg-hover")}>
                      <StatusDot status={b.status} />
                      <span className="min-w-0 flex-1 truncate">{b.input.argument}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="min-w-0">{jobId ? <BuildView key={jobId} jobId={jobId} /> : <HowItWorks />}</div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "succeeded") return <CheckCircle2 className="size-3.5 shrink-0 text-ok" />;
  if (status === "failed" || status === "cancelled") return <X className="size-3.5 shrink-0 text-faint" />;
  if (status === "awaiting_approval") return <FileText className="size-3.5 shrink-0 text-accent" />;
  return <Loader2 className="size-3.5 shrink-0 animate-spin text-faint" />;
}

function BuildForm({ onStarted }: { onStarted: (jobId: string) => void }) {
  const { team } = useApp();
  const qc = useQueryClient();
  // A round can open this prefilled: ?kind=answers&side=aff&argument=…&target=…
  const params = useSearchParams();
  const [kind, setKind] = useState(KINDS.some(([k]) => k === params.get("kind")) ? params.get("kind")! : "da");
  const [side, setSide] = useState<"aff" | "neg">(params.get("side") === "neg" ? "neg" : "aff");
  const [argument, setArgument] = useState(params.get("argument") ?? "");
  const [resolution, setResolution] = useState(RESOLUTION);
  const [target, setTarget] = useState(params.get("target") ?? "");
  const [maxCards, setMaxCards] = useState(16);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (argument.trim().length < 3) return toast("Describe the argument.", "warn");
    setBusy(true);
    try {
      const r = await api<{ jobId: string }>("/api/files/builds", { method: "POST", json: { teamId: team.id, input: { kind, side: kind === "answers" ? side : undefined, argument: argument.trim(), resolution: resolution.trim(), target: target.trim() || undefined, maxCards, instructions: instructions.trim() || undefined } } });
      void qc.invalidateQueries({ queryKey: ["file-builds", team.id] });
      onStarted(r.jobId);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-elev p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Kind of file">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of file">
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "answers" ? (
        <Field label="Our side">
          <Select value={side} onChange={(e) => setSide(e.target.value as "aff" | "neg")} aria-label="Our side">
            <option value="aff">Aff (answering their neg position)</option>
            <option value="neg">Neg (answering their aff)</option>
          </Select>
        </Field>
      ) : null}
      <Field label={kind === "answers" ? "Their argument" : "The argument"} hint={kind === "answers" ? "What they say, and the warrants to answer." : "What it says and why, in your words."}>
        <Textarea value={argument} onChange={(e) => setArgument(e.target.value)} rows={3} placeholder="Capital flight: the tax increases that fund national health insurance push investment offshore, which slows growth" aria-label="The argument" />
      </Field>
      <Field label="Resolution">
        <Input value={resolution} onChange={(e) => setResolution(e.target.value)} aria-label="Resolution" />
      </Field>
      <Field label="Against or for (optional)" hint="An opponent's aff, or the arguments this file answers.">
        <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Single-payer affs" aria-label="Against or for" />
      </Field>
      <Field label="Team instructions (optional)">
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Lay-judge friendly; include a politics-style link" aria-label="Team instructions" />
      </Field>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          Cards, at most
          <Select value={maxCards} onChange={(e) => setMaxCards(Number(e.target.value))} className="h-8 w-16" aria-label="Most cards">
            {[6, 10, 16, 20, 25, 30].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="primary" className="ml-auto" loading={busy}>
          <FileText className="size-4" /> Plan the file
        </Button>
      </div>
      <p className="text-[11.5px] text-faint">Planning costs about $0.40. Nothing is researched until you approve the plan.</p>
    </form>
  );
}

function HowItWorks() {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-[13px] text-muted">
      <ol className="list-decimal space-y-2 pl-5">
        <li>The AI plans the whole file the way camp files are laid out: the 1NC or 1AC shell, block extensions, answers to what the other side will say, and last-rebuttal framing. Analytics are written out; each card is a claim to find.</li>
        <li>You review the plan and its cost, and drop anything you don&apos;t want.</li>
        <li>Each card comes from your library if you already have one that proves it; otherwise it&apos;s cut from a real source for the speech it&apos;s read in and checked word for word. Cards that can&apos;t be found are marked &ldquo;Card needed&rdquo;, never made up.</li>
        <li>The file lands in your library&apos;s files: insert its blocks into speeches, or download it for Word.</li>
      </ol>
    </div>
  );
}

function BuildView({ jobId }: { jobId: string }) {
  const { team } = useApp();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["file-build", jobId],
    queryFn: () => api<{ build: Build }>(`/api/files/builds/${jobId}?teamId=${team.id}`),
    refetchInterval: (query) => (["queued", "running"].includes(query.state.data?.build.status ?? "queued") ? 2000 : false),
  });
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const b = q.data?.build;
  if (!b) return q.error ? <p className="text-bad">{(q.error as Error).message}</p> : <Spinner />;
  const plan = b.checkpoint.plan;
  const items = new Map(b.checkpoint.items.map((i) => [i.key, i]));

  async function act(action: "approve" | "cancel") {
    setBusy(true);
    try {
      await api(`/api/files/builds/${jobId}`, { method: "POST", json: action === "approve" ? { teamId: team.id, action, removed: [...removed] } : { teamId: team.id, action } });
      await qc.invalidateQueries({ queryKey: ["file-build", jobId] });
      void qc.invalidateQueries({ queryKey: ["file-builds", team.id] });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <div className="rounded-xl border border-line bg-elev p-4 text-[13px]">
        {b.status === "failed" || b.status === "cancelled" ? (
          <p className="text-bad">{b.error ?? "The plan didn't finish."}</p>
        ) : (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Planning the file: every speech&apos;s sections, the cards to find, and the analytics. About a minute.
          </div>
        )}
      </div>
    );
  }

  const live = b.checkpoint.items.filter((i) => i.status !== "removed" && !removed.has(i.key));
  const reviewing = b.status === "awaiting_approval";
  const done = b.checkpoint.items.filter((i) => ["library", "cut", "not_found"].includes(i.status)).length;
  const total = b.checkpoint.items.filter((i) => i.status !== "removed").length;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-elev p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{plan.title}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{plan.notes}</p>
          </div>
          <StatusDot status={b.status} />
        </div>
        {reviewing ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-[12.5px] text-muted">
              {live.length} card{live.length === 1 ? "" : "s"} to find: at most about ${(live.length * RESEARCH_COST).toFixed(2)} (cards already in your library cost nothing).
            </span>
            <Button variant="ghost" className="ml-auto" onClick={() => void act("cancel")} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void act("approve")} loading={busy}>
              <FlaskConical className="size-4" /> Build it
            </Button>
          </div>
        ) : b.status === "succeeded" && b.result ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px]">
            <span className="text-muted">
              {b.result.cards} cards: {b.result.fromLibrary} from your library, {b.result.researched} cut from sources{b.result.missing.length ? `; ${b.result.missing.length} not found (marked "Card needed")` : ""}.
            </span>
            <a href={`/api/uploads/${b.result.uploadId}/download`} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 hover:bg-hover">
              <Download className="size-3.5" /> Word file
            </a>
            <Link href="/library?tab=files" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 hover:bg-hover">
              <BookOpen className="size-3.5" /> In Files
            </Link>
          </div>
        ) : ["queued", "running"].includes(b.status) ? (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] text-muted">
            <Spinner className="size-3.5" /> {b.checkpoint.stage === "assemble" ? "Putting the file together…" : `Finding cards: ${done} of ${total} done`}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void act("cancel")} disabled={busy}>
              Stop
            </Button>
          </div>
        ) : b.error ? (
          <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-bad">{b.error}</p>
        ) : null}
      </div>
      {plan.sections.map((s, si) => (
        <section key={si} className="rounded-xl border border-line bg-elev p-4">
          <h3 className="text-[13.5px] font-semibold">{s.heading}</h3>
          {s.blocks.map((blk, bi) => (
            <div key={bi} className="mt-3">
              <div className="text-[12.5px] font-medium text-muted">{blk.heading}</div>
              <ul className="mt-1 space-y-1">
                {blk.items.map((it, ii) => {
                  const key = `${si}.${bi}.${ii}`;
                  const st = items.get(key);
                  if (it.kind !== "card")
                    return (
                      <li key={ii} className="rounded-md bg-sunken px-2 py-1 text-[12.5px]">
                        {it.kind === "text" ? (
                          <>
                            <span className="font-semibold">{it.label}:</span> {it.text}
                          </>
                        ) : (
                          analyticLine(it.label, it.text)
                        )}
                        <Badge className="ml-1.5">{it.kind === "text" ? "text" : "analytic"}</Badge>
                      </li>
                    );
                  return (
                    <li key={ii} className="flex items-start gap-2 rounded-md px-2 py-1 text-[12.5px]">
                      {reviewing ? (
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={!removed.has(key)}
                          aria-label={`Keep card: ${it.label}`}
                          onChange={(e) =>
                            setRemoved((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.delete(key);
                              else n.add(key);
                              return n;
                            })
                          }
                        />
                      ) : (
                        <ItemStatus status={st?.status ?? "pending"} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{it.label}</span>
                        {it.search ? <span className="block text-[11.5px] text-faint">Look for: {it.search}</span> : null}
                        {st?.note && (st.status === "library" || st.status === "not_found") ? <span className="block text-[11.5px] text-muted">{st.status === "library" ? `From your library: ${st.note}` : st.note}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {plan.questions.length ? <div className="text-[12.5px] text-info">To decide: {plan.questions.join(" ")}</div> : null}
    </div>
  );
}

function ItemStatus({ status }: { status: BuildItem["status"] }) {
  const label = { pending: "waiting", library: "library", researching: "cutting", cut: "cut", not_found: "not found", removed: "dropped" }[status];
  const tone = status === "library" || status === "cut" ? "ok" : status === "not_found" ? "warn" : "neutral";
  return (
    <Badge tone={tone} className="mt-0.5 shrink-0">
      {status === "researching" ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
      {label}
    </Badge>
  );
}
