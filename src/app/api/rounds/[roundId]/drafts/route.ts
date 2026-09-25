import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { createDraft } from "@/server/rounds";
import { SPEECH_IDS } from "@/domain/format";

const Body = z.object({ speech: z.enum(SPEECH_IDS as unknown as [string, ...string[]]), variant: z.string().max(80).optional(), title: z.string().max(160).optional() });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ roundId: string }> }) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "round", roundId);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Choose a speech (1AC–2AR).");
  const id = await createDraft({ teamId, roundId, userId: u.id, ...parsed.data });
  return Response.json({ id });
});
