import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { createRound, listRounds, RoundInput } from "@/server/rounds";

export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  return Response.json({ rounds: await listRounds(teamId) });
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const body = (await req.json().catch(() => null)) as { teamId?: string } | null;
  if (!body?.teamId) throw new HttpError(400, "teamId is required.");
  await requireTeam(u.id, body.teamId);
  const parsed = RoundInput.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return Response.json(await createRound(body.teamId, u.id, parsed.data));
});
