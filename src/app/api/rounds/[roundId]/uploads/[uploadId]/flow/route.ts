import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { importUploadToFlow } from "@/server/flow-import";

export const maxDuration = 60;

/** Deterministic flow import (no AI). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ roundId: string; uploadId: string }> }) => {
  const { roundId, uploadId } = await ctx.params;
  const u = await requireUser();
  const teamA = await requireAccess(u.id, "round", roundId);
  const teamB = await requireAccess(u.id, "upload", uploadId);
  if (teamA !== teamB) throw new HttpError(404, "Not found.");
  try {
    return Response.json(await importUploadToFlow(roundId, uploadId, u.id));
  } catch (e) {
    throw new HttpError(422, e instanceof Error ? e.message : "Could not add this document to the flow.");
  }
});
