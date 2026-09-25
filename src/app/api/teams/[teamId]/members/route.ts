import { handle, requireTeam, requireUser } from "@/server/authz";
import { teamMembersList } from "@/server/teams";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ teamId: string }> }) => {
  const { teamId } = await ctx.params;
  const u = await requireUser();
  await requireTeam(u.id, teamId);
  return Response.json({ members: await teamMembersList(teamId) });
});
