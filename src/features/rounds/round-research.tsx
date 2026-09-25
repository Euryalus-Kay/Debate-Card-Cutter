"use client";

/**
 * Research from inside a round: cut a new card for a section (from its
 * "Needs evidence" note) or for an evidence search, then insert it where it
 * belongs. Runs as a normal research job, so it survives reloads.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import { FlaskConical, X } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, Dialog, Field, Input, Select, Spinner, Textarea, toast } from "@/components/ui";
import { shortCite, type Citation } from "@/domain/citation";
import type { BodyBlock } from "@/domain/card";
import { readAloud } from "@/domain/card";
import { VerificationBadge } from "./evidence-panel";
import { cardNode, fetchCards, findSectionNode } from "./proposals";
import { getActiveEditor } from "./editor/active-editor";
import { useWorkspace } from "./store";
import type { RoundRecord } from "./types";

interface RoundJob {
  jobId: string;
  roundId: string;
  draftId: string | null;
  sectionId: string | null;
  claim: string;
  startedAt: number;
}

interface DialogState {
  /** distinguishes each opening so the form starts fresh */
  openedAt?: number;
  sectionId: string | null;
  draftId: string | null;
  claim: string;
  context: string;
}

interface RoundResearchState {
  jobs: RoundJob[];
  dialog: DialogState | null;
  add: (j: RoundJob) => void;
  remove: (jobId: string) => void;
  open: (d: DialogState) => void;
  close: () => void;
}

const KEY = "clash-round-research";

function load(): RoundJob[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as RoundJob[];
  } catch {
    return [];
  }
}

function save(jobs: RoundJob[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 20)));
  } catch {
    /* storage unavailable */
  }
}

export const useRoundResearch = create<RoundResearchState>((set, get) => ({
  jobs: typeof window === "undefined" ? [] : load(),
  dialog: null,
  add: (j) => {
    const jobs = [j, ...get().jobs.filter((x) => x.jobId !== j.jobId)];
    save(jobs);
    set({ jobs });
  },
  remove: (jobId) => {
    const jobs = get().jobs.filter((x) => x.jobId !== jobId);
    save(jobs);
    set({ jobs });
  },
  open: (dialog) => set({ dialog: { ...dialog, openedAt: Date.now() } }),
  close: () => set({ dialog: null }),
}));

/** What the section needs: its "Needs evidence" note, else its heading and first line. */
export function claimForSection(editor: Editor, sectionId: string): string {
  const found = findSectionNode(editor, sectionId);
  if (!found) return "";
  let note = "";
  let heading = "";
  let para = "";
  found.node.forEach((child) => {
    const t = child.textContent.trim();
    if (child.type.name === "note" && /^needs evidence:/i.test(t) && !note) note = t.replace(/^needs evidence:\s*/i, "");
    if (child.type.name === "heading" && !heading) heading = t;
    if (child.type.name === "paragraph" && !para && t) para = t;
  });
  return (note || [heading, para].filter(Boolean).join(": ")).slice(0, 400);
}

export type InsertResult = "replaced_note" | "inserted" | "locked" | "missing";

/** Put a card in a section: in place of its "Needs evidence" note, else after its own content. */
export function insertCardIntoSection(editor: Editor, sectionId: string, node: ReturnType<typeof cardNode>): InsertResult {
  const found = findSectionNode(editor, sectionId);
  if (!found) return "missing";
  if (found.node.attrs.locked) return "locked";
  const pm = editor.schema.nodeFromJSON(node);
  let notePos: { from: number; to: number } | null = null;
  let insertAt = found.pos + found.node.nodeSize - 1; // end of section content
  let offset = found.pos + 1;
  let sawNested = false;
  found.node.forEach((child) => {
    if (!notePos && child.type.name === "note" && /^needs evidence:/i.test(child.textContent.trim())) notePos = { from: offset, to: offset + child.nodeSize };
    if (child.type.name === "section" && !sawNested) {
      sawNested = true;
      insertAt = offset;
    }
    offset += child.nodeSize;
  });
  const tr = editor.state.tr;
  if (notePos) {
    const { from, to } = notePos as { from: number; to: number };
    tr.replaceWith(from, to, pm);
  } else tr.insert(insertAt, pm);
  editor.view.dispatch(tr);
  return notePos ? "replaced_note" : "inserted";
}

export function ResearchDialog({ round }: { round: RoundRecord }) {
  const dialog = useRoundResearch((s) => s.dialog);
  const close = useRoundResearch((s) => s.close);
  return (
    <Dialog open={!!dialog} onOpenChange={(o) => !o && close()} title="Cut a new card" description="Searches the web (or reads the pages you give), then cuts cards checked word-for-word against the source. Usually 30–60 seconds.">
      {dialog ? <ResearchForm key={dialog.openedAt} round={round} dialog={dialog} /> : null}
    </Dialog>
  );
}

function ResearchForm({ round, dialog }: { round: RoundRecord; dialog: DialogState }) {
  const { team } = useApp();
  const close = useRoundResearch((s) => s.close);
  const add = useRoundResearch((s) => s.add);
  const [claim, setClaim] = useState(dialog.claim);
  const [context, setContext] = useState(dialog.context);
  const [urls, setUrls] = useState("");
  const [n, setN] = useState(dialog.sectionId ? 1 : 2);
  const [busy, setBusy] = useState(false);
  // Library first (B4): a card the team already has costs nothing and is ready now.
  const [asked, setAsked] = useState(dialog.claim.trim());
  const lib = useQuery({
    queryKey: ["library-find", round.id, asked],
    queryFn: () => api<{ cards: LibraryHit[]; checked: boolean }>("/api/library/find", { method: "POST", json: { roundId: round.id, claim: asked, context: dialog.context || undefined } }),
    enabled: asked.length >= 3,
    staleTime: 60_000,
    retry: false,
  });
  const [used, setUsed] = useState<Set<string>>(new Set());

  async function insertLibraryCard(cardId: string) {
    const draftId = dialog.draftId ?? useWorkspace.getState().draftId;
    const editor = draftId ? getActiveEditor(draftId) : null;
    if (!editor) return toast("Open the speech draft to insert the card.", "warn");
    const c = (await fetchCards(team.id, [cardId])).get(cardId);
    if (!c) return;
    const node = cardNode(c);
    if (dialog.sectionId) {
      const r = insertCardIntoSection(editor, dialog.sectionId, node);
      if (r === "locked") return toast("That section is locked. Unlock it first.", "warn");
      if (r === "missing") return toast("That section no longer exists.", "warn");
      toast(r === "replaced_note" ? "Card placed where the section needed evidence." : "Card added to the section.", "ok");
    } else editor.chain().focus().insertContent(node).run();
    setUsed((s) => new Set(s).add(cardId));
  }

  async function submit() {
    if (claim.trim().length < 3) return toast("Describe what the card should say.", "warn");
    const list = urls.split(/\s+/).filter((u) => /^https?:\/\//.test(u));
    setBusy(true);
    try {
      const r = await api<{ jobId: string }>(`/api/research/jobs`, {
        method: "POST",
        json: { teamId: team.id, idempotencyKey: crypto.randomUUID(), input: { claim: claim.trim(), context: context.trim() || undefined, maxCards: n, search: list.length === 0, urls: list.length ? list : undefined, roundId: round.id } },
      });
      add({ jobId: r.jobId, roundId: round.id, draftId: dialog.draftId, sectionId: dialog.sectionId, claim: claim.trim(), startedAt: Date.now() });
      useWorkspace.getState().set({ right: "evidence" });
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start research.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
      <div className="space-y-3">
        {lib.isFetching ? (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Spinner className="size-3.5" /> Checking your library first…
          </div>
        ) : lib.data?.cards.length ? (
          <div className="rounded-lg border border-line bg-sunken p-2">
            <div className="mb-1.5 text-[12px] font-medium">Already in your library</div>
            <ul className="space-y-1.5">
              {lib.data.cards.map((c) => (
                <li key={c.id} className="text-[12.5px]">
                  <div className="flex items-start gap-1.5">
                    <span className="min-w-0 flex-1 font-semibold leading-snug">{c.tag}</span>
                    <VerificationBadge status={c.verificationStatus} />
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {c.shortCite} · {c.fit >= 3 ? "proves it" : "helps"}: {c.use}
                  </div>
                  <Button size="xs" className="mt-1" variant={used.has(c.id) ? "ghost" : "primary"} onClick={() => void insertLibraryCard(c.id)} disabled={used.has(c.id)}>
                    {used.has(c.id) ? "Inserted" : dialog.sectionId ? "Use this card" : "Insert at cursor"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : lib.data?.checked ? (
          <div className="text-[12px] text-muted">Nothing in your library proves this yet, so cut a new card.</div>
        ) : null}
        <Field label="The card should say">
          <Textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={3} aria-label="Claim" />
        </Field>
        <Field label="Context" hint="Helps pick the passage that answers their argument.">
          <Input value={context} onChange={(e) => setContext(e.target.value)} aria-label="Context" />
        </Field>
        <Field label="Specific pages (optional)" hint="Paste URLs to read instead of searching.">
          <Textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={2} placeholder="https://…" aria-label="URLs" />
        </Field>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            Cards
            <Select value={n} onChange={(e) => setN(Number(e.target.value))} className="h-8 w-16" aria-label="Number of cards">
              {[1, 2, 3].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </label>
          {claim.trim() !== asked && claim.trim().length >= 3 ? (
            <Button variant="ghost" className="ml-auto" onClick={() => setAsked(claim.trim())}>
              Check the library again
            </Button>
          ) : null}
          <Button variant="primary" className={claim.trim() !== asked && claim.trim().length >= 3 ? "" : "ml-auto"} onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : <FlaskConical className="size-4" />} Cut a new card
          </Button>
        </div>
      </div>
  );
}

interface LibraryHit {
  id: string;
  tag: string;
  shortCite: string;
  verificationStatus: string;
  fit: number;
  use: string;
}

interface JobPoll {
  job: { id: string; status: string; input: { maxCards: number }; checkpoint: { stage: string; items: { status: string; cardId?: string; title?: string; error?: string }[]; cardsMade: number }; result: { summary: string } | null };
  cards: { id: string; tag: string; citation: Citation; body: BodyBlock[]; verificationStatus: string; importedFrom: { support?: { level: string } } | null }[];
}

export function RoundResearchList({ roundId }: { roundId: string }) {
  const jobs = useRoundResearch((s) => s.jobs).filter((j) => j.roundId === roundId);
  if (!jobs.length) return null;
  return (
    <div className="space-y-2 border-b border-line p-2">
      {jobs.map((j) => (
        <RoundJobRow key={j.jobId} job={j} />
      ))}
    </div>
  );
}

function RoundJobRow({ job }: { job: RoundJob }) {
  const { team } = useApp();
  const remove = useRoundResearch((s) => s.remove);
  const q = useQuery({
    queryKey: ["research-job", job.jobId],
    queryFn: () => api<JobPoll>(`/api/research/jobs/${job.jobId}`),
    refetchInterval: (query) => (query.state.data && !["queued", "running"].includes(query.state.data.job.status) ? false : 1500),
  });
  const [inserted, setInserted] = useState<Set<string>>(new Set());
  const d = q.data;
  const running = !d || ["queued", "running"].includes(d.job.status);
  const read = d?.job.checkpoint.items.filter((i) => !["pending", "fetching", "skipped"].includes(i.status)).length ?? 0;

  async function insert(cardId: string, where: "section" | "cursor") {
    const draftId = job.draftId ?? useWorkspace.getState().draftId;
    const editor = draftId ? getActiveEditor(draftId) : null;
    if (!editor) return toast("Open the speech draft to insert the card.", "warn");
    const c = (await fetchCards(team.id, [cardId])).get(cardId);
    if (!c) return;
    const node = cardNode(c);
    if (where === "section" && job.sectionId) {
      const r = insertCardIntoSection(editor, job.sectionId, node);
      if (r === "locked") return toast("That section is locked. Unlock it or insert at the cursor.", "warn");
      if (r === "missing") return toast("That section no longer exists. Insert at the cursor instead.", "warn");
      toast(r === "replaced_note" ? "Card placed where the section needed evidence." : "Card added to the section.", "ok");
    } else {
      editor.chain().focus().insertContent(node).run();
    }
    setInserted((s) => new Set(s).add(cardId));
  }

  return (
    <div className="rounded-lg border border-line bg-elev p-2 text-[12.5px]">
      <div className="flex items-start gap-2">
        {running ? <Spinner className="mt-0.5 size-3.5" /> : <FlaskConical className="mt-0.5 size-3.5 text-faint" />}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-medium">{job.claim}</div>
          <div className="text-muted">
            {running
              ? d?.job.checkpoint.stage === "discover" || !d
                ? "Searching for sources…"
                : `Read ${read} source${read === 1 ? "" : "s"} · ${d.job.checkpoint.cardsMade}/${d.job.input.maxCards} cards`
              : d?.job.result?.summary ?? d?.job.status}
          </div>
        </div>
        <button onClick={() => remove(job.jobId)} className="rounded p-0.5 text-faint hover:bg-hover hover:text-fg" aria-label="Dismiss research">
          <X className="size-3.5" />
        </button>
      </div>
      {d?.cards.length ? (
        <ul className="mt-2 space-y-1.5">
          {d.cards.map((c) => (
            <li key={c.id} className="rounded-md bg-sunken p-2">
              <div className="flex items-start gap-1.5">
                <span className="min-w-0 flex-1 font-semibold leading-snug">{c.tag}</span>
                <VerificationBadge status={c.verificationStatus} />
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                {shortCite(c.citation)} · {readAloud(c.body).text.split(/\s+/).length} words read
                {c.importedFrom?.support ? ` · support: ${c.importedFrom.support.level}` : ""}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {job.sectionId ? (
                  <Button size="xs" variant={inserted.has(c.id) ? "ghost" : "primary"} onClick={() => insert(c.id, "section")}>
                    {inserted.has(c.id) ? "Inserted" : "Insert into section"}
                  </Button>
                ) : null}
                <Button size="xs" onClick={() => insert(c.id, "cursor")}>
                  Insert at cursor
                </Button>
                <a href={`/library/cards/${c.id}`} target="_blank" rel="noreferrer" className="ml-auto self-center text-[11.5px] text-accent hover:underline">
                  Full card
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!running && d && d.job.checkpoint.items.some((i) => i.status === "fetch_failed") ? (
        <div className="mt-1.5 text-[11.5px] text-faint">
          <Badge tone="neutral">{d.job.checkpoint.items.filter((i) => i.status === "fetch_failed").length} unavailable</Badge> Some sites blocked automated reading; open the job on the Research page for details.
        </div>
      ) : null}
    </div>
  );
}
