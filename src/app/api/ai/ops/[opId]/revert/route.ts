/** Undo a flow update (extract_flow): see revertHeard in src/shared/heard-apply.ts. */

import { eq } from "drizzle-orm";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { aiOperations, rounds } from "@/server/db/schema";
import { applyServerChange } from "@/server/docs/store";
import { revertHeard, type HeardApplyResult } from "@/shared/heard-apply";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ opId: string }> }) => {
  const { opId } = await ctx.params;
  const u = await requireUser();
  const [op] = await db().select().from(aiOperations).where(eq(aiOperations.id, opId));
  if (!op || !op.roundId) throw new HttpError(404, "Not found.");
  await requireAccess(u.id, "round", op.roundId);
  if (op.kind !== "extract_flow" || op.status !== "complete") throw new HttpError(400, "Only a finished flow update can be undone.");
  const [round] = await db().select({ stateDocId: rounds.stateDocId }).from(rounds).where(eq(rounds.id, op.roundId));
  if (!round) throw new HttpError(404, "Not found.");
  const out = (op.output ?? {}) as Partial<HeardApplyResult>;
  let result = { removed: 0, kept: 0 };
  await applyServerChange(
    round.stateDocId,
    (doc) => {
      result = revertHeard(doc, { created: out.created ?? [], aliased: out.aliased ?? [], positions: out.positions ?? [], marks: out.marks ?? [], relations: out.relations ?? [] });
    },
    { userId: u.id, origin: `revert:${opId}` },
  );
  await db().update(aiOperations).set({ dismissedAt: new Date(), updatedAt: new Date() }).where(eq(aiOperations.id, opId));
  return Response.json(result);
});
