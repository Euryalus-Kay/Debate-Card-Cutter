import { desc, eq } from "drizzle-orm";
import { handle, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { aiOperations } from "@/server/db/schema";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ roundId: string }> }) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "round", roundId);
  const ops = await db()
    .select({ id: aiOperations.id, kind: aiOperations.kind, target: aiOperations.target, status: aiOperations.status, model: aiOperations.model, error: aiOperations.error, instruction: aiOperations.instruction, appliedAt: aiOperations.appliedAt, dismissedAt: aiOperations.dismissedAt, createdAt: aiOperations.createdAt, createdBy: aiOperations.createdBy, usage: aiOperations.usage, docId: aiOperations.docId })
    .from(aiOperations)
    .where(eq(aiOperations.roundId, roundId))
    .orderBy(desc(aiOperations.createdAt))
    .limit(60);
  return Response.json({ ops });
});
