import { after } from "next/server";
import { eq } from "drizzle-orm";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { importUploadToFlow } from "@/server/flow-import";
import { db } from "@/server/db/client";
import { rounds, uploads } from "@/server/db/schema";
import { aiAllowed } from "@/server/ai/policy";
import { warmLibraryCheck } from "@/server/ai/context";
import type { SpeechId } from "@/domain/format";

export const maxDuration = 60;

/** Deterministic flow import (no AI). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ roundId: string; uploadId: string }> }) => {
  const { roundId, uploadId } = await ctx.params;
  const u = await requireUser();
  const teamA = await requireAccess(u.id, "round", roundId);
  const teamB = await requireAccess(u.id, "upload", uploadId);
  if (teamA !== teamB) throw new HttpError(404, "Not found.");
  try {
    const out = await importUploadToFlow(roundId, uploadId, u.id);
    // Their speech doc on the flow: check the library for our next speech in the background (B2).
    const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
    const [up] = await db().select({ attribution: uploads.attribution }).from(uploads).where(eq(uploads.id, uploadId));
    const att = (up?.attribution ?? {}) as { speech?: SpeechId; owner?: string };
    if (round && aiAllowed(round) && att.owner === "opponent" && att.speech) after(() => warmLibraryCheck(roundId, att.speech!));
    return Response.json(out);
  } catch (e) {
    throw new HttpError(422, e instanceof Error ? e.message : "Could not add this document to the flow.");
  }
});
