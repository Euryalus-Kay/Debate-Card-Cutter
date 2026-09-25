import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { aiOperations } from "@/server/db/schema";

type Ctx = { params: Promise<{ opId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { opId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "aiop", opId);
  const [op] = await db().select().from(aiOperations).where(eq(aiOperations.id, opId));
  return Response.json({ op });
});

const Patch = z.object({ applied: z.boolean().optional(), dismissed: z.boolean().optional(), claim: z.boolean().optional() });

/**
 * Record that a proposal was applied or dismissed (audit trail; never re-applies anything).
 * `claim` marks it applied only if nobody else has, so two partners never apply the same update twice.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { opId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "aiop", opId);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid update.");
  if (p.data.claim) {
    const won = await db()
      .update(aiOperations)
      .set({ appliedAt: new Date(), appliedBy: u.id, updatedAt: new Date() })
      .where(and(eq(aiOperations.id, opId), eq(aiOperations.teamId, teamId), or(isNull(aiOperations.appliedAt), eq(aiOperations.appliedBy, u.id))))
      .returning();
    if (won.length) return Response.json({ claimed: true });
    const [op] = await db().select({ appliedBy: aiOperations.appliedBy }).from(aiOperations).where(eq(aiOperations.id, opId));
    return Response.json({ claimed: false, appliedBy: op?.appliedBy ?? null });
  }
  await db()
    .update(aiOperations)
    .set({ ...(p.data.applied ? { appliedAt: new Date(), appliedBy: u.id } : {}), ...(p.data.dismissed ? { dismissedAt: new Date() } : {}), updatedAt: new Date() })
    .where(and(eq(aiOperations.id, opId), eq(aiOperations.teamId, teamId)));
  return Response.json({ ok: true });
});
