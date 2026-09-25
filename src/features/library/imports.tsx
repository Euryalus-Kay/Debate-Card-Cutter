"use client";

/**
 * Importing evidence files into the library (Phase B1). Each file goes straight
 * from the browser to storage (up to 50 MB), then a background job splits it
 * into cards, skips what the library already has, keeps variants, and labels
 * the new cards. Progress shows per file; closing the page doesn't stop it.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { upload } from "@vercel/blob/client";
import { CheckCircle2, FileText, Loader2, X, AlertTriangle } from "lucide-react";
import { api } from "@/client/api";
import { Badge, Button, cn } from "@/components/ui";

const MAX = 50 * 1024 * 1024;

interface JobRow {
  id: string;
  status: string;
  input: { fileName: string; size: number };
  progress: { stage: string; status: string; detail: string }[];
  result: { created: number; duplicates: number; variants: number; analytics: number; labeled: number; warnings: string[] } | null;
  error: string | null;
  createdAt: string;
}

interface Local {
  key: string;
  fileName: string;
  size: number;
  uploaded: number;
  error: string | null;
  jobId: string | null;
}

export function useImports(teamId: string) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<Local[]>([]);
  const jobs = useQuery({
    queryKey: ["imports", teamId],
    queryFn: () => api<{ jobs: JobRow[] }>(`/api/library/imports?teamId=${teamId}`),
    refetchInterval: (q) => ((q.state.data?.jobs ?? []).some((j) => j.status === "queued" || j.status === "running") || local.some((l) => !l.jobId && !l.error) ? 2000 : false),
  });
  // Polling a running import's status also resumes it after a timeout.
  const running = (jobs.data?.jobs ?? []).filter((j) => j.status === "queued" || j.status === "running").map((j) => j.id);
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => {
      for (const id of running) void api(`/api/library/imports/${id}?teamId=${teamId}`).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [running.join(","), teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  const finished = (jobs.data?.jobs ?? []).filter((j) => j.status === "succeeded").length;
  useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: ["library", teamId] });
  }, [finished, qc, teamId]);

  async function add(files: File[]) {
    for (const file of files) {
      const key = `${file.name}:${file.size}:${Date.now()}`;
      if (file.size > MAX) {
        setLocal((l) => [...l, { key, fileName: file.name, size: file.size, uploaded: 0, error: "Over 50 MB: split the file and import the parts.", jobId: null }]);
        continue;
      }
      setLocal((l) => [...l, { key, fileName: file.name, size: file.size, uploaded: 0, error: null, jobId: null }]);
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const blob = await upload(`teams/${teamId}/incoming/${safe}`, file, {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
          clientPayload: JSON.stringify({ teamId, purpose: "library" }),
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: (e) => setLocal((l) => l.map((x) => (x.key === key ? { ...x, uploaded: e.percentage } : x))),
        });
        const { jobId } = await api<{ jobId: string }>("/api/library/imports", { method: "POST", json: { teamId, pathname: blob.pathname, fileName: file.name, size: file.size } });
        setLocal((l) => l.map((x) => (x.key === key ? { ...x, uploaded: 100, jobId } : x)));
        await jobs.refetch();
      } catch (e) {
        setLocal((l) => l.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x)));
      }
    }
  }
  return { jobs: jobs.data?.jobs ?? [], local, add, dismiss: (key: string) => setLocal((l) => l.filter((x) => x.key !== key)) };
}

function Row({ name, children, done, failed, onDismiss }: { name: string; children: React.ReactNode; done?: boolean; failed?: boolean; onDismiss?: () => void }) {
  return (
    <li className="flex items-start gap-2 px-3 py-2 text-[12.5px]">
      {failed ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-bad" /> : done ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-accent" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-faint" />
          <span className="truncate font-medium">{name}</span>
        </div>
        <div className="mt-0.5 text-muted">{children}</div>
      </div>
      {onDismiss ? (
        <button className="rounded p-0.5 text-faint hover:bg-hover" onClick={onDismiss} aria-label="Dismiss">
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}

/** Uploads in flight, and recent imports with their stages. */
export function ImportList({ state, teamId }: { state: ReturnType<typeof useImports>; teamId: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openedAt] = useState(() => Date.now());
  const pending = state.local.filter((l) => !l.jobId);
  // Imports from the last day (and anything started since the page opened).
  const recent = state.jobs.filter((j) => !hidden.has(j.id) && openedAt - new Date(j.createdAt).getTime() < 24 * 3600_000).slice(0, 12);
  if (!pending.length && !recent.length) return null;
  return (
    <ul className="mb-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
      {pending.map((l) => (
        <Row key={l.key} name={l.fileName} failed={!!l.error} onDismiss={l.error ? () => state.dismiss(l.key) : undefined}>
          {l.error ?? (
            <span className="flex items-center gap-2">
              Uploading {Math.round(l.uploaded)}%
              <span className="h-1 w-24 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full bg-accent" style={{ width: `${l.uploaded}%` }} />
              </span>
            </span>
          )}
        </Row>
      ))}
      {recent.map((j) => {
        const active = j.status === "queued" || j.status === "running";
        const stage = j.progress.find((p) => p.status === "running") ?? j.progress[j.progress.length - 1];
        return (
          <Row key={j.id} name={j.input.fileName} done={j.status === "succeeded"} failed={j.status === "failed"} onDismiss={active ? undefined : () => setHidden(new Set([...hidden, j.id]))}>
            {j.status === "succeeded" && j.result ? (
              <span>
                {j.result.created} new cards
                {j.result.duplicates ? `, ${j.result.duplicates} already in the library` : ""}
                {j.result.variants ? `, ${j.result.variants} variants` : ""}
                {j.result.analytics ? `, ${j.result.analytics} analytics kept in the file` : ""}.
                {j.result.warnings[0] ? <span className="ml-1 text-warn">{j.result.warnings[0]}</span> : null}
              </span>
            ) : j.status === "failed" ? (
              <span className="text-bad">{j.error ?? "The import failed."}</span>
            ) : j.status === "cancelled" ? (
              "Stopped. Cards imported before stopping are kept."
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                {j.progress.map((p) => (
                  <Badge key={p.stage} tone={p.status === "done" ? "ok" : p.status === "running" ? "accent" : "neutral"}>
                    {p.stage}
                  </Badge>
                ))}
                <span className={cn(active && "animate-pulse-soft")}>{stage?.detail || "Starting…"}</span>
                {active ? (
                  <Button size="xs" variant="ghost" onClick={() => void api(`/api/library/imports/${j.id}?teamId=${teamId}`, { method: "POST", json: {} })}>
                    Stop
                  </Button>
                ) : null}
              </span>
            )}
          </Row>
        );
      })}
    </ul>
  );
}
