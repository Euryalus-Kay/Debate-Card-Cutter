"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CardUse } from "@/domain/card-use";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, CircleDashed, ExternalLink, FileText, FlaskConical, Globe, Link2, Search, Trash2, XCircle } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, cn, EmptyState, Field, Input, Select, Spinner, Textarea, Tooltip, toast } from "@/components/ui";
import { CardBodyView } from "@/components/card-view";
import { VerificationBadge } from "@/features/rounds/evidence-panel";
import { fullCite, shortCite, type Citation } from "@/domain/citation";
import type { BodyBlock, CardIssue } from "@/domain/card";

type Mode = "search" | "urls" | "paste";

interface Item {
  key: string;
  url?: string;
  title?: string;
  publication?: string;
  provider: string;
  why?: string;
  status: string;
  method?: string;
  cardId?: string;
  error?: string;
  detail?: string;
  support?: { level: string; explanation: string; caveats: string[] };
  model?: string;
  ms?: { fetch?: number; cut?: number };
}

interface JobView {
  job: {
    id: string;
    status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
    input: { claim: string; context?: string; maxCards: number; search: boolean };
    checkpoint: { stage: string; discovery?: { queries: string[]; seen: number; ms: number; error?: string }; items: Item[]; cardsMade: number };
    result: { cardIds: string[]; summary: string } | null;
    error: string | null;
    cancelRequested: boolean;
    createdAt: string;
    updatedAt: string;
  };
  events: { id: number; level: string; stage: string; message: string; at: string }[];
  cards: { id: string; tag: string; citation: Citation; body: BodyBlock[]; verificationStatus: string; verification: { issues: CardIssue[] }; importedFrom: { support?: { level: string; explanation: string; caveats: string[] } } | null; labels: string[] }[];
}

interface JobListRow {
  id: string;
  status: string;
  input: { claim: string };
  checkpoint: { cardsMade: number };
  createdAt: string;
}

const RUNNING = new Set(["queued", "running"]);

const FOR_OPTIONS: [string, string][] = [
  ["1AC:aff", "1AC (aff)"],
  ["2AC:aff", "2AC (aff answers)"],
  ["1AR:aff", "1AR (aff)"],
  ["rebuttal:aff", "2AR (aff)"],
  ["1NC:neg", "1NC (neg)"],
  ["block:neg", "2NC / 1NR block (neg)"],
  ["rebuttal:neg", "2NR (neg)"],
];

export function ResearchPage() {
  const { team } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const jobId = params.get("job");
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("search");
  // A link from the library's gap review can fill in the claim, context, and what the card is for.
  const [claim, setClaim] = useState(params.get("claim")?.slice(0, 500) ?? "");
  const [context, setContext] = useState(params.get("context")?.slice(0, 1000) ?? "");
  const [urls, setUrls] = useState("");
  const [paste, setPaste] = useState({ body: "", title: "", authors: "", qualifications: "", date: "", publication: "", url: "" });
  const [maxCards, setMaxCards] = useState(3);
  const [starting, setStarting] = useState(false);
  // What the card is for: its speech sets excerpt and read length; its side what counts as ours in the library.
  const [forKey, setForKey] = useState<string>(FOR_OPTIONS.some(([k]) => k === params.get("for")) ? params.get("for")! : "2AC:aff");
  const [use, side] = forKey.split(":") as [CardUse, "aff" | "neg"];
  // Library first: a card the team already has costs nothing and is ready now.
  const [asked, setAsked] = useState<{ claim: string; context: string; side: "aff" | "neg" } | null>(null);
  const lib = useQuery({
    queryKey: ["library-find-team", team.id, asked],
    queryFn: () => api<{ cards: { id: string; tag: string; shortCite: string; verificationStatus: string; fit: number; use: string }[]; checked: boolean }>("/api/library/find", { method: "POST", json: { teamId: team.id, side: asked!.side, claim: asked!.claim, context: asked!.context || undefined } }),
    enabled: !!asked,
    staleTime: 60_000,
    retry: false,
  });

  const jobs = useQuery({ queryKey: ["research-jobs", team.id], queryFn: () => api<{ jobs: JobListRow[] }>(`/api/research/jobs?teamId=${team.id}`), refetchInterval: jobId ? false : 10000 });

  async function start() {
    const c = claim.trim();
    if (c.length < 3) return toast("Describe what the card should say.", "warn");
    const input: Record<string, unknown> = { claim: c, context: context.trim() || undefined, maxCards, search: mode === "search", use, side };
    if (mode === "urls") {
      const list = urls
        .split(/\s+/)
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//.test(u));
      if (!list.length) return toast("Add at least one http(s) URL.", "warn");
      input.urls = list.slice(0, 10);
    }
    if (mode === "paste") {
      if (paste.body.trim().length < 50) return toast("Paste the source text (at least a paragraph).", "warn");
      const split = (s: string) => s.split(/;|\n/).map((x) => x.trim()).filter(Boolean);
      input.text = {
        body: paste.body,
        title: paste.title.trim() || undefined,
        authors: split(paste.authors).length ? split(paste.authors) : undefined,
        qualifications: split(paste.qualifications).length ? split(paste.qualifications) : undefined,
        date: paste.date.trim() || undefined,
        publication: paste.publication.trim() || undefined,
        url: paste.url.trim() || undefined,
      };
      input.maxCards = 1;
    }
    setStarting(true);
    try {
      const r = await api<{ jobId: string }>(`/api/research/jobs`, { method: "POST", json: { teamId: team.id, input, idempotencyKey: crypto.randomUUID() } });
      router.replace(`/research?job=${r.jobId}`);
      void qc.invalidateQueries({ queryKey: ["research-jobs", team.id] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start research.", "bad");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Research</h1>
            <p className="text-[13px] text-muted">Find real sources, read their full text, and cut cards whose every word is checked against the source.</p>
          </div>
          <form
            className="space-y-3 rounded-xl border border-line bg-elev p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void start();
            }}
          >
            <Field label="What should the card say?" hint="The argument you need evidence for, as a claim.">
              <Textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={3} placeholder="Upzoning increases housing supply and lowers rents" aria-label="Claim" />
            </Field>
            <Field label="Context (optional)" hint="Side, position, or what it answers. Helps choose the best passage.">
              <Input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Aff answer to the Housing Prices DA" aria-label="Context" />
            </Field>
            <Field label="Card for" hint="Sets how long the card and its highlighting run (medians from real camp files).">
              <Select value={forKey} onChange={(e) => setForKey(e.target.value)} aria-label="Card for">
                {FOR_OPTIONS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {asked && asked.claim === claim.trim() ? (
              lib.isFetching ? (
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <Spinner className="size-3.5" /> Checking your library…
                </div>
              ) : lib.data?.cards.length ? (
                <div className="rounded-lg border border-line bg-sunken p-2">
                  <div className="mb-1.5 text-[12px] font-medium">Already in your library</div>
                  <ul className="space-y-1.5">
                    {lib.data.cards.map((c) => (
                      <li key={c.id} className="text-[12.5px]">
                        <a href={`/library/cards/${c.id}`} className="font-semibold leading-snug hover:underline">
                          {c.tag}
                        </a>
                        <div className="text-[11.5px] text-muted">
                          {c.shortCite} · {c.fit >= 3 ? "proves it" : "helps"}: {c.use}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : lib.data?.checked ? (
                <div className="text-[12px] text-muted">Nothing in your library proves this yet.</div>
              ) : null
            ) : claim.trim().length >= 3 ? (
              <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setAsked({ claim: claim.trim(), context: context.trim(), side })}>
                Check my library first
              </button>
            ) : null}
            <div role="radiogroup" aria-label="Where to look" className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1 text-[12.5px]">
              {(
                [
                  ["search", "Search web", Search],
                  ["urls", "My URLs", Link2],
                  ["paste", "Paste text", FileText],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    setMode(m);
                    setMaxCards(m === "search" ? 3 : 1);
                  }}
                  className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-medium", mode === m ? "bg-elev shadow-sm" : "text-muted hover:text-fg")}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            {mode === "urls" ? (
              <Field label="Source URLs" hint="One per line. Pages are read in full; nothing is quoted from search snippets.">
                <Textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={4} placeholder="https://…" aria-label="Source URLs" />
              </Field>
            ) : null}
            {mode === "paste" ? (
              <div className="space-y-2">
                <Field label="Source text" hint="Paste the article text (e.g. from a paywalled page you can read). The card is verified against exactly this text.">
                  <Textarea value={paste.body} onChange={(e) => setPaste({ ...paste, body: e.target.value })} rows={7} aria-label="Source text" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={paste.authors} onChange={(e) => setPaste({ ...paste, authors: e.target.value })} placeholder="Author(s); separate with ;" aria-label="Authors" />
                  <Input value={paste.date} onChange={(e) => setPaste({ ...paste, date: e.target.value })} placeholder="Date (e.g. March 3, 2024)" aria-label="Date" />
                  <Input className="col-span-2" value={paste.qualifications} onChange={(e) => setPaste({ ...paste, qualifications: e.target.value })} placeholder="Author qualifications, as the source states them" aria-label="Qualifications" />
                  <Input className="col-span-2" value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} placeholder="Title" aria-label="Title" />
                  <Input value={paste.publication} onChange={(e) => setPaste({ ...paste, publication: e.target.value })} placeholder="Publication" aria-label="Publication" />
                  <Input value={paste.url} onChange={(e) => setPaste({ ...paste, url: e.target.value })} placeholder="URL" aria-label="URL" />
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {mode !== "paste" ? (
                <label className="flex items-center gap-2 text-[12.5px] text-muted">
                  Cards
                  <Select value={maxCards} onChange={(e) => setMaxCards(Number(e.target.value))} className="h-8 w-16" aria-label="Number of cards">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              <Button type="submit" variant="primary" className="ml-auto" disabled={starting}>
                {starting ? <Spinner /> : <FlaskConical className="size-4" />} {mode === "search" ? "Find & cut" : "Cut card"}
              </Button>
            </div>
          </form>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Recent</div>
            {jobs.data?.jobs.length ? (
              <ul className="space-y-0.5">
                {jobs.data.jobs.map((j) => (
                  <li key={j.id}>
                    <button onClick={() => router.replace(`/research?job=${j.id}`)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover", j.id === jobId && "bg-hover")}>
                      <StatusIcon status={j.status} />
                      <span className="min-w-0 flex-1 truncate">{j.input.claim}</span>
                      <span className="shrink-0 text-[11px] text-faint">{j.checkpoint.cardsMade ?? 0} cards</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-faint">No research yet.</p>
            )}
          </div>
        </div>

        <div className="min-w-0">{jobId ? <JobPanel jobId={jobId} /> : <Intro />}</div>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <EmptyState icon={<FlaskConical className="size-8" />} title="How cards are made here">
      <ol className="mx-auto mt-2 max-w-md list-decimal space-y-1 pl-5 text-left text-[13px]">
        <li>Search finds leads; snippets are never quoted.</li>
        <li>Each page is fetched and its full text is stored (sites that block automated access are skipped; paste their text instead).</li>
        <li>The AI chooses a passage and what to highlight. It cannot write card text.</li>
        <li>Code copies the passage from the stored text and checks every word. Cite fields come from the page itself; anything unconfirmed is left out.</li>
      </ol>
    </EmptyState>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (RUNNING.has(status)) return <Spinner className="size-3.5" />;
  if (status === "succeeded" || status === "cut") return <CheckCircle2 className="size-3.5 text-ok" />;
  if (status === "partial" || status === "duplicate") return <CheckCircle2 className="size-3.5 text-warn" />;
  if (status === "cancelled" || status === "skipped") return <Ban className="size-3.5 text-faint" />;
  if (status === "no_support") return <XCircle className="size-3.5 text-faint" />;
  if (status === "failed" || status === "fetch_failed" || status === "cut_failed") return <AlertTriangle className="size-3.5 text-bad" />;
  if (status === "fetching" || status === "cutting") return <Spinner className="size-3.5" />;
  return <CircleDashed className="size-3.5 text-faint" />;
}

const ITEM_LABEL: Record<string, string> = {
  pending: "Waiting",
  fetching: "Reading page…",
  fetched: "Read",
  fetch_failed: "Unavailable",
  cutting: "Cutting & verifying…",
  cut: "Card cut",
  duplicate: "Already in library",
  no_support: "Doesn't support the claim",
  cut_failed: "Couldn't cut",
  skipped: "Not needed",
};

function host(u?: string) {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function JobPanel({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const { team } = useApp();
  const q = useQuery({
    queryKey: ["research-job", jobId],
    queryFn: () => api<JobView>(`/api/research/jobs/${jobId}`),
    refetchInterval: (query) => (query.state.data && !RUNNING.has(query.state.data.job.status) ? false : 1500),
  });
  const [now, setNow] = useState(() => Date.now());
  const running = q.data ? RUNNING.has(q.data.job.status) : true;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (q.data && !RUNNING.has(q.data.job.status)) void qc.invalidateQueries({ queryKey: ["research-jobs", team.id] });
  }, [q.data?.job.status, qc, team.id, q.data]);

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <EmptyState title="Couldn't load this research job">{q.error instanceof Error ? q.error.message : null}</EmptyState>;
  const { job, cards } = q.data;
  const cp = job.checkpoint;
  const elapsed = Math.round(((running ? now : new Date(job.updatedAt).getTime()) - new Date(job.createdAt).getTime()) / 1000);
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const made = cp.items.filter((i) => i.cardId && (i.status === "cut" || i.status === "duplicate"));

  async function cancel() {
    await api(`/api/research/jobs/${jobId}/cancel`, { method: "POST" });
    void q.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-elev p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Claim</div>
            <div className="text-[15px] font-semibold leading-snug">{job.input.claim}</div>
            {job.input.context ? <div className="mt-0.5 text-[12.5px] text-muted">{job.input.context}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[12px] tabular-nums text-faint">{elapsed}s</span>
            {running ? (
              <Button size="sm" onClick={cancel} disabled={job.cancelRequested}>
                {job.cancelRequested ? "Cancelling…" : "Cancel"}
              </Button>
            ) : (
              <Badge tone={job.status === "succeeded" ? "ok" : job.status === "partial" ? "warn" : job.status === "failed" ? "bad" : "neutral"}>{job.status}</Badge>
            )}
          </div>
        </div>
        <ol className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-3">
          <Stage title="Find sources" active={cp.stage === "discover"} done={cp.stage !== "discover"}>
            {cp.discovery ? `${cp.discovery.queries.length} searches · ${cp.items.length} leads` : job.input.search ? "Searching…" : `${cp.items.length} source${cp.items.length === 1 ? "" : "s"} given`}
          </Stage>
          <Stage title="Read full text" active={cp.items.some((i) => i.status === "fetching")} done={cp.stage === "done"}>
            {cp.items.filter((i) => !["pending", "fetching", "fetch_failed", "skipped"].includes(i.status)).length} read · {cp.items.filter((i) => i.status === "fetch_failed").length} unavailable
          </Stage>
          <Stage title="Cut & verify" active={cp.items.some((i) => i.status === "cutting")} done={cp.stage === "done"}>
            {cp.cardsMade} of {job.input.maxCards} cards
          </Stage>
        </ol>
        {job.result?.summary && !running ? <p className="mt-3 text-[13px] text-muted">{job.result.summary}</p> : null}
        {cp.discovery?.error ? <p className="mt-2 text-[12.5px] text-warn">Search problem: {cp.discovery.error}</p> : null}
      </div>

      {made.length ? (
        <div className="space-y-3">
          {made.map((it) => {
            const c = cardsById.get(it.cardId!);
            return c ? <ResultCard key={c.id} card={c} item={it} onDiscarded={() => void q.refetch()} /> : null;
          })}
        </div>
      ) : null}

      <div className="rounded-xl border border-line bg-elev">
        <div className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Sources</div>
        {cp.items.length === 0 ? <div className="px-4 py-3 text-[12.5px] text-faint">{running ? "Looking for sources…" : "No sources."}</div> : null}
        <ul className="divide-y divide-line">
          {cp.items.map((it) => (
            <li key={it.key} className="flex items-start gap-2.5 px-4 py-2.5 text-[12.5px]">
              <span className="mt-0.5">
                <StatusIcon status={it.status} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{it.title || host(it.url) || "Pasted text"}</span>
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-faint hover:text-fg">
                      {host(it.url)} <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <div className="text-muted">
                  <span className={cn(it.status === "fetch_failed" || it.status === "cut_failed" ? "text-bad" : "")}>{ITEM_LABEL[it.status] ?? it.status}</span>
                  {it.error ? ` — ${it.error}` : it.detail && it.status !== "cut" ? ` — ${it.detail}` : it.why && it.status === "pending" ? ` — ${it.why}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right text-[11px] tabular-nums text-faint">
                {it.method === "anthropic_web_fetch" ? (
                  <Tooltip content="Read through Anthropic's fetch service because the site blocked our reader.">
                    <Globe className="inline size-3" />
                  </Tooltip>
                ) : null}{" "}
                {it.ms?.fetch ? `${(it.ms.fetch / 1000).toFixed(1)}s` : ""}
                {it.ms?.cut ? ` + ${(it.ms.cut / 1000).toFixed(1)}s` : ""}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stage({ title, active, done, children }: { title: string; active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("rounded-lg border px-3 py-2", active ? "border-accent bg-accent-soft" : "border-line")}>
      <div className="flex items-center gap-1.5 font-medium">
        {active ? <Spinner className="size-3" /> : done ? <CheckCircle2 className="size-3 text-ok" /> : <CircleDashed className="size-3 text-faint" />}
        {title}
      </div>
      <div className="mt-0.5 text-muted">{children}</div>
    </li>
  );
}

function ResultCard({ card, item, onDiscarded }: { card: JobView["cards"][number]; item: Item; onDiscarded: () => void }) {
  const [discarding, setDiscarding] = useState(false);
  const support = card.importedFrom?.support ?? item.support;
  const issues = useMemo(() => (card.verification?.issues ?? []).filter((i) => i.severity !== "info" || i.code === "cite_field_rejected"), [card.verification]);
  async function discard() {
    setDiscarding(true);
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" });
      toast("Card removed from the library.", "ok");
      onDiscarded();
    } finally {
      setDiscarding(false);
    }
  }
  return (
    <article className="rounded-xl border border-line bg-elev p-4" aria-label={`Card: ${card.tag}`}>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug">{card.tag}</h3>
        <VerificationBadge status={card.verificationStatus} />
        {item.status === "duplicate" ? <Badge tone="neutral">Already saved</Badge> : null}
      </div>
      <p className="mt-1 text-[12.5px]">
        <strong>{shortCite(card.citation)}</strong> <span className="text-muted">{fullCite(card.citation)}</span>
      </p>
      {support ? (
        <div className="mt-2 rounded-lg bg-sunken px-3 py-2 text-[12.5px]">
          <span className="font-medium">Support: {support.level}.</span> <span className="text-muted">{support.explanation}</span>
          {support.caveats?.length ? (
            <ul className="mt-1 list-disc pl-4 text-muted">
              {support.caveats.slice(0, 4).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <CardBodyView body={card.body} className="mt-3" shrink />
      {issues.length ? (
        <ul className="mt-3 space-y-1 text-[12px]">
          {issues.map((i, k) => (
            <li key={k} className={cn("flex gap-1.5", i.severity === "error" ? "text-bad" : i.severity === "warning" ? "text-warn" : "text-muted")}>
              <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {i.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Link href={`/library/cards/${card.id}`} className="text-[12.5px] font-medium text-accent hover:underline">
          Open in library
        </Link>
        <span className="text-[11.5px] text-faint">Cut by {item.model ?? "AI"} · saved with label &ldquo;research&rdquo;</span>
        {item.status === "cut" ? (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={discard} disabled={discarding}>
            <Trash2 className="size-3.5" /> Discard
          </Button>
        ) : null}
      </div>
    </article>
  );
}
