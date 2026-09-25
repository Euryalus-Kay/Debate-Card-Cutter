import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { listVersions } from "@/server/drafts";
import { saveVersion } from "@/server/docs/store";

type Ctx = { params: Promise<{ docId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { docId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "document", docId);
  return Response.json({ versions: await listVersions(docId) });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { docId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "document", docId);
  const body = z.object({ label: z.string().max(120).default("Saved version") }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Invalid version.");
  return Response.json({ id: await saveVersion(docId, "manual", body.data.label, u.id) });
});
