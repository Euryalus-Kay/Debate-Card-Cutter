"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type * as Y from "yjs";
import { FileText, Upload, ClipboardPaste, AlertTriangle, GitBranchPlus, EyeOff, Eye } from "lucide-react";
import { api } from "@/client/api";
import { useYDocValue } from "@/client/sync/hooks";
import { Badge, Button, cn, Dialog, EmptyState, Field, Select, Spinner, Textarea, Tooltip, toast } from "@/components/ui";
import { CardBodyView } from "@/components/card-view";
import { opposite, SPEECH_IDS, SPEECHES, type SpeechId } from "@/domain/format";
import type { BodyText } from "@/domain/card";
import { readArgs, upsertArg } from "@/shared/round-doc";
import type { RoundBundle, RoundRecord, UploadRecord } from "./types";
import { useWorkspace } from "./store";

interface UploadBlock {
  idx: number;
  kind: "heading" | "card" | "analytic";
  level: number | null;
  text: string;
  data: { cite?: { short: string; rest: string } | null; body?: BodyText[]; issues?: string[]; detail?: string[] } | null;
  path: string[];
}

export function DocsPanel({ round, bundle, aiEnabled }: { round: RoundRecord; bundle: RoundBundle; aiEnabled: boolean }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const bySpeech = new Map<SpeechId, UploadRecord[]>();
  for (const u of bundle.uploads) {
    const s = u.attribution?.speech;
    if (s) bySpeech.set(s, [...(bySpeech.get(s) ?? []), u]);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="text-[13px] font-semibold">Speech documents</div>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => setOpen(true)}>
          <Upload className="size-3.5" /> Add
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {bundle.uploads.length === 0 ? (
          <EmptyState icon={<FileText className="size-7" />} title="No documents yet">
            Upload the opponent&apos;s speech doc (.docx or .pdf) or paste it when it&apos;s shared. It&apos;s recorded as &ldquo;documented,&rdquo; not &ldquo;delivered,&rdquo; until you confirm.
          </EmptyState>
        ) : (
          SPEECH_IDS.filter((s) => bySpeech.has(s)).map((s) => (
            <div key={s} className="mb-3">
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{s}</div>
              {bySpeech.get(s)!.map((u) => (
                <UploadRow key={u.id} u={u} roundId={round.id} onOpen={() => ws.set({ speech: s, center: "speech" })} />
              ))}
            </div>
          ))
        )}
      </div>
      <UploadDialog open={open} onOpenChange={setOpen} round={round} aiEnabled={aiEnabled} />
    </div>
  );
}

function UploadRow({ u, roundId, onOpen }: { u: UploadRecord; roundId: string; onOpen: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = u.parseResult?.quality;
  const warnings = u.parseResult?.warnings ?? [];
  async function addToFlow() {
    setBusy(true);
    try {
      const r = await api<{ positionsCreated: number; argsCreated: number; argsSkipped: number }>(`/api/rounds/${roundId}/uploads/${u.id}/flow`, { method: "POST" });
      toast(`Added ${r.argsCreated} argument${r.argsCreated === 1 ? "" : "s"} (${r.positionsCreated} new position${r.positionsCreated === 1 ? "" : "s"}) as documented, not confirmed.`, "ok");
      await qc.invalidateQueries({ queryKey: ["round", roundId] });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-1 rounded-lg border border-line bg-elev px-2.5 py-2">
      <button onClick={onOpen} className="flex w-full items-center gap-2 text-left">
        <FileText className="size-4 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{u.fileName}</span>
        <Badge tone={u.attribution?.owner === "us" ? "accent" : "neutral"}>{u.attribution?.owner === "us" ? "ours" : "theirs"}</Badge>
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
        {q ? (
          <span>
            {q.cards} cards · {q.analytics} analytics · {q.headings} headings
          </span>
        ) : null}
        {warnings.length ? (
          <Tooltip content={warnings.join("\n")}>
            <span className="flex items-center gap-0.5 text-warn">
              <AlertTriangle className="size-3" /> {warnings.length}
            </span>
          </Tooltip>
        ) : null}
        <span className="ml-auto">
          {u.attribution?.flowedAt ? (
            <Badge tone="ok">on flow</Badge>
          ) : (
            <Button size="xs" onClick={addToFlow} loading={busy}>
              <GitBranchPlus className="size-3" /> Add to flow
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

export function UploadDialog({ open, onOpenChange, round, aiEnabled, defaultSpeech }: { open: boolean; onOpenChange: (o: boolean) => void; round: RoundRecord; aiEnabled: boolean; defaultSpeech?: SpeechId }) {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const [speech, setSpeech] = useState<SpeechId>(defaultSpeech ?? ws.speech ?? "1AC");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; quality: UploadRecord["parseResult"]["quality"]; warnings: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const owner = SPEECHES[speech].side === round.ourSide ? "us" : "opponent";

  async function submit() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("speech", speech);
      form.set("owner", owner);
      if (mode === "file" && file) form.set("file", file);
      else {
        form.set("text", text);
        if (html) form.set("html", html);
      }
      const res = await fetch(`/api/rounds/${round.id}/uploads`, { method: "POST", body: form, credentials: "same-origin" });
      const data = (await res.json()) as { upload?: { id: string; quality: UploadRecord["parseResult"]["quality"]; warnings: string[] }; error?: string };
      if (!res.ok || !data.upload) throw new Error(data.error ?? `Upload failed (${res.status})`);
      setResult(data.upload);
      await qc.invalidateQueries({ queryKey: ["round", round.id] });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }

  async function addToFlow() {
    if (!result) return;
    setBusy(true);
    try {
      await api(`/api/rounds/${round.id}/uploads/${result.id}/flow`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["round", round.id] });
      toast("Added to the flow as documented (not confirmed delivered).", "ok");
      reset();
      onOpenChange(false);
      ws.set({ speech, center: "speech" });
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setText("");
    setHtml("");
    setResult(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Add a speech document"
      description="Documents are recorded as what was shared, not proof of what was read."
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={() => (reset(), onOpenChange(false))}>
              Done
            </Button>
            <Button variant="primary" onClick={addToFlow} loading={busy}>
              <GitBranchPlus className="size-4" /> Add to flow
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={busy} disabled={mode === "file" ? !file : !text.trim()}>
              Upload
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-[13px]">
          <div className="rounded-lg bg-sunken p-3">
            <div className="font-medium">Parsed</div>
            <div className="text-muted">
              {result.quality?.cards ?? 0} cards · {result.quality?.analytics ?? 0} analytics · {result.quality?.headings ?? 0} headings · {Math.round((result.quality?.characters ?? 0) / 1000)}k characters
            </div>
          </div>
          {result.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 rounded-md bg-warn-soft px-2.5 py-2 text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
            </div>
          ))}
          <p className="text-muted">
            &ldquo;Add to flow&rdquo; turns headings into positions and each card or analytic into a flow entry marked <em>documented, not confirmed</em>.{" "}
            {aiEnabled ? "You can then ask AI to interpret roles and link responses." : "Link responses by hand in the Flow tab (AI is off for this round)."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Which speech is this?">
              <Select value={speech} onChange={(e) => setSpeech(e.target.value as SpeechId)}>
                {SPEECH_IDS.map((s) => (
                  <option key={s} value={s}>
                    {s} ({SPEECHES[s].side === round.ourSide ? "ours" : "theirs"})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Belongs to">
              <div className="flex h-9 items-center rounded-lg bg-sunken px-3 text-[13px]">
                {owner === "us" ? "Our team" : `Opponent (${opposite(round.ourSide).toUpperCase()})`}
              </div>
            </Field>
          </div>
          <div className="flex gap-1 rounded-lg bg-sunken p-1">
            {(["file", "paste"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px]", mode === m ? "bg-elev font-medium shadow-sm" : "text-muted")}>
                {m === "file" ? <Upload className="size-3.5" /> : <ClipboardPaste className="size-3.5" />}
                {m === "file" ? "Upload file" : "Paste"}
              </button>
            ))}
          </div>
          {mode === "file" ? (
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line py-8 text-[13px] text-muted hover:bg-hover"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
            >
              <Upload className="size-5" />
              {file ? <span className="font-medium text-fg">{file.name}</span> : <span>Drop a .docx, .pdf, or .txt here, or click to choose</span>}
              <input ref={inputRef} type="file" accept=".docx,.pdf,.txt,.html,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          ) : (
            <Textarea
              rows={10}
              placeholder="Paste from Word or Google Docs — underlining and highlighting are kept."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const h = e.clipboardData.getData("text/html");
                if (h) setHtml(h);
              }}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Read-only view of an uploaded document with per-card "not read" controls. */
export function OpponentDocView({ upload, roundId, doc }: { upload: UploadRecord; roundId: string; doc: Y.Doc | null }) {
  const q = useQuery({ queryKey: ["upload", upload.id], queryFn: () => api<{ blocks: UploadBlock[] }>(`/api/uploads/${upload.id}`), staleTime: Infinity });
  const args = useYDocValue(doc, (d) => readArgs(d).filter((a) => a.provenance.type === "document" && a.provenance.documentId === upload.id)) ?? [];
  const byBlock = useMemo(() => new Map(args.map((a) => [(a.provenance as { blockId?: string }).blockId, a])), [args]);
  if (q.isLoading) return <div className="flex justify-center p-6"><Spinner /></div>;
  if (q.error) return <p className="p-4 text-[13px] text-bad">{(q.error as Error).message}</p>;
  return (
    <div className="border-b border-line px-6 py-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <FileText className="size-3.5" /> {upload.fileName}
        {!upload.attribution?.flowedAt ? <span className="text-warn">· not on the flow yet</span> : null}
      </div>
      <div className="mx-auto max-w-[760px]">
        {q.data!.blocks.map((b) => {
          if (b.kind === "heading")
            return (
              <div key={b.idx} className={cn("font-bold", b.level === 1 ? "mt-4 text-lg" : b.level === 2 ? "mt-4 text-[16px]" : "mt-3 text-[15px]")}>
                {b.text}
              </div>
            );
          const arg = byBlock.get(String(b.idx));
          const notRead = arg?.delivery === "not_read";
          return (
            <div key={b.idx} className={cn("group relative my-2 rounded-md py-1 pl-2 pr-8", notRead && "opacity-45")}>
              {arg && doc ? (
                <Tooltip content={notRead ? "Marked not read — excluded from what you must answer. Click to undo." : "Mark this as not read (it's in the doc but they skipped it)."}>
                  <button
                    className="absolute right-0 top-1 rounded p-1 text-faint opacity-0 hover:bg-hover group-hover:opacity-100"
                    onClick={() => doc.transact(() => upsertArg(doc, { id: arg.id, delivery: notRead ? "documented" : "not_read" }, { byHuman: true }))}
                  >
                    {notRead ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                </Tooltip>
              ) : null}
              <div className="text-[14.5px] font-bold">{b.text}</div>
              {b.kind === "card" ? (
                <>
                  {b.data?.cite ? (
                    <div className="text-[12.5px] text-muted">
                      <strong className="text-fg">{b.data.cite.short}</strong> {b.data.cite.rest}
                    </div>
                  ) : null}
                  {b.data?.body ? <CardBodyView body={b.data.body} className="mt-1" shrink /> : null}
                </>
              ) : b.data?.detail?.length ? (
                <div className="text-[13.5px] text-muted">{b.data.detail.join(" ")}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { type UploadBlock };
