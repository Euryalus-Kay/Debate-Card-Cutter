import { handle, requireTeam, requireUser } from "@/server/authz";
import { getCards } from "@/server/cards";

export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  return Response.json({ cards: await getCards(teamId, ids) });
});
