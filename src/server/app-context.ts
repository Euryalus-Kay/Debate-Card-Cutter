import { cookies } from "next/headers";
import { currentUser } from "@/server/auth";
import { joinSiteTeam, siteTeamId, teamsForUser } from "@/server/teams";

export const TEAM_COOKIE = "clash_team";

export async function getAppContext() {
  const user = await currentUser();
  if (!user) return { user: null, teams: [], team: null } as const;
  let teams = await teamsForUser(user.id);
  // Everyone on the site shares one library: an account not yet in the site's shared team joins it.
  const shared = await siteTeamId();
  if (shared && !teams.some((t) => t.id === shared)) {
    await joinSiteTeam(user.id, user.name);
    teams = await teamsForUser(user.id);
  }
  const jar = await cookies();
  const wanted = jar.get(TEAM_COOKIE)?.value;
  const team = teams.find((t) => t.id === wanted) ?? teams.find((t) => t.id === shared) ?? teams[0] ?? null;
  return { user, teams, team } as const;
}
