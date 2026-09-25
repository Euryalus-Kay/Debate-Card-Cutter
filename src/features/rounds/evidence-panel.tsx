"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Check, ChevronDown, ChevronRight, Library, FlaskConical } from "lucide-react";
import { api } from "@/client/api";
import { Badge, Button, cn, EmptyState, Input, Spinner, Tooltip, toast } from "@/components/ui";
import { useApp } from "@/components/shell/app-shell";
import { CardBodyView } from "@/components/card-view";
import type { BodyBlock } from "@/domain/card";
import type { Citation } from "@/domain/citation";
import { fullCite } from "@/domain/citation";
import { useWorkspace } from "./store";
import { cardNode, fetchCards } from "./proposals";
import { getActiveEditor } from "./editor/active-editor";
import { RoundResearchList, useRoundResearch } from "./round-research";
import { FilesView } from "./files-view";
import type { RoundRecord } from "./types";

interface Hit {
  id: string;
  tag: string;
  shortCite: string;
  verificationStatus: string;
  origin: string;
  snippet: string;
  labels: string[];
}

export function VerificationBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "ok" | "neutral" | "warn" | "bad"; label: string; hint: string }> = {
    verified: { tone: "ok", label: "Verified", hint: "Every word matched the stored source text." },
    verified_quote_only: { tone: "ok", label: "Quote verified", hint: "Text matched the source; some citation fields are incomplete." },
    imported: { tone: "neutral", label: "Imported", hint: "From your files; not independently checked against the original." },
    unverified: { tone: "warn", label: "Unverified", hint: "Not checked against an original source." },
    mismatch: { tone: "bad", label: "Mismatch", hint: "Did not match the source text when checked." },
  };
  const m = map[status] ?? map.unverified;
  return (
    <Tooltip content={m.hint}>
      <span>
        <Badge tone={m.tone}>{m.label}</Badge>
      </span>
    </Tooltip>
  );
}

export function EvidencePanel({ round, aiEnabled }: { round: RoundRecord; aiEnabled: boolean }) {
  const { team } = useApp();
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"cards" | "files">("cards");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 220);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({ queryKey: ["cards", team.id, debounced], queryFn: () => api<{ cards: Hit[] }>(`/api/cards?teamId=${team.id}&q=${encodeURIComponent(debounced)}&limit=40`) });

  async function insert(id: string) {
    const editor = ws.draftId ? getActiveEditor(ws.draftId) : null;
    if (!editor) return toast("Open one of your speech drafts first.", "warn");
    const cards = await fetchCards(team.id, [id]);
    const c = cards.get(id);
    if (!c) return;
    editor.chain().focus().insertContent(cardNode(c)).run();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RoundResearchList roundId={round.id} />
      <div className="border-b border-line p-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your cards (tag, author, text)…" className="pl-8" aria-label="Search cards" />
          </div>
          {aiEnabled ? (
          <Tooltip content="Cut new cards from the web on this">
            <Button
              aria-label="Cut new cards from the web"
              onClick={() => useRoundResearch.getState().open({ sectionId: null, draftId: ws.draftId, claim: q, context: `${round.ourSide === "aff" ? "Aff" : "Neg"} ${ws.speech ?? ""}`.trim() })}
            >
              <FlaskConical className="size-3.5" /> New
            </Button>
          </Tooltip>
          ) : null}
        </div>
        {ws.basket.length ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Badge tone="accent">{ws.basket.length} selected</Badge>
            <span className="text-muted">for the next AI draft</span>
            <button className="ml-auto text-faint hover:text-fg" onClick={() => ws.set({ basket: [] })}>
              clear
            </button>
          </div>
        ) : null}
      </div>
      <div role="tablist" aria-label="Evidence view" className="flex gap-1 border-b border-line px-2 py-1.5 text-[12px]">
        {(
          [
            ["cards", "Cards"],
            ["files", "Files & blocks"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-md px-2 py-1 font-medium", view === v ? "bg-hover text-fg" : "text-muted hover:text-fg")}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "files" ? (
          <FilesView />
        ) : res.isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : !res.data?.cards.length ? (
          <EmptyState icon={<Library className="size-7" />} title={debounced ? "No matching cards" : "Your library is empty"}>
            {debounced ? "Try an author name or a phrase from the card." : "Import your evidence files in Library, or cut new cards in Research."}
          </EmptyState>
        ) : (
          res.data.cards.map((c) => <HitRow key={c.id} hit={c} onInsert={() => insert(c.id)} />)
        )}
      </div>
    </div>
  );
}

function HitRow({ hit, onInsert }: { hit: Hit; onInsert: () => void }) {
  const ws = useWorkspace();
  const { team } = useApp();
  const [open, setOpen] = useState(false);
  const selected = ws.basket.includes(hit.id);
  const detail = useQuery({
    queryKey: ["card-batch", hit.id],
    enabled: open,
    queryFn: async () => (await api<{ cards: { id: string; body: BodyBlock[]; citation: Citation }[] }>(`/api/cards/batch?teamId=${team.id}&ids=${hit.id}`)).cards[0],
  });
  return (
    <div className={cn("border-b border-line px-3 py-2", selected && "bg-accent-soft/40")}>
      <div className="flex items-start gap-1.5">
        <button onClick={() => setOpen((o) => !o)} className="mt-0.5 text-faint" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-snug">{hit.tag}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
            <span className="font-semibold">{hit.shortCite}</span>
            <VerificationBadge status={hit.verificationStatus} />
          </div>
          {!open && hit.snippet ? <div className="mt-1 line-clamp-2 text-[12px] text-muted" dangerouslySetInnerHTML={{ __html: escapeHighlights(hit.snippet) }} /> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Tooltip content={selected ? "Remove from selection" : "Select for the next AI draft"}>
            <Button size="xs" variant={selected ? "primary" : "secondary"} onClick={() => ws.toggleBasket(hit.id)} aria-label="Select card">
              {selected ? <Check className="size-3" /> : "Select"}
            </Button>
          </Tooltip>
          <Tooltip content="Insert at the cursor in the open draft">
            <Button size="xs" onClick={onInsert} aria-label="Insert card">
              <Plus className="size-3" /> Insert
            </Button>
          </Tooltip>
        </div>
      </div>
      {open ? (
        <div className="mt-2 pl-5">
          {detail.data ? (
            <>
              <div className="mb-1 text-[11.5px] text-muted">{fullCite(detail.data.citation)}</div>
              <CardBodyView body={detail.data.body} shrink />
            </>
          ) : (
            <Spinner />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** ts_headline marks matches with « »; render them as <mark> without allowing any HTML from the text. */
function escapeHighlights(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/«/g, '<mark class="bg-accent-soft rounded px-0.5">').replace(/»/g, "</mark>");
}
