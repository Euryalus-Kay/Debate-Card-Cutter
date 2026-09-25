import { handle, requireAccess, requireUser } from "@/server/authz";
import { checkCardAgainstSource } from "@/server/card-verify";
import { rateLimit } from "@/server/limits";

export const maxDuration = 60;

/** Check a card word for word against the page its citation links to. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ cardId: string }> }) => {
  const { cardId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "card", cardId);
  await rateLimit("card_check", u.id);
  return Response.json(await checkCardAgainstSource(teamId, cardId));
});
