import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { importCardsFromUpload } from "@/server/cards";

export const maxDuration = 120;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ uploadId: string }> }) => {
  const { uploadId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "upload", uploadId);
  const body = z.object({ labels: z.array(z.string().max(80)).max(10).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Invalid request.");
  return Response.json(await importCardsFromUpload(uploadId, teamId, u.id, body.data.labels ?? []));
});
