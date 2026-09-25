"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import { ArrowLeft, Highlighter, Underline as UnderlineIcon, Type, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import { api } from "@/client/api";
import { Badge, Button, cn, IconButton, Input, Spinner, Textarea, toast } from "@/components/ui";
import { editorExtensions } from "@/shared/editor/schema";
import { cardToPM, highlightCss, pmCardBody, type PMNodeJSON } from "@/shared/draft-model";
import { fullCite, shortCite, citationGaps, type Citation } from "@/domain/citation";
import { lintCard } from "@/domain/lint";
import { highlightRatio, readAloud, type BodyBlock, type CardIssue } from "@/domain/card";
import { countWords, estimate } from "@/domain/timing";
import { useRateProfile } from "@/client/use-settings";
import { VerificationBadge } from "@/features/rounds/evidence-panel";

interface CardData {
  id: string;
  tag: string;
  citation: Citation;
  body: BodyBlock[];
  verificationStatus: string;
  verification: { status: string; issues: CardIssue[]; checkedAt?: string };
  origin: string;
  commentary: string;
  labels: string[];
  importedFrom: { fileName?: string } | null;
  version: number;
  updatedAt: string;
}

export function CardDetail({ cardId }: { cardId: string }) {
  const qc = useQueryClient();
  const rates = useRateProfile();
  const router = useRouter();
  const q = useQuery({ queryKey: ["card", cardId], queryFn: () => api<{ card: CardData; revisions: { id: string; version: number; reason: string; createdAt: string }[]; source: { id: string; url: string | null; title: string; access: string } | null }>(`/api/cards/${cardId}`) });
  const card = q.data?.card;
  const [tag, setTag] = useState("");
  const [cite, setCite] = useState<Citation | null>(null);
  const [dirty, setDirty] = useState(false);
  // Load the form from each new server version of the card.
  const [loaded, setLoaded] = useState<string | null>(null);
  const cardKey = card ? `${card.id}:${card.version}:${card.updatedAt}` : null;
  if (card && cardKey !== loaded) {
    setLoaded(cardKey);
    setTag(card.tag);
    setCite(card.citation);
    setDirty(false);
  }

  const content = useMemo(() => (card ? ({ type: "doc", content: [cardToPM({ tag: card.tag, shortCite: "", fullCite: "", body: card.body, verification: card.verificationStatus })] } as PMNodeJSON) : null), [card]);
  const editor = useEditor(
    {
      extensions: editorExtensions({ onBlocked: () => toast("Evidence text is verbatim. You can change highlighting and underlining; text edits would break verification.", "warn") }),
      content: content ?? undefined,
      immediatelyRender: false,
      onUpdate: () => setDirty(true),
    },
    [content],
  );

  if (q.isLoading || !card || !cite) return <div className="flex h-full items-center justify-center">{q.error ? <p className="text-bad">{(q.error as Error).message}</p> : <Spinner />}</div>;

  const bodyNow = editor ? pmCardBody(((editor.getJSON() as PMNodeJSON).content ?? [])[0] ?? { type: "card" }) : card.body;
  const issues = lintCard({ tag, body: bodyNow, citation: cite });
  const read = readAloud(bodyNow);
  const est = estimate({ cardWords: countWords(read.text), tagWords: countWords(tag) + 2, analyticWords: 0, cards: 1, transitions: 0 }, rates);

  async function save() {
    try {
      await api(`/api/cards/${cardId}`, { method: "PATCH", json: { tag, citation: cite, body: bodyNow, reason: "edited in library" } });
      toast("Saved. The previous version is kept in the card's history.", "ok");
      await qc.invalidateQueries({ queryKey: ["card", cardId] });
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  const setAuthor = (i: number, field: "name" | "qualifications", value: string) => {
    const authors = [...cite.authors];
    authors[i] = { ...authors[i], [field]: value, ...(field === "qualifications" ? { qualificationsProvenance: "user" as const } : {}) };
    setCite({ ...cite, authors, preferRaw: false, provenance: { ...cite.provenance, authors: "user" } });
    setDirty(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <Link href="/library" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Library
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <VerificationBadge status={card.verificationStatus} />
          <Badge>{card.origin.replace("_", " ")}</Badge>
          {card.importedFrom?.fileName ? <span className="text-xs text-faint">from {card.importedFrom.fileName}</span> : null}
          <span className="ml-auto text-xs text-faint">v{card.version}</span>
        </div>
        <Textarea rows={2} value={tag} onChange={(e) => (setTag(e.target.value), setDirty(true))} className="text-[15px] font-semibold" aria-label="Tag" />
        <div className="mt-3 rounded-xl border border-line bg-elev p-3">
          <div className="text-[13px]">
            <strong>{shortCite(cite)}</strong> <span className="text-muted">{fullCite(cite)}</span>
          </div>
          {citationGaps(cite).length ? <div className="mt-1 text-xs text-warn">Missing or unverified: {citationGaps(cite).join(", ")}</div> : null}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted">Edit citation</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {cite.authors.map((a, i) => (
                <div key={i} className="col-span-2 grid grid-cols-2 gap-2">
                  <Input value={a.name} onChange={(e) => setAuthor(i, "name", e.target.value)} placeholder="Author name" />
                  <Input value={a.qualifications ?? ""} onChange={(e) => setAuthor(i, "qualifications", e.target.value)} placeholder="Qualifications (only if verified)" />
                </div>
              ))}
              <Input value={cite.title ?? ""} onChange={(e) => (setCite({ ...cite, title: e.target.value, preferRaw: false }), setDirty(true))} placeholder="Title" />
              <Input value={cite.publication ?? ""} onChange={(e) => (setCite({ ...cite, publication: e.target.value, preferRaw: false }), setDirty(true))} placeholder="Publication" />
              <Input value={cite.url ?? ""} onChange={(e) => (setCite({ ...cite, url: e.target.value, preferRaw: false }), setDirty(true))} placeholder="URL" />
              <Input value={cite.date?.year ? String(cite.date.year) : ""} onChange={(e) => (setCite({ ...cite, date: { ...cite.date, year: Number(e.target.value) || undefined }, preferRaw: false }), setDirty(true))} placeholder="Year" />
            </div>
          </details>
          {cite.raw && cite.preferRaw === false ? <div className="mt-2 text-[11.5px] text-faint">Original cite: {cite.raw}</div> : null}
        </div>
        <div className="mt-3 flex items-center gap-1 rounded-t-xl border border-b-0 border-line bg-elev px-2 py-1">
          <IconButton label="Underline" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="size-4" />
          </IconButton>
          <IconButton label="Emphasis" onClick={() => editor?.chain().focus().toggleMark("emphasis").run()}>
            <Type className="size-4" />
          </IconButton>
          {(["yellow", "cyan", "green"] as const).map((c) => (
            <button key={c} className="flex size-7 items-center justify-center rounded-md hover:bg-hover" onClick={() => editor?.chain().focus().toggleHighlight({ color: highlightCss(c) }).run()} aria-label={`Highlight ${c}`}>
              <span className="flex size-4 items-center justify-center rounded-sm" style={{ background: highlightCss(c) }}>
                <Highlighter className="size-3 text-black/70" />
              </span>
            </button>
          ))}
          <span className="ml-auto text-xs text-faint">
            ~{Math.round(est.seconds)}s to read · {Math.round(highlightRatio(bodyNow) * 100)}% highlighted
          </span>
        </div>
        <div className="speech-editor card-detail-editor rounded-b-xl border border-line bg-elev">
          <EditorContent editor={editor} />
        </div>
        {issues.length ? (
          <div className="mt-3 space-y-1">
            {issues.map((i, k) => (
              <div key={k} className={cn("flex gap-2 rounded-md px-2 py-1.5 text-xs", i.severity === "error" ? "bg-bad-soft text-bad" : i.severity === "warning" ? "bg-warn-soft text-warn" : "bg-sunken text-muted")}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {i.message}
              </div>
            ))}
          </div>
        ) : null}
        {q.data?.source ? (
          <div className="mt-3 text-xs text-muted">
            Source snapshot: {q.data.source.title}{" "}
            {q.data.source.url ? (
              <a href={q.data.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-text hover:underline">
                open <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={!dirty}>
            Save
          </Button>
          <Button
            variant="ghost"
            className="ml-auto text-bad"
            onClick={async () => {
              if (!window.confirm("Move this card to the trash? (It can be recovered.)")) return;
              await api(`/api/cards/${cardId}`, { method: "DELETE" });
              router.push("/library");
            }}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
        {q.data?.revisions.length ? (
          <div className="mt-6">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">History</div>
            {q.data.revisions.map((r) => (
              <div key={r.id} className="text-xs text-muted">
                v{r.version} · {r.reason} · {new Date(r.createdAt).toLocaleString()}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
