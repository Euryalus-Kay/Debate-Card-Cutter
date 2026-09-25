import { handle, requireTeam, requireUser } from "@/server/authz";
import { createInvite } from "@/server/teams";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ teamId: string }> }) => {
  const { teamId } = await ctx.params;
  const u = await requireUser();
  await requireTeam(u.id, teamId);
  const { token, expiresAt } = await createInvite(teamId, u.id);
  const origin = new URL(req.url).origin;
  return Response.json({ url: `${origin}/join/${token}`, expiresAt });
});
