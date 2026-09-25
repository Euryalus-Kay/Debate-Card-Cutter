import { desc, eq, inArray } from "drizzle-orm";
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
  // Finished, unapplied proposals come back with their output so a refresh never loses them.
  // Flow reading applies itself on the server, so it is never a pending proposal.
  const pendingIds = ops.filter((o) => o.status === "complete" && !o.appliedAt && !o.dismissedAt && o.kind !== "interpret_flow" && o.kind !== "extract_flow" && !o.kind.startsWith("span:")).slice(0, 8).map((o) => o.id);
  const outputs = pendingIds.length
    ? await db().select({ id: aiOperations.id, output: aiOperations.output }).from(aiOperations).where(inArray(aiOperations.id, pendingIds))
    : [];
  const byId = new Map(outputs.map((o) => [o.id, o.output]));
  return Response.json({ ops: ops.map((o) => ({ ...o, output: byId.get(o.id) ?? null })) });
});
