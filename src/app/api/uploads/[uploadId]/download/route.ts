import { get } from "@vercel/blob";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { uploadWithBlocks } from "@/server/uploads";

/** Download a file as it was stored (an imported file, or a built one in Verbatim form). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ uploadId: string }> }) => {
  const { uploadId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "upload", uploadId);
  const data = await uploadWithBlocks(uploadId);
  if (!data?.upload.blobPath) throw new HttpError(404, "This file has no stored copy to download.");
  const r = await get(data.upload.blobPath, { access: "private" });
  if (!r || r.statusCode !== 200 || !r.stream) throw new HttpError(404, "The stored copy couldn't be read.");
  const name = data.upload.fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(r.stream, { headers: { "content-type": data.upload.mime || "application/octet-stream", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
});
