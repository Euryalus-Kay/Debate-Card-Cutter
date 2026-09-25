import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { aiAllowed } from "@/server/ai/policy";
import { cxPrep } from "@/server/ai/cx";
import { AiRunError } from "@/server/ai/run";

export const maxDuration = 60;

/** Questions for a CX where we ask, or likely questions and answers for one where they ask us. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ roundId: string }> }) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  const p = z.object({ cxId: z.string().max(10) }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid request.");
  const teamId = await requireAccess(u.id, "round", roundId);
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  if (!aiAllowed(round)) throw new HttpError(403, "AI is turned off for this round (tournament rules setting).");
  try {
    return Response.json(await cxPrep(roundId, p.data.cxId, teamId, req.signal));
  } catch (e) {
    if (e instanceof AiRunError) throw new HttpError(502, "The AI couldn't prepare CX just now. Try again.");
    throw e;
  }
});
