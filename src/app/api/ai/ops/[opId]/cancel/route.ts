import { and, eq } from "drizzle-orm";
import { handle, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { aiOperations } from "@/server/db/schema";

type Ctx = { params: Promise<{ opId: string }> };

/** Stop a running AI operation (either partner may). The running request notices within a few seconds and aborts. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { opId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "aiop", opId);
  const stopped = await db()
    .update(aiOperations)
    .set({ status: "cancelled", error: `Stopped by ${u.name.split(" ")[0]}.`, updatedAt: new Date() })
    .where(and(eq(aiOperations.id, opId), eq(aiOperations.teamId, teamId), eq(aiOperations.status, "streaming")))
    .returning();
  return Response.json({ stopped: stopped.length > 0 });
});
