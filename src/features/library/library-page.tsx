"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Library, AlertTriangle, Download, FileText, Hammer, MessageSquareText, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, cn, EmptyState, Input, Spinner, toast } from "@/components/ui";
import { VerificationBadge } from "@/features/rounds/evidence-panel";
import { ImportList, useImports } from "./imports";
import { GapsPanel } from "./gaps-panel";
import { ExplainButton } from "@/features/explain/explain-button";
import { labelLine, type CardMeta } from "@/domain/card-label";

interface Hit {
  id: string;
  tag: string;
  shortCite: string;
  verificationStatus: string;
  origin: string;
  snippet: string;
  labels: string[];
  meta?: CardMeta | Record<string, never> | null;
  updatedAt: string;
}

const FILTERS: { key: string; label: string; v: string[] }[] = [
  { key: "all", label: "All", v: [] },
  { key: "verified", label: "Verified", v: ["verified", "verified_quote_only"] },
  { key: "imported", label: "Imported", v: ["imported"] },
  { key: "unverified", label: "Unverified", v: ["unverified"] },
  { key: "mismatch", label: "Mismatch", v: ["mismatch"] },
];

export function LibraryPage() {
  const { team } = useApp();
  const qc = useQueryClient();
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<"cards" | "analytics" | "gaps" | "files">(initialTab === "files" || initialTab === "analytics" || initialTab === "gaps" ? initialTab : "cards");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 220);
    return () => clearTimeout(t);
  }, [q]);
  const v = FILTERS.find((f) => f.key === filter)!.v;
  const res = useQuery({
    queryKey: ["library", team.id, debounced, filter],
    queryFn: () => api<{ cards: Hit[] }>(`/api/cards?teamId=${team.id}&q=${encodeURIComponent(debounced)}&limit=100${v.map((x) => `&v=${x}`).join("")}`),
    // Keep showing the last results while a new search loads (no flicker, nothing unmounts under a click).
    placeholderData: keepPreviousData,
  });

  const imports = useImports(team.id);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      await imports.add(Array.from(files));
      await qc.invalidateQueries({ queryKey: ["library", team.id] });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Library</h1>
            <p className="text-[13px] text-muted">Your team&apos;s evidence. Import whole files (.docx, .pdf, .txt, up to 50 MB each): they are split into cards with their formatting, labeled, and marked as not independently verified.</p>
          </div>
          <Link href="/library/build" className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium hover:bg-hover">
            <Hammer className="size-4" /> Build a file
          </Link>
          <Button className="shrink-0" variant="primary" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Import files
          </Button>
          <input ref={fileRef} type="file" multiple accept=".docx,.pdf,.txt" className="hidden" onChange={(e) => void upload(e.target.files)} />
        </div>
        <ImportList state={imports} teamId={team.id} />
        <div role="tablist" aria-label="Library view" className="mb-4 flex gap-1 border-b border-line">
          {(["cards", "analytics", "gaps", "files"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-3 py-1.5 text-[13px]", tab === t ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg")}>
              {t === "cards" ? "Cards" : t === "analytics" ? "Analytics" : t === "gaps" ? "Gaps & ideas" : "Files"}
            </button>
          ))}
        </div>
        {tab === "files" ? <FilesList teamId={team.id} /> : tab === "analytics" ? <AnalyticsList teamId={team.id} /> : tab === "gaps" ? <GapsPanel teamId={team.id} /> : (
        <>
        <SourceCheck teamId={team.id} onShowMismatches={() => setFilter("mismatch")} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-72 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tags, authors, card text…" className="pl-8" />
          </div>
          <div className="flex gap-1 rounded-lg bg-sunken p-1">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} className={cn("h-7 rounded-md px-2.5 text-[12.5px]", filter === f.key ? "bg-elev font-medium shadow-sm" : "text-muted hover:text-fg")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {res.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !res.data?.cards.length ? (
          <EmptyState icon={<Library className="size-8" />} title={debounced ? "No matching cards" : "No cards yet"}>
            Import your Verbatim files (.docx): tags, cites, underlining, emphasis, and highlighting are preserved. Or cut new cards from real sources in Research.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
            {res.data.cards.map((c) => (
              <li key={c.id} className="flex items-start">
                <Link href={`/library/cards/${c.id}`} className="block min-w-0 flex-1 px-4 py-3 hover:bg-hover">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold leading-snug">{c.tag}</div>
                      {c.meta && "side" in c.meta ? <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{labelLine(c.meta as CardMeta)}</div> : null}
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-semibold">{c.shortCite}</span>
                        <VerificationBadge status={c.verificationStatus} />
                        {c.labels.slice(0, 3).map((l) => (
                          <Badge key={l}>{l}</Badge>
                        ))}
                      </div>
                    </div>
                    {c.verificationStatus === "mismatch" ? <AlertTriangle className="size-4 text-bad" /> : null}
                  </div>
                </Link>
                <div className="px-2 py-3">
                  <ExplainButton teamId={team.id} target={{ kind: "card", cardId: c.id }} icon />
                </div>
              </li>
            ))}
          </ul>
        )}
        </>
        )}
      </div>
    </div>
  );
}

/** Check imported cards against the pages their citations link to, as one background job. */
function SourceCheck({ teamId, onShowMismatches }: { teamId: string; onShowMismatches: () => void }) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const info = useQuery({ queryKey: ["source-check", teamId], queryFn: () => api<{ checkable: number; latest: { id: string; status: string } | null }>(`/api/library/checks?teamId=${teamId}`) });
  const running = jobId ?? (info.data?.latest && ["queued", "running"].includes(info.data.latest.status) ? info.data.latest.id : null);
  const job = useQuery({
    queryKey: ["source-check-job", running],
    queryFn: () => api<{ job: { status: string; progress: { total: number; done: number; verified: number; close: number; mismatch: number; unreachable: number }[]; result: { verified: number; mismatch: number; unreachable: number; total: number } | null } }>(`/api/library/checks/${running}?teamId=${teamId}`),
    enabled: !!running,
    refetchInterval: (q) => (q.state.data && !["queued", "running"].includes(q.state.data.job.status) ? false : 2500),
  });
  const p = job.data?.job.progress?.[0];
  const finished = job.data && !["queued", "running"].includes(job.data.job.status);
  useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: ["library", teamId] });
  }, [finished, qc, teamId]);
  async function start() {
    try {
      const r = await api<{ jobId: string; cards: number }>("/api/library/checks", { method: "POST", json: { teamId } });
      setJobId(r.jobId);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }
  if (running && p)
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-elev px-3 py-2 text-[12.5px]">
        {!finished ? <Spinner className="size-3.5" /> : null}
        <span>
          {finished ? "Checked" : "Checking"} {p.done} of {p.total} cards against their sources: {p.verified} verified word for word, {p.close ?? 0} match except small differences (noted on the card), {p.mismatch} don&apos;t match, {p.unreachable} couldn&apos;t be checked (paywalls, previews).
        </span>
        {finished && p.mismatch ? (
          <button className="text-accent hover:underline" onClick={onShowMismatches}>
            Show the ones that don&apos;t match
          </button>
        ) : null}
      </div>
    );
  if (!info.data?.checkable) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px] text-muted">
      {info.data.checkable} imported card{info.data.checkable === 1 ? "" : "s"} link to their sources.
      <button className="text-accent hover:underline" onClick={() => void start()}>
        Check them word for word
      </button>
      <span className="text-faint">(pages behind paywalls stay unchecked)</span>
    </div>
  );
}

/** The team's files: imported ones and ones built here, with a Word copy to download. */
function FilesList({ teamId }: { teamId: string }) {
  const files = useQuery({ queryKey: ["library-files", teamId], queryFn: () => api<{ files: { id: string; fileName: string; createdAt: string; cards: number; built: boolean; downloadable: boolean }[] }>(`/api/library/uploads?teamId=${teamId}`) });
  if (files.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  if (!files.data?.files.length)
    return (
      <EmptyState icon={<FileText className="size-8" />} title="No files yet">
        Import your backfiles and camp files, or build a file for an argument. Their blocks can be inserted into any speech from the round&apos;s Files tab.
      </EmptyState>
    );
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
      {files.data.files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
          <FileText className="size-4 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate font-medium">{f.fileName.replace(/\.docx$/i, "")}</span>
          {f.built ? <Badge tone="accent">built</Badge> : null}
          <span className="shrink-0 text-xs text-faint">{f.cards} cards</span>
          {f.downloadable ? (
            <a href={`/api/uploads/${f.id}/download`} className="inline-flex shrink-0 items-center gap-1 text-xs text-accent hover:underline" aria-label={`Download ${f.fileName}`}>
              <Download className="size-3.5" /> Word
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface BankEntry {
  id: string;
  title: string;
  position: string;
  speech: string;
  side: string;
  answers: string;
  analytic: string;
  cites: string[];
  source: string;
  roundId: string | null;
  tournament: string | null;
  roundLabel: string | null;
}

/**
 * The team's analytics: blocks from imported files and answers from delivered speeches. Drafts adapt the ones
 * that answer what the speech must answer, on the same side.
 */
function AnalyticsList({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 220);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({ queryKey: ["library-analytics", teamId, debounced], queryFn: () => api<{ entries: BankEntry[] }>(`/api/library/analytics?teamId=${teamId}&q=${encodeURIComponent(debounced)}`) });
  async function remove(id: string) {
    try {
      await api(`/api/library/analytics/${id}?teamId=${teamId}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["library-analytics", teamId] });
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }
  return (
    <>
      <p className="mb-3 text-[12.5px] text-muted">Blocks of analytics from your imported files and the answers from speeches you delivered. When a draft must answer something similar, the speech AI adapts these (same side only) before writing new ones.</p>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search analytics: perm, condo, midterms, wait times…" className="pl-8" aria-label="Search analytics" />
      </div>
      {res.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !res.data?.entries.length ? (
        <EmptyState icon={<MessageSquareText className="size-8" />} title={debounced ? "No matching analytics" : "No analytics yet"}>
          Import speech docs or blocks: their analytics are saved here by block. Delivered speeches add their answers too.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
          {res.data.entries.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-snug">{e.title || e.position || "Analytics"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {e.side ? <Badge>{e.side}</Badge> : null}
                    {e.speech ? <Badge>{e.speech}</Badge> : null}
                    {e.position ? <span>{e.position}</span> : null}
                    {e.answers ? <span>· answers {e.answers}</span> : null}
                    <span className="text-faint">· {e.source ? `from ${e.source}` : [e.tournament, e.roundLabel].filter(Boolean).join(" ") || "a delivered speech"}</span>
                  </div>
                  <details className="mt-1.5">
                    <summary className="line-clamp-2 cursor-pointer text-[12.5px]">{e.analytic.split("\n")[0]}</summary>
                    <div className="mt-1 whitespace-pre-wrap text-[12.5px]">{e.analytic}</div>
                    {e.cites.length ? <div className="mt-1 text-[11.5px] text-faint">Cards read in this block: {e.cites.join(", ")}</div> : null}
                  </details>
                </div>
                <button className="shrink-0 rounded p-1 text-faint hover:bg-hover hover:text-bad" aria-label={`Remove ${e.title || "this entry"}`} onClick={() => void remove(e.id)}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
