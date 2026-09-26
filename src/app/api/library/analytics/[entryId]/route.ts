import { and, eq } from "drizzle-orm";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { analyticsBank } from "@/server/db/schema";

type Ctx = { params: Promise<{ entryId: string }> };

/** Remove one entry from the team's analytics bank (drafts stop offering it). */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { entryId } = await ctx.params;
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const gone = await db().delete(analyticsBank).where(and(eq(analyticsBank.id, entryId), eq(analyticsBank.teamId, teamId))).returning();
  if (!gone.length) throw new HttpError(404, "Not found.");
  return Response.json({ ok: true });
});
