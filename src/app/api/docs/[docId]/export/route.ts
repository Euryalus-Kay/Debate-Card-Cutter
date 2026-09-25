import { handle, requireAccess, requireUser } from "@/server/authz";
import { exportDraftDocx } from "@/server/drafts";

export const maxDuration = 60;

export const GET = handle(async (req: Request, ctx: { params: Promise<{ docId: string }> }) => {
  const { docId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "document", docId);
  const includeNotes = new URL(req.url).searchParams.get("notes") === "1";
  const { bytes, fileName } = await exportDraftDocx(docId, { includeNotes });
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "no-store",
    },
  });
});
