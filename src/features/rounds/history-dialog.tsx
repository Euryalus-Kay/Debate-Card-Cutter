"use client";

/**
 * Version history for a speech draft: saved versions (delivered, manual,
 * before AI changes, before restores), a read-only preview, and restore.
 * Restoring writes the old content as a new change, after saving the current
 * content as a version, so nothing is ever lost.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { api } from "@/client/api";
import { flushDoc } from "@/client/sync/hooks";
import { Badge, Button, cn, Dialog, EmptyState, Input, Spinner, toast } from "@/components/ui";
import { draftFromPM, type DraftItem, type PMNodeJSON } from "@/shared/draft-model";

interface VersionRow {
  id: string;
  label: string;
  reason: string;
  createdAt: string;
  createdBy: string | null;
}

const REASON: Record<string, { label: string; tone: "ok" | "accent" | "neutral" | "warn" }> = {
  delivered: { label: "delivered", tone: "ok" },
  manual: { label: "saved", tone: "accent" },
  ai_apply: { label: "before AI", tone: "neutral" },
  before_restore: { label: "before restore", tone: "warn" },
  restore: { label: "restore", tone: "neutral" },
  auto: { label: "auto", tone: "neutral" },
  import: { label: "import", tone: "neutral" },
};

/** Save a version before an AI change is applied (best effort; never blocks the change). */
export async function saveVersionBeforeAi(draftId: string, what: string): Promise<void> {
  await flushDoc(draftId);
  await api(`/api/docs/${draftId}/versions`, { method: "POST", json: { label: `Before AI: ${what}`, reason: "ai_apply" } }).catch(() => {});
}

function Preview({ items, depth = 0 }: { items: DraftItem[]; depth?: number }) {
  return (
    <>
      {items.map((it, i) => {
        if (it.type === "section") {
          return (
            <div key={i} className={cn("border-l-2 border-line pl-2", depth === 0 ? "mt-2" : "mt-1")}>
              <Preview items={it.section.items} depth={depth + 1} />
            </div>
          );
        }
        if (it.type === "heading") return <div key={i} className="font-semibold">{it.text}</div>;
        if (it.type === "paragraph") return it.text.trim() ? <p key={i} className="text-muted">{it.text}</p> : null;
        if (it.type === "card")
          return (
            <div key={i} className="text-[12px]">
              <span className="font-semibold">{it.tag}</span> <span className="text-faint">{it.shortCite}</span>
            </div>
          );
        return null;
      })}
    </>
  );
}

export function HistoryDialog({ draftId, open, onOpenChange }: { draftId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ["versions", draftId], queryFn: () => api<{ versions: VersionRow[] }>(`/api/docs/${draftId}/versions`), enabled: open });
  const preview = useQuery({ queryKey: ["version", draftId, selected], queryFn: () => api<{ doc: PMNodeJSON }>(`/api/docs/${draftId}/versions/${selected}`), enabled: open && !!selected });

  async function saveNow() {
    setBusy(true);
    try {
      await api(`/api/docs/${draftId}/versions`, { method: "POST", json: { label: label.trim() || "Saved version" } });
      setLabel("");
      await qc.invalidateQueries({ queryKey: ["versions", draftId] });
      toast("Version saved.", "ok");
    } finally {
      setBusy(false);
    }
  }

  async function restore(v: VersionRow) {
    if (!window.confirm(`Restore “${v.label || REASON[v.reason]?.label || v.reason}”? The current draft is saved as a version first, so you can undo this.`)) return;
    setBusy(true);
    try {
      await api(`/api/docs/${draftId}/versions/${v.id}`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["versions", draftId] });
      toast("Restored. Your partner sees it too; the previous draft was saved in history.", "ok");
      onOpenChange(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Restore failed.", "bad");
    } finally {
      setBusy(false);
    }
  }

  const versions = list.data?.versions ?? [];
  const sel = versions.find((v) => v.id === selected) ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Draft history" description="Saved versions of this speech draft. Restoring never deletes anything." width="max-w-3xl">
      <div className="grid min-h-[360px] gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveNow();
            }}
          >
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this version" aria-label="Version name" className="h-8" />
            <Button size="sm" type="submit" disabled={busy}>
              Save
            </Button>
          </form>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line">
            {list.isLoading ? (
              <div className="flex justify-center p-4">
                <Spinner />
              </div>
            ) : versions.length === 0 ? (
              <p className="p-3 text-[12.5px] text-faint">No saved versions yet. Versions are saved when you mark a speech delivered, before AI changes, and whenever you save one here.</p>
            ) : (
              <ul>
                {versions.map((v) => (
                  <li key={v.id}>
                    <button onClick={() => setSelected(v.id)} className={cn("flex w-full flex-col items-start gap-0.5 border-b border-line px-2.5 py-2 text-left text-[12.5px] hover:bg-hover", selected === v.id && "bg-accent-soft")}>
                      <span className="flex w-full items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate font-medium">{v.label || "Untitled"}</span>
                        <Badge tone={REASON[v.reason]?.tone ?? "neutral"}>{REASON[v.reason]?.label ?? v.reason}</Badge>
                      </span>
                      <span className="text-[11px] text-faint">{new Date(v.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          {!sel ? (
            <EmptyState icon={<History className="size-7" />} title="Pick a version to preview" />
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">{sel.label || "Untitled"}</div>
                <Button size="sm" variant="primary" onClick={() => void restore(sel)} disabled={busy}>
                  <RotateCcw className="size-3.5" /> Restore this version
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line p-3 text-[12.5px] leading-relaxed">
                {preview.isLoading ? <Spinner /> : preview.data ? <Preview items={draftFromPM(preview.data.doc).items} /> : <p className="text-faint">Couldn&apos;t load this version.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
