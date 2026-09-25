import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { restoreVersion, versionJson } from "@/server/drafts";

type Ctx = { params: Promise<{ docId: string; versionId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { docId, versionId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "document", docId);
  const json = await versionJson(docId, versionId);
  if (!json) throw new HttpError(404, "Not found.");
  return Response.json({ doc: json });
});

/** Restore = write the old content as a new change (the current content is saved first). */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { docId, versionId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "document", docId);
  await restoreVersion(docId, versionId, u.id);
  return Response.json({ ok: true });
});
