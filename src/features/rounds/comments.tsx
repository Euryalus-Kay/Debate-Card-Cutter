"use client";

/**
 * Comments on the draft (A7): threads anchored to words, shared live with the
 * partner, working offline. Mention @AI in a comment or reply and the AI
 * answers in the thread (an explanation or a critique of those words), and
 * may attach new words for them; accepting replaces exactly the commented
 * words, and only if nobody changed them meanwhile.
 */

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";
import { Check, MessageSquare, RotateCcw, Sparkles } from "lucide-react";
import { runOp } from "@/client/ai";
import { flushDoc, useYDocValue } from "@/client/sync/hooks";
import { Badge, Button, cn, EmptyState, Textarea, toast } from "@/components/ui";
import { makeId } from "@/shared/editor/schema";
import { mentionsAi, patchReply, patchThread, putReply, readThreads, type CommentReply, type ThreadView } from "@/shared/comments";
import { useWorkspace } from "./store";
import { getActiveEditor } from "./editor/active-editor";
import { anchorRange, rangeText, resolveRange, squash } from "./editor/anchors";
import { setAnchoredMarks } from "./editor/anchored-marks";
import { replaceAnchored, WordDiff, type SpanEnv } from "./editor/span-common";
import { activityEnd, activityOp, activityStart } from "./ai-activity";

/** Ask the AI to answer a thread (it was mentioned with @AI). Its reply appears in the thread for both partners. */
export async function askAiInThread(editor: Editor | null, env: SpanEnv, threadId: string) {
  const doc = env.draftDoc;
  if (!doc) return;
  const thread = readThreads(doc).find((t) => t.id === threadId);
  if (!thread) return;
  const replyId = makeId("rep");
  // Always after the message that asked (they can share a millisecond).
  const at = Math.max(Date.now(), ...thread.replies.map((r) => r.at + 1));
  doc.transact(() => putReply(doc, { id: replyId, threadId, by: env.userId, byName: env.userName, at, text: "", ai: true, pending: true }));
  const aid = makeId("act");
  activityStart({ id: aid, kind: "comment", label: `answering a comment on the ${env.speech}`, speech: env.speech, draftId: env.draftId });
  // The commented words as they are now (the thread may be older than the latest edits).
  const r = editor ? resolveRange(editor, { start: thread.start, end: thread.end }) : null;
  const text = editor && r ? rangeText(editor, r.from, r.to) : thread.quote;
  const before = editor && r ? editor.state.doc.textBetween(Math.max(0, r.from - 600), r.from, "\n", " ") : "";
  const after = editor && r ? editor.state.doc.textBetween(r.to, Math.min(editor.state.doc.content.size, r.to + 600), "\n", " ") : "";
  try {
    await flushDoc(env.draftId);
    const res = (await runOp(
      {
        kind: "edit_span",
        roundId: env.roundId,
        speech: env.speech,
        draftId: env.draftId,
        sectionId: thread.sectionId ?? undefined,
        spanAction: "comment",
        text,
        before,
        after,
        thread: thread.replies.filter((x) => !x.pending && x.text).map((x) => ({ by: x.ai ? "AI" : x.byName, text: x.text, ai: !!x.ai })),
        mode: "fast",
      },
      (e) => {
        if (e.t === "op") activityOp(aid, e.id);
      },
    )) as { reply: string; replacement: string; note: string; base: string; warnings: string[] };
    doc.transact(() =>
      patchReply(doc, threadId, replyId, { pending: false, text: res.reply, suggestion: res.replacement ? { replacement: res.replacement, note: res.note, base: res.base, status: "pending", warnings: res.warnings } : null }),
    );
    activityEnd(aid, "ready", "Answered in the thread");
  } catch (e) {
    doc.transact(() => patchReply(doc, threadId, replyId, { pending: false, error: (e as Error).message }));
    activityEnd(aid, "failed");
  }
}

/** Commented words are tinted in the draft; clicking them opens their thread. */
export function useCommentMarks(editor: Editor | null, doc: Y.Doc | null) {
  const threads = useYDocValue(doc, readThreads) ?? [];
  const key = threads.map((t) => `${t.id}:${t.resolved ? 1 : 0}`).join(",");
  useEffect(() => {
    const open = threads.filter((t) => !t.resolved);
    setAnchoredMarks(
      editor,
      "comments",
      open.map((t) => ({ key: t.id, anchor: { start: t.start, end: t.end }, className: "anchored-comment", title: `${t.replies[0]?.byName ?? "Comment"}: ${t.replies[0]?.text ?? ""}`.slice(0, 200), onClick: () => useWorkspace.getState().set({ right: "comments", selectedThreadId: t.id }) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, key]);
}

function timeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Reply({ r, thread, env, now }: { r: CommentReply; thread: ThreadView; env: SpanEnv; now: number }) {
  const doc = env.draftDoc!;
  const [stale, setStale] = useState(false);
  function decide(accept: boolean, force = false) {
    if (!r.suggestion) return;
    if (accept) {
      const editor = getActiveEditor(env.draftId);
      if (!editor) return toast("Open this draft to apply the suggestion.", "warn");
      const res = replaceAnchored(editor, { start: thread.start, end: thread.end }, r.suggestion.base, r.suggestion.replacement, force, (from, to) => {
        const a = anchorRange(editor, from, to);
        if (a) doc.transact(() => patchThread(doc, thread.id, { start: a.start, end: a.end, quote: r.suggestion!.replacement }));
      });
      if (res === "stale") return setStale(true);
      if (res !== "applied") {
        toast(res === "missing" ? "The commented words were deleted." : "Those words are locked now.", "warn");
        doc.transact(() => patchReply(doc, thread.id, r.id, { suggestion: { ...r.suggestion!, status: "stale", decidedBy: env.userName } }));
        return;
      }
    }
    doc.transact(() => patchReply(doc, thread.id, r.id, { suggestion: { ...r.suggestion!, status: accept ? "accepted" : "rejected", decidedBy: env.userName } }));
  }
  return (
    <div className={cn("rounded-md px-2 py-1.5", r.ai ? "bg-accent-soft/40" : "")}>
      <div className="flex items-center gap-1.5 text-[11.5px]">
        {r.ai ? <Sparkles className="size-3 text-accent" /> : null}
        <span className="font-semibold">{r.ai ? "AI" : r.byName}</span>
        {r.ai ? <span className="text-faint">asked by {r.byName.split(" ")[0]}</span> : null}
        <span className="ml-auto text-faint">{timeAgo(r.at, now)}</span>
      </div>
      {r.pending ? <p className="animate-pulse-soft text-[12.5px] text-muted">Thinking…</p> : null}
      {r.error ? (
        <div className="text-[12px] text-bad">
          {r.error}
          <Button size="xs" variant="ghost" className="ml-1" onClick={() => void askAiInThread(getActiveEditor(env.draftId), env, thread.id)}>
            <RotateCcw className="size-3" /> Retry
          </Button>
        </div>
      ) : null}
      {r.text ? <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{r.text}</p> : null}
      {r.suggestion ? (
        <div className="mt-1.5 rounded-md border border-line bg-elev p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Suggested words</div>
          <WordDiff from={r.suggestion.base} to={r.suggestion.replacement} />
          {r.suggestion.note ? <p className="mt-1 text-[11.5px] text-muted">{r.suggestion.note}</p> : null}
          {r.suggestion.warnings?.map((w) => (
            <p key={w} className="mt-1 text-[11.5px] text-warn">
              {w}
            </p>
          ))}
          {r.suggestion.status === "pending" ? (
            <>
              {stale ? <p className="mt-1 text-[11.5px] text-warn">The commented words changed since the AI wrote this.</p> : null}
              <div className="mt-1.5 flex gap-1.5">
                <Button size="xs" variant="primary" onClick={() => decide(true, stale)}>
                  <Check className="size-3" /> {stale ? "Replace anyway" : "Accept"}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => decide(false)}>
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <Badge tone={r.suggestion.status === "accepted" ? "ok" : "neutral"} className="mt-1">
              {r.suggestion.status === "accepted" ? "Accepted" : r.suggestion.status === "rejected" ? "Rejected" : "Couldn't apply"}
              {r.suggestion.decidedBy ? ` by ${r.suggestion.decidedBy.split(" ")[0]}` : ""}
            </Badge>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Thread({ t, env, editor, now, focused }: { t: ThreadView; env: SpanEnv; editor: Editor | null; now: number; focused: boolean }) {
  const doc = env.draftDoc!;
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const where = editor ? resolveRange(editor, { start: t.start, end: t.end }) : null;
  const current = editor && where ? rangeText(editor, where.from, where.to) : null;
  function send() {
    const body = text.trim();
    if (!body) return;
    doc.transact(() => putReply(doc, { id: makeId("rep"), threadId: t.id, by: env.userId, byName: env.userName, at: Date.now(), text: body }));
    setText("");
    if (mentionsAi(body)) {
      if (env.aiEnabled) void askAiInThread(editor, env, t.id);
      else toast("AI is off for this round.", "warn");
    }
  }
  function show() {
    if (!editor || !where) return;
    editor.chain().focus().setTextSelection({ from: where.from, to: where.to }).scrollIntoView().run();
  }
  return (
    <div ref={ref} className={cn("rounded-xl border bg-elev p-2.5", focused ? "border-accent" : "border-line", t.resolved && "opacity-70")}>
      <button className="mb-1.5 block w-full border-l-2 border-accent/60 pl-2 text-left text-[12px] italic text-muted hover:text-fg" onClick={show} title="Show in the draft">
        {current !== null ? `“${squash(current).slice(0, 160)}”` : `“${t.quote.slice(0, 160)}” (these words were deleted)`}
      </button>
      <div className="space-y-1">
        {t.replies.map((r) => (
          <Reply key={r.id} r={r} thread={t} env={env} now={now} />
        ))}
      </div>
      {!t.resolved ? (
        <div className="mt-2 space-y-1.5">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={env.aiEnabled ? "Reply… (@AI to ask the AI)" : "Reply…"}
            className="text-[12.5px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center gap-1.5">
            <Button size="xs" variant="primary" disabled={!text.trim()} onClick={send}>
              Reply
            </Button>
            {env.aiEnabled ? (
              <Button size="xs" variant="ghost" onClick={() => void askAiInThread(editor, env, t.id)}>
                <Sparkles className="size-3" /> Ask AI
              </Button>
            ) : null}
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => doc.transact(() => patchThread(doc, t.id, { resolved: true, resolvedBy: env.userName }))}>
              <Check className="size-3" /> Resolve
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center text-[11.5px] text-faint">
          Resolved{t.resolvedBy ? ` by ${t.resolvedBy.split(" ")[0]}` : ""}
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => doc.transact(() => patchThread(doc, t.id, { resolved: false, resolvedBy: null }))}>
            Reopen
          </Button>
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({ env }: { env: SpanEnv | null }) {
  const ws = useWorkspace();
  const threads = useYDocValue(env?.draftDoc ?? null, readThreads) ?? [];
  const [showResolved, setShowResolved] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const editor = env ? getActiveEditor(env.draftId) : null;
  const open = threads.filter((t) => !t.resolved);
  const resolved = threads.filter((t) => t.resolved);
  if (!env?.draftDoc) return <EmptyState icon={<MessageSquare className="size-7" />} title="No draft open">Open one of your speeches to see its comments.</EmptyState>;
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {!threads.length ? (
        <EmptyState icon={<MessageSquare className="size-7" />} title="No comments yet">
          Select words in the draft and choose Comment. Your partner sees comments live; type @AI to have the AI answer or suggest new words.
        </EmptyState>
      ) : null}
      {open.map((t) => (
        <Thread key={t.id} t={t} env={env} editor={editor} now={now} focused={ws.selectedThreadId === t.id} />
      ))}
      {resolved.length ? (
        <button className="text-[11.5px] text-accent-text hover:underline" onClick={() => setShowResolved(!showResolved)}>
          {showResolved ? "Hide" : "Show"} {resolved.length} resolved
        </button>
      ) : null}
      {showResolved ? resolved.map((t) => <Thread key={t.id} t={t} env={env} editor={editor} now={now} focused={ws.selectedThreadId === t.id} />) : null}
    </div>
  );
}
