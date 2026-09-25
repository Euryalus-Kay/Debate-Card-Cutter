"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Library, AlertTriangle } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, cn, EmptyState, Input, Spinner, toast } from "@/components/ui";
import { VerificationBadge } from "@/features/rounds/evidence-panel";
import { ImportList, useImports } from "./imports";

interface Hit {
  id: string;
  tag: string;
  shortCite: string;
  verificationStatus: string;
  origin: string;
  snippet: string;
  labels: string[];
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
          <Button className="ml-auto" variant="primary" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Import files
          </Button>
          <input ref={fileRef} type="file" multiple accept=".docx,.pdf,.txt" className="hidden" onChange={(e) => void upload(e.target.files)} />
        </div>
        <ImportList state={imports} teamId={team.id} />
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
              <li key={c.id}>
                <Link href={`/library/cards/${c.id}`} className="block px-4 py-3 hover:bg-hover">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold leading-snug">{c.tag}</div>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
