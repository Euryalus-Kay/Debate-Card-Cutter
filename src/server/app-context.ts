import { cookies } from "next/headers";
import { currentUser } from "@/server/auth";
import { teamsForUser } from "@/server/teams";

export const TEAM_COOKIE = "clash_team";

export async function getAppContext() {
  const user = await currentUser();
  if (!user) return { user: null, teams: [], team: null } as const;
  const teams = await teamsForUser(user.id);
  const jar = await cookies();
  const wanted = jar.get(TEAM_COOKIE)?.value;
  const team = teams.find((t) => t.id === wanted) ?? teams[0] ?? null;
  return { user, teams, team } as const;
}
