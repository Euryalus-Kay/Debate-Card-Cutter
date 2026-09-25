import { handle, requireAccess, requireUser } from "@/server/authz";
import { requestCancel } from "@/server/research/jobs";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ jobId: string }> }) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "job", jobId);
  await requestCancel(teamId, jobId);
  return Response.json({ ok: true });
});
