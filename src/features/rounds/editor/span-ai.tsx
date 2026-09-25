"use client";

/**
 * Precise AI edits and comments on selected words (A7).
 *
 * Select words in your own text (never card text) and a small menu offers
 * "Ask AI" (sharpen, shorten, add the warrant, answer their argument, plain
 * English, fix grammar, or your own instruction) and "Comment". An AI edit
 * comes back as a suggestion right under the words, showing exactly what
 * changes; nothing changes until you accept it. The words are anchored in the
 * shared document, so the suggestion stays on them while your partner edits
 * elsewhere, and it refuses to apply over words someone changed meanwhile.
 */

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { create } from "zustand";
import { AlertTriangle, Check, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { runOp } from "@/client/ai";
import { flushDoc } from "@/client/sync/hooks";
import { Button, cn, Textarea, toast } from "@/components/ui";
import { makeId } from "@/shared/editor/schema";
import { mentionsAi, putReply, putThread } from "@/shared/comments";
import { useWorkspace } from "../store";
import { activityEnd, activityOp, activityStart } from "../ai-activity";
import { anchorRange, rangeText, resolveRange, sectionAt, squash, touchesCard, type SpanAnchor } from "./anchors";
import { replaceAnchored, WordDiff, type SpanEnv } from "./span-common";
import { setAnchoredMarks } from "./anchored-marks";
import { askAiInThread } from "../comments";

export type SpanAction = "sharpen" | "shorten" | "warrant" | "answer" | "lay" | "grammar" | "custom";

const ACTIONS: { id: SpanAction; label: string; hint: string }[] = [
  { id: "sharpen", label: "Sharpen", hint: "Hit their warrant harder, same length" },
  { id: "shorten", label: "Shorten", hint: "Same point in about half the words" },
  { id: "warrant", label: "Add the warrant", hint: "Add the “because” and why it matters" },
  { id: "answer", label: "Answer their argument", hint: "Engage the argument this section answers" },
  { id: "lay", label: "Plain English", hint: "For a lay judge: no jargon" },
  { id: "grammar", label: "Fix grammar", hint: "Wording only; same argument" },
];


interface SpanJob {
  id: string;
  draftId: string;
  anchor: SpanAnchor;
  base: string;
  label: string;
  status: "running" | "ready" | "failed";
  replacement?: string;
  note?: string;
  warnings?: string[];
  error?: string;
  /** the words changed since the request */
  stale?: boolean;
  startedAt: number;
}

const useSpanJobs = create<{ jobs: SpanJob[]; set: (id: string, patch: Partial<SpanJob> | null) => void; add: (j: SpanJob) => void }>((set) => ({
  jobs: [],
  add: (j) => set((s) => ({ jobs: [...s.jobs, j] })),
  set: (id, patch) => set((s) => ({ jobs: patch ? s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) : s.jobs.filter((j) => j.id !== id) })),
}));

/** The selection if it can be edited by the AI: your own words, in one paragraph or heading, not locked. */
function editableSelection(editor: Editor): { from: number; to: number; text: string; sectionId: string | null; problem?: string } | null {
  const { from, to, $from, $to, empty } = editor.state.selection;
  if (empty) return null;
  const text = rangeText(editor, from, to);
  if (!squash(text)) return null;
  const section = sectionAt(editor, from);
  if (touchesCard(editor, from, to)) return { from, to, text, sectionId: section?.id ?? null, problem: "Card text is verbatim from its source. Select your own words (tags and analytics) instead." };
  if ($from.parent !== $to.parent) return { from, to, text, sectionId: section?.id ?? null, problem: "Select words within one paragraph. For a whole section, use its ✦ menu." };
  if (section?.locked) return { from, to, text, sectionId: section.id, problem: "That section is locked. Unlock it to edit." };
  return { from, to, text, sectionId: section?.id ?? null };
}

async function askAi(editor: Editor, env: SpanEnv, action: SpanAction, instructions: string) {
  const sel = editableSelection(editor);
  if (!sel) return;
  if (sel.problem) return toast(sel.problem, "warn");
  const anchor = anchorRange(editor, sel.from, sel.to);
  if (!anchor) return toast("Open the draft to use this.", "warn");
  const id = makeId("span");
  const label = action === "custom" ? instructions.slice(0, 40) || "Your instruction" : ACTIONS.find((a) => a.id === action)!.label;
  useSpanJobs.getState().add({ id, draftId: env.draftId, anchor, base: sel.text, label, status: "running", startedAt: Date.now() });
  activityStart({ id, kind: "span", label: `${label.toLowerCase()} a few words of the ${env.speech}`, speech: env.speech, draftId: env.draftId });
  const doc = editor.state.doc;
  const before = doc.textBetween(Math.max(0, sel.from - 600), sel.from, "\n", " ");
  const after = doc.textBetween(sel.to, Math.min(doc.content.size, sel.to + 600), "\n", " ");
  editor.commands.setTextSelection(sel.to);
  try {
    await flushDoc(env.draftId);
    const r = (await runOp({ kind: "edit_span", roundId: env.roundId, speech: env.speech, draftId: env.draftId, sectionId: sel.sectionId ?? undefined, spanAction: action, text: sel.text, before, after, instructions, mode: "fast" }, (e) => {
      if (e.t === "op") activityOp(id, e.id);
    })) as { replacement: string; note: string; warnings: string[] };
    useSpanJobs.getState().set(id, { status: "ready", replacement: r.replacement, note: r.note, warnings: r.warnings });
    activityEnd(id, "ready");
  } catch (e) {
    useSpanJobs.getState().set(id, { status: "failed", error: (e as Error).message });
    activityEnd(id, "failed");
  }
}

function SuggestionCard({ job, editor }: { job: SpanJob; editor: Editor }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (job.status !== "running") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - job.startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [job.status, job.startedAt]);
  const drop = () => useSpanJobs.getState().set(job.id, null);
  function accept(force = false) {
    const r = replaceAnchored(editor, job.anchor, job.base, job.replacement ?? "", force);
    if (r === "applied") return drop();
    if (r === "stale") return useSpanJobs.getState().set(job.id, { stale: true });
    toast(r === "missing" ? "Those words were deleted." : "Those words are locked now.", "warn");
    drop();
  }
  return (
    <div className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-elev p-2.5 shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
        <Sparkles className="size-3.5 text-accent" /> {job.label}
        <button className="ml-auto rounded p-0.5 text-faint hover:bg-hover" onClick={drop} aria-label="Discard suggestion">
          <X className="size-3.5" />
        </button>
      </div>
      {job.status === "running" ? <p className="animate-pulse-soft text-[12px] text-muted">Writing… {elapsed}s</p> : null}
      {job.status === "failed" ? <p className="text-[12px] text-bad">{job.error}</p> : null}
      {job.status === "ready" && job.replacement !== undefined ? (
        <>
          <WordDiff from={job.base} to={job.replacement} />
          {job.note ? <p className="mt-1 text-[11.5px] text-muted">{job.note}</p> : null}
          {job.warnings?.map((w) => (
            <p key={w} className="mt-1 flex gap-1 text-[11.5px] text-warn">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
            </p>
          ))}
          {job.stale ? <p className="mt-1 text-[11.5px] text-warn">These words changed after you asked (you or your partner edited them).</p> : null}
          <div className="mt-2 flex gap-1.5">
            <Button size="xs" variant="primary" onClick={() => accept(!!job.stale)}>
              <Check className="size-3" /> {job.stale ? "Replace anyway" : "Accept"}
            </Button>
            <Button size="xs" variant="ghost" onClick={drop}>
              Discard
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Suggestions float under their words; the words are tinted while a suggestion is open. */
export function SpanSuggestions({ editor, draftId }: { editor: Editor | null; draftId: string }) {
  const all = useSpanJobs((s) => s.jobs);
  const jobs = useMemo(() => all.filter((j) => j.draftId === draftId), [all, draftId]);
  // Re-render on every change of the document (a number: the hook deep-compares what the selector returns).
  useEditorState({ editor, selector: (c) => c.transactionNumber });
  const marksKey = jobs.map((j) => `${j.id}:${j.status}`).join(",");
  useEffect(() => {
    setAnchoredMarks(editor, "span-ai", jobs.map((j) => ({ key: j.id, anchor: j.anchor, className: j.status === "running" ? "anchored-ai-running" : "anchored-ai" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, marksKey]);
  if (!editor || !jobs.length) return null;
  // Cards are positioned in the editor's relative content box (EditorContent's parent).
  const host = editor.view.dom.parentElement?.parentElement?.getBoundingClientRect();
  return (
    <>
      {jobs.map((j) => {
        const r = resolveRange(editor, j.anchor);
        if (!r || !host) return null;
        let top = 0;
        let left = 0;
        try {
          const end = editor.view.coordsAtPos(r.to);
          const start = editor.view.coordsAtPos(r.from);
          top = end.bottom - host.top + 6;
          left = Math.max(0, Math.min(start.left - host.left, host.width - 420));
        } catch {
          return null;
        }
        return (
          <div key={j.id} className="absolute z-20" style={{ top, left }}>
            <SuggestionCard job={j} editor={editor} />
          </div>
        );
      })}
    </>
  );
}

/** The menu over selected words: Ask AI (with actions) and Comment. */
export function SelectionMenu({ editor, env }: { editor: Editor | null; env: SpanEnv }) {
  const [mode, setMode] = useState<"buttons" | "ai" | "custom" | "comment">("buttons");
  const [text, setText] = useState("");
  const selKey = useEditorState({ editor, selector: (c) => (c.editor ? `${c.editor.state.selection.from}:${c.editor.state.selection.to}` : "") });
  const [lastKey, setLastKey] = useState(selKey);
  if (selKey !== lastKey) {
    // A new selection starts at the buttons again.
    setLastKey(selKey);
    setMode("buttons");
    setText("");
  }
  if (!editor) return null;

  function comment() {
    if (!editor || !env.draftDoc || !text.trim()) return;
    const sel = editableSelection(editor);
    if (!sel) return;
    const anchor = anchorRange(editor, sel.from, sel.to);
    if (!anchor) return;
    const threadId = makeId("thr");
    const now = Date.now();
    const doc = env.draftDoc;
    doc.transact(() => {
      putThread(doc, { id: threadId, start: anchor.start, end: anchor.end, quote: sel.text, sectionId: sel.sectionId, by: env.userId, byName: env.userName, at: now, resolved: false });
      putReply(doc, { id: makeId("rep"), threadId, by: env.userId, byName: env.userName, at: now, text: text.trim() });
    });
    editor.commands.setTextSelection(sel.to);
    useWorkspace.getState().set({ right: "comments" });
    if (mentionsAi(text) && env.aiEnabled) void askAiInThread(editor, env, threadId);
    setText("");
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => ed.isEditable && from !== to && !!squash(ed.state.doc.textBetween(from, to, " ", " ")) && !touchesCard(ed as Editor, from, to)}
      options={{ placement: "top-start", offset: 8 }}
      className="z-30"
    >
      <div className="rounded-lg border border-line bg-elev p-1 shadow-lg" onMouseDown={(e) => mode === "buttons" && e.preventDefault()}>
        {mode === "buttons" ? (
          <div className="flex items-center gap-0.5">
            {env.aiEnabled ? (
              <button className="flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium hover:bg-hover" onClick={() => setMode("ai")}>
                <Sparkles className="size-3.5 text-accent" /> Ask AI
              </button>
            ) : null}
            <button className="flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium hover:bg-hover" onClick={() => setMode("comment")}>
              <MessageSquarePlus className="size-3.5" /> Comment
            </button>
          </div>
        ) : mode === "ai" ? (
          <div className="w-64 py-0.5">
            {ACTIONS.map((a) => (
              <button key={a.id} className="block w-full rounded-md px-2 py-1 text-left hover:bg-hover" onClick={() => void askAi(editor, env, a.id, "")}>
                <span className="text-[12.5px] font-medium">{a.label}</span>
                <span className="block text-[11px] text-muted">{a.hint}</span>
              </button>
            ))}
            <button className="block w-full rounded-md px-2 py-1 text-left text-[12.5px] font-medium hover:bg-hover" onClick={() => setMode("custom")}>
              Something else…
            </button>
          </div>
        ) : (
          <div className="w-72 space-y-1.5 p-1">
            <Textarea
              autoFocus
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "custom" ? "e.g. “make it a link turn” or “cite our Lee card”" : "Comment for your partner. Type @AI to ask the AI."}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (mode === "custom" && text.trim()) void askAi(editor, env, "custom", text.trim());
                  else if (mode === "comment") comment();
                }
                if (e.key === "Escape") setMode("buttons");
              }}
              className="text-[12.5px]"
            />
            <div className="flex items-center gap-1.5">
              <Button size="xs" variant="primary" disabled={!text.trim()} onClick={() => (mode === "custom" ? void askAi(editor, env, "custom", text.trim()) : comment())}>
                {mode === "custom" ? "Ask AI" : "Comment"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setMode("buttons")}>
                Back
              </Button>
              {mode === "comment" && env.aiEnabled ? <span className={cn("ml-auto text-[11px]", mentionsAi(text) ? "text-accent" : "text-faint")}>@AI answers in the thread</span> : null}
            </div>
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}
