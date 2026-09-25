import { handle, requireAccess, requireUser } from "@/server/authz";
import { opponentHistory } from "@/server/opponent-history";

/** What this round's opponent ran against the team before (pre-round prep). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ roundId: string }> }) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "round", roundId);
  return Response.json(await opponentHistory(roundId));
});
