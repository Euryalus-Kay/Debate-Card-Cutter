import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { deliverDraft } from "@/server/drafts";

export const maxDuration = 60;

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ docId: string }> }) => {
  const { docId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "document", docId);
  try {
    return Response.json(await deliverDraft(docId, u.id));
  } catch (e) {
    throw new HttpError(422, e instanceof Error ? e.message : "Could not mark delivered.");
  }
});
