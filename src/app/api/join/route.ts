import { z } from "zod";
import { handle, HttpError, requireUser } from "@/server/authz";
import { acceptInvite } from "@/server/teams";

const Body = z.object({ token: z.string().min(10).max(200) });

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Invalid invite.");
  const teamId = await acceptInvite(parsed.data.token, u.id, u.name);
  return Response.json({ teamId });
});
