"use client";

/**
 * The team's evidence files (backfiles, camp files) inside a round: browse a
 * file's pockets, hats, and blocks, and insert a whole block (its cards and
 * analytics, in order) into the speech draft.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Plus } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Button, cn, EmptyState, Spinner, toast } from "@/components/ui";
import { citationGaps, fullCite, shortCite, type Citation } from "@/domain/citation";
import type { BodyBlock } from "@/domain/card";
import { cardToPM, type PMNodeJSON } from "@/shared/draft-model";
import { makeId } from "@/shared/editor/schema";
import { cardNode, fetchCards, insertSectionAfterCurrent } from "./proposals";
import { getActiveEditor } from "./editor/active-editor";
import { useWorkspace } from "./store";

interface FileRow {
  id: string;
  fileName: string;
  createdAt: string;
  cards: number;
}

interface Block {
  idx: number;
  kind: "heading" | "card" | "analytic";
  level: number | null;
  text: string;
  data: { citation?: Citation; body?: BodyBlock[] } | null;
}

export function FilesView() {
  const { team } = useApp();
  const files = useQuery({ queryKey: ["library-files", team.id], queryFn: () => api<{ files: FileRow[] }>(`/api/library/uploads?teamId=${team.id}`) });
  const [open, setOpen] = useState<string | null>(null);
  if (files.isLoading)
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  if (!files.data?.files.length)
    return (
      <EmptyState icon={<FileText className="size-7" />} title="No evidence files yet">
        Import your backfiles in Library (Import .docx). Their blocks show up here, ready to insert.
      </EmptyState>
    );
  return (
    <ul className="divide-y divide-line">
      {files.data.files.map((f) => (
        <li key={f.id}>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-hover" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
            {open === f.id ? <ChevronDown className="size-3.5 text-faint" /> : <ChevronRight className="size-3.5 text-faint" />}
            <span className="min-w-0 flex-1 truncate font-medium">{f.fileName.replace(/\.docx$/i, "")}</span>
            <span className="shrink-0 text-[11px] text-faint">{f.cards} cards</span>
          </button>
          {open === f.id ? <FileOutline uploadId={f.id} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Everything under blocks[i] (a heading) until the next heading at the same or a higher level. */
function contentsOf(blocks: Block[], i: number): Block[] {
  const level = blocks[i].level ?? 4;
  const out: Block[] = [];
  for (let k = i + 1; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind === "heading" && (b.level ?? 4) <= level) break;
    out.push(b);
  }
  return out;
}

function FileOutline({ uploadId }: { uploadId: string }) {
  const { team } = useApp();
  const q = useQuery({ queryKey: ["upload", uploadId, "outline"], queryFn: () => api<{ blocks: Block[]; cardIds: Record<string, string | null> }>(`/api/uploads/${uploadId}`) });
  const [busy, setBusy] = useState<number | null>(null);
  if (q.isLoading)
    return (
      <div className="flex justify-center p-3">
        <Spinner />
      </div>
    );
  const blocks = q.data?.blocks ?? [];
  const cardIds = q.data?.cardIds ?? {};
  const headings = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === "heading" && (b.level ?? 4) <= 3);

  async function insert(i: number) {
    const draftId = useWorkspace.getState().draftId;
    const editor = draftId ? getActiveEditor(draftId) : null;
    if (!editor) return toast("Open one of your speech drafts first.", "warn");
    setBusy(i);
    try {
      const items = contentsOf(blocks, i);
      const lib = await fetchCards(team.id, items.map((b) => cardIds[String(b.idx)]).filter((x): x is string => !!x));
      const content: PMNodeJSON[] = [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: blocks[i].text }] }];
      for (const b of items) {
        if (b.kind === "heading" && b.level === 4) {
          // A lone Verbatim tag with no card body is an analytic.
          content.push({ type: "paragraph", content: [{ type: "text", text: b.text }] });
        } else if (b.kind === "heading") {
          content.push({ type: "paragraph", content: [{ type: "text", text: b.text, marks: [{ type: "bold" }] }] });
        } else if (b.kind === "analytic") {
          if (b.text.trim()) content.push({ type: "paragraph", content: [{ type: "text", text: b.text }] });
        } else if (b.kind === "card") {
          const id = cardIds[String(b.idx)];
          const c = id ? lib.get(id) : undefined;
          if (c) content.push(cardNode(c));
          else if (b.data?.body?.length) {
            const citation = b.data.citation ?? { authors: [], provenance: {} };
            content.push(cardToPM({ cardId: null, tag: b.text, shortCite: shortCite(citation), fullCite: fullCite(citation), citeGaps: citationGaps(citation), body: b.data.body, verification: "imported" }));
          }
        }
      }
      insertSectionAfterCurrent(editor, { type: "section", attrs: { id: makeId("sec"), kind: "response", relation: "none", targets: [], origin: "human" }, content });
      toast(`Inserted “${blocks[i].text}”. Link it to what it answers from the section header.`, "ok");
    } finally {
      setBusy(null);
    }
  }

  if (!headings.length) return <p className="px-3 pb-2 text-[12px] text-faint">No headings in this file.</p>;
  return (
    <ul className="pb-2">
      {headings.map(({ b, i }) => {
        const n = contentsOf(blocks, i).filter((x) => x.kind === "card").length;
        return (
          <li key={b.idx} className="group flex items-center gap-2 py-1 pr-2 text-[12.5px]" style={{ paddingLeft: 12 + ((b.level ?? 3) - 1) * 14 }}>
            <span className={cn("min-w-0 flex-1 truncate", (b.level ?? 3) === 3 ? "" : "font-semibold")}>{b.text}</span>
            <span className="shrink-0 text-[11px] text-faint">{n}</span>
            <Button size="xs" variant="ghost" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => void insert(i)} loading={busy === i} aria-label={`Insert block ${b.text}`}>
              <Plus className="size-3" /> Insert
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
