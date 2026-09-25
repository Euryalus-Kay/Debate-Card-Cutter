"use client";

/**
 * Shared AI activity (A7): each AI job this browser runs is written to the
 * round document (who, what, stage, time left), so the partner sees it live
 * ("Sam's AI is writing the 1AR — section 4 of 9") and fetches the finished
 * proposal the moment it's ready. Writes are throttled; a finished job's
 * status (ready, applied, dismissed) is written at once.
 */

import type { Progress } from "@/domain/progress";
import type { SpeechId } from "@/domain/format";
import { patchActivity, pruneActivity, putActivity, type AiActivity } from "@/shared/round-doc";
import { getRoundDoc } from "./editor/active-editor";

let me: { id: string; name: string } | null = null;
const lastWrite = new Map<string, { at: number; stage: string }>();

/** Who "I" am in activity entries (set by the workspace). */
export function setActivityUser(user: { id: string; name: string } | null) {
  me = user;
}

export function activityStart(a: { id: string; kind: string; label: string; speech: SpeechId | null; draftId: string | null }) {
  const doc = getRoundDoc();
  if (!doc || !me) return;
  const now = Date.now();
  doc.transact(() => {
    pruneActivity(doc, now);
    putActivity(doc, { ...a, opId: null, by: me!.id, byName: me!.name, status: "running", stage: "Starting", done: 0, total: null, etaMs: null, fraction: 0.02, startedAt: now, at: now });
  });
  lastWrite.set(a.id, { at: now, stage: "Starting" });
}

/** Progress: written at most every 2 s, or at once when the stage changes. */
export function activityProgress(id: string, p: Progress) {
  const doc = getRoundDoc();
  if (!doc) return;
  const last = lastWrite.get(id);
  const stageKey = p.stage.replace(/\d+/g, "#");
  if (last && Date.now() - last.at < 2000 && last.stage === stageKey) return;
  lastWrite.set(id, { at: Date.now(), stage: stageKey });
  doc.transact(() => patchActivity(doc, id, { stage: p.stage, done: p.done, total: p.total, etaMs: p.etaMs, fraction: p.fraction }));
}

export function activityOp(id: string, opId: string) {
  const doc = getRoundDoc();
  if (doc) doc.transact(() => patchActivity(doc, id, { opId }));
}

export function activityEnd(id: string, status: AiActivity["status"], stage?: string) {
  const doc = getRoundDoc();
  lastWrite.delete(id);
  if (doc) doc.transact(() => patchActivity(doc, id, { status, stage: stage ?? (status === "ready" ? "Ready" : status === "failed" ? "Failed" : status === "applied" ? "Applied" : "Dismissed"), fraction: 1, etaMs: null }));
}

/** When a proposal is applied or dismissed, the partner's copy follows (found by the server op id). */
export function activityDecided(opId: string | null, status: "applied" | "dismissed") {
  const doc = getRoundDoc();
  if (!doc || !opId) return;
  const m = doc.getMap("ai_activity");
  doc.transact(() => {
    for (const [id, a] of m.entries() as IterableIterator<[string, AiActivity]>) if (a?.opId === opId) patchActivity(doc, id, { status, stage: status === "applied" ? "Applied" : "Dismissed" });
  });
}
