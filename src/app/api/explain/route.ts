import { z } from "zod";
import { handle, HttpError, requireAccess, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { aiAllowed } from "@/server/ai/policy";
import { explain, explainRoundId, ExplainTarget } from "@/server/ai/explain";
import { guardAi } from "@/server/limits";

export const maxDuration = 60;

const Body = z.object({ teamId: z.string().min(1), target: ExplainTarget });

/** A card, argument or position explained in plain words, in the context of the round and the topic. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid request.");
  const { teamId, target } = p.data;
  await requireTeam(u.id, teamId);
  if (target.kind === "card" && (await requireAccess(u.id, "card", target.cardId)) !== teamId) throw new HttpError(404, "Not found.");
  const roundId = await explainRoundId(target);
  if (roundId) {
    if ((await requireAccess(u.id, "round", roundId)) !== teamId) throw new HttpError(404, "Not found.");
    const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
    if (!aiAllowed(round)) throw new HttpError(403, "AI is turned off for this round (tournament rules setting).");
  }
  await guardAi("explain", u.id, teamId);
  try {
    return Response.json({ explanation: await explain(teamId, target, { abortSignal: req.signal }) });
  } catch (e) {
    if (/not found/.test((e as Error).message)) throw new HttpError(404, "Not found.");
    throw e;
  }
});
