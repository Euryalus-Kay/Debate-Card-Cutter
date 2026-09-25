/**
 * Start an AI operation and stream its progress as NDJSON.
 * The operation keeps running (and is persisted) even if the client
 * disconnects; the client can recover it from GET /api/ai/ops/[opId].
 */

import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { aiOperations, documents, rounds } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { draftSpeech, fitSpeech, interpretFlow, reviseSection, type SectionAction } from "@/server/ai/ops";
import { AiRunError } from "@/server/ai/run";
import { aiAllowed } from "@/server/ai/policy";
import { ratesForSpeech } from "@/server/speakers";
import { SPEECH_IDS, type SpeechId } from "@/domain/format";

export const maxDuration = 300;

const Body = z.object({
  kind: z.enum(["draft_speech", "revise_section", "interpret_flow", "fit_speech"]),
  roundId: z.string(),
  speech: z.enum(SPEECH_IDS as unknown as [string, ...string[]]),
  draftId: z.string().nullable().optional(),
  sectionId: z.string().optional(),
  action: z.enum(["strengthen", "clarify", "reword", "condense", "alternatives", "find_card", "custom"]).optional(),
  mode: z.enum(["fast", "deep"]).default("fast"),
  cardIds: z.array(z.string()).max(60).default([]),
  evidenceMode: z.enum(["selected_only", "selected_plus_library"]).default("selected_plus_library"),
  instructions: z.string().max(4000).default(""),
  targetSeconds: z.number().min(5).max(600).optional(),
});


export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Invalid AI request.");
  const input = parsed.data;
  const teamId = await requireAccess(u.id, "round", input.roundId);
  const [round] = await db().select().from(rounds).where(eq(rounds.id, input.roundId));
  if (!aiAllowed(round)) throw new HttpError(403, "AI is turned off for this round (tournament rules setting). Change it from the round menu if the rules allow it.");
  if (input.draftId) {
    const [d] = await db().select({ roundId: documents.roundId }).from(documents).where(eq(documents.id, input.draftId));
    if (!d || d.roundId !== input.roundId) throw new HttpError(404, "Draft not found in this round.");
  }
  // Time the speech at the pace of whoever gives it (roster / per-speech override), else the requester's.
  const { rates } = await ratesForSpeech(round, input.speech as SpeechId, u.id);

  const opId = newId("aop");
  await db()
    .insert(aiOperations)
    .values({
      id: opId,
      teamId,
      roundId: input.roundId,
      docId: input.draftId ?? null,
      kind: input.kind === "revise_section" ? `revise:${input.action}` : input.kind,
      target: { speech: input.speech, sectionId: input.sectionId ?? null },
      instruction: input.instructions,
      mode: input.mode,
      status: "streaming",
      createdBy: u.id,
    });

  const encoder = new TextEncoder();
  const sink: { push: ((line: object) => void) | null } = { push: null };
  let lastPersist = 0;
  let lastPartial: unknown = null;
  const abort = new AbortController();

  const persistPartial = async (force = false) => {
    if (!force && Date.now() - lastPersist < 1500) return;
    lastPersist = Date.now();
    try {
      await db()
        .update(aiOperations)
        .set({ partialText: JSON.stringify(lastPartial ?? {}).slice(0, 400_000), updatedAt: new Date() })
        .where(eq(aiOperations.id, opId));
    } catch {
      /* best effort */
    }
  };

  const onPartial = (p: unknown) => {
    lastPartial = p;
    sink.push?.({ t: "partial", data: p });
    void persistPartial();
  };

  const work = (async () => {
    try {
      let result: unknown;
      if (input.kind === "draft_speech") {
        result = await draftSpeech({
          roundId: input.roundId,
          speech: input.speech as SpeechId,
          draftId: input.draftId ?? null,
          mode: input.mode,
          cardIds: input.cardIds,
          evidenceMode: input.evidenceMode,
          instructions: input.instructions,
          rates,
          teamId,
          onPartial,
          onStatus: (s) => sink.push?.({ t: "status", data: s }),
          abortSignal: abort.signal,
        });
      } else if (input.kind === "revise_section") {
        if (!input.draftId || !input.sectionId || !input.action) throw new HttpError(400, "Missing section.");
        result = await reviseSection({
          roundId: input.roundId,
          speech: input.speech as SpeechId,
          draftId: input.draftId,
          sectionId: input.sectionId,
          action: input.action as SectionAction,
          instructions: input.instructions,
          targetSeconds: input.targetSeconds ?? null,
          cardIds: input.cardIds,
          rates,
          teamId,
          onPartial,
          abortSignal: abort.signal,
        });
      } else if (input.kind === "fit_speech") {
        if (!input.draftId) throw new HttpError(400, "Missing draft.");
        result = await fitSpeech({
          roundId: input.roundId,
          speech: input.speech as SpeechId,
          draftId: input.draftId,
          targetSeconds: input.targetSeconds ?? null,
          instructions: input.instructions,
          rates,
          teamId,
          onPartial,
          abortSignal: abort.signal,
        });
      } else {
        result = await interpretFlow({ roundId: input.roundId, speech: input.speech as SpeechId, teamId, userId: u.id, onPartial, abortSignal: abort.signal });
      }
      const r = result as { run?: { model?: string; usage?: unknown; ttftMs?: number | null; totalMs?: number }; contextRefs?: unknown };
      await db()
        .update(aiOperations)
        .set({ status: "complete", output: result as never, model: r.run?.model ?? "", usage: { ...(r.run ?? {}) } as never, contextRefs: (r.contextRefs ?? {}) as never, partialText: "", updatedAt: new Date() })
        .where(eq(aiOperations.id, opId));
      sink.push?.({ t: "done", data: result });
    } catch (e) {
      const message = e instanceof HttpError || e instanceof AiRunError || e instanceof Error ? e.message : "AI request failed.";
      await db()
        .update(aiOperations)
        .set({ status: abort.signal.aborted ? "cancelled" : "failed", error: message, usage: e instanceof AiRunError ? ({ attempts: e.attempts } as never) : null, updatedAt: new Date() })
        .where(eq(aiOperations.id, opId));
      sink.push?.({ t: "error", message });
    }
  })();
  // Keep the function alive until the work finishes, even if the client leaves.
  after(() => work);

  const stream = new ReadableStream({
    start(controller) {
      sink.push = (line) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
        } catch {
          sink.push = null;
        }
      };
      sink.push({ t: "op", id: opId });
      void work.finally(() => {
        try {
          controller.close();
        } catch {
          /* closed */
        }
      });
    },
    cancel() {
      // Client went away: keep working, stop pushing.
      sink.push = null;
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-op-id": opId } });
});
