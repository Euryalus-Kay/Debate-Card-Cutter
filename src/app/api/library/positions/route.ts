import { handle, requireTeam, requireUser } from "@/server/authz";
import { libraryPositions } from "@/server/library/shells";

/** The team's positions (from its cards' labels), for choosing what a speech runs from the files. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  return Response.json({ positions: await libraryPositions(teamId) });
});
