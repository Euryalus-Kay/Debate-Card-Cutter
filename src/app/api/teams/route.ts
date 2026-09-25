import { z } from "zod";
import { handle, HttpError, requireUser } from "@/server/authz";
import { createTeam, teamsForUser } from "@/server/teams";

export const GET = handle(async () => {
  const u = await requireUser();
  return Response.json({ teams: await teamsForUser(u.id) });
});

const Body = z.object({ name: z.string().trim().min(1).max(120), school: z.string().trim().max(160).optional() });

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Team name is required.");
  const id = await createTeam(u.id, u.name, parsed.data.name, parsed.data.school);
  return Response.json({ id });
});
