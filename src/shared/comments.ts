/**
 * Comment threads on a draft (A7), kept in the draft's own Y.Doc so partners
 * see them live and they work offline. A thread is anchored to a span of the
 * draft with Yjs relative positions (it follows the text as people edit
 * around it). Replies may come from the AI (asked with "@AI"), optionally with
 * a suggested replacement for the anchored span. Threads and replies are
 * plain values under flat keys, so two partners replying at once never lose
 * each other's replies.
 */

import type * as Y from "yjs";

export const COMMENT_THREADS = "comment_threads";
export const COMMENT_REPLIES = "comment_replies";

export interface CommentThread {
  id: string;
  /** Y.RelativePosition JSON at the start and end of the commented span (in the draft fragment) */
  start: unknown;
  end: unknown;
  /** the span's text when the thread was started */
  quote: string;
  sectionId: string | null;
  by: string;
  byName: string;
  at: number;
  resolved: boolean;
  resolvedBy?: string | null;
}

export interface SpanSuggestion {
  replacement: string;
  note: string;
  /** the span's text the suggestion was written for (applying it elsewhere would be wrong) */
  base: string;
  status: "pending" | "accepted" | "rejected" | "stale";
  decidedBy?: string | null;
  warnings?: string[];
}

export interface CommentReply {
  id: string;
  threadId: string;
  by: string;
  byName: string;
  at: number;
  text: string;
  /** written by the AI (on behalf of `by`, who asked) */
  ai?: boolean;
  /** the AI is still writing this reply */
  pending?: boolean;
  /** the AI couldn't answer */
  error?: string | null;
  suggestion?: SpanSuggestion | null;
}

export interface ThreadView extends CommentThread {
  /** the first message is the thread's opening comment */
  replies: CommentReply[];
}

const replyKey = (threadId: string, replyId: string) => `${threadId}|${replyId}`;

export function putThread(doc: Y.Doc, t: CommentThread): void {
  doc.getMap(COMMENT_THREADS).set(t.id, t);
}

export function patchThread(doc: Y.Doc, id: string, fields: Partial<CommentThread>): void {
  const m = doc.getMap(COMMENT_THREADS) as Y.Map<CommentThread>;
  const cur = m.get(id);
  if (cur) m.set(id, { ...cur, ...fields });
}

export function putReply(doc: Y.Doc, r: CommentReply): void {
  doc.getMap(COMMENT_REPLIES).set(replyKey(r.threadId, r.id), r);
}

export function patchReply(doc: Y.Doc, threadId: string, replyId: string, fields: Partial<CommentReply>): void {
  const m = doc.getMap(COMMENT_REPLIES) as Y.Map<CommentReply>;
  const cur = m.get(replyKey(threadId, replyId));
  if (cur) m.set(replyKey(threadId, replyId), { ...cur, ...fields });
}

export function readThreads(doc: Y.Doc): ThreadView[] {
  const replies = new Map<string, CommentReply[]>();
  for (const r of (doc.getMap(COMMENT_REPLIES) as Y.Map<CommentReply>).values()) {
    if (!r) continue;
    replies.set(r.threadId, [...(replies.get(r.threadId) ?? []), r]);
  }
  return [...(doc.getMap(COMMENT_THREADS) as Y.Map<CommentThread>).values()]
    .filter(Boolean)
    .map((t) => ({ ...t, replies: (replies.get(t.id) ?? []).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.at - b.at);
}

/** True when a message asks the AI to answer ("@AI", "@ai", "@Clash"). */
export function mentionsAi(text: string): boolean {
  return /(^|\s)@(ai|clash)\b/i.test(text);
}
