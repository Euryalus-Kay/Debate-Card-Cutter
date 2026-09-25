import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { uploadWithBlocks } from "@/server/uploads";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ uploadId: string }> }) => {
  const { uploadId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "upload", uploadId);
  const data = await uploadWithBlocks(uploadId);
  if (!data) throw new HttpError(404, "Not found.");
  const pr = (data.upload.parseResult ?? {}) as Record<string, unknown>;
  return Response.json({ upload: { ...data.upload, parseResult: { ...pr, plainText: undefined } }, blocks: data.blocks });
});
