import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards, teams, teamMembers, user } from "@/server/db/schema";
// Only touches teams whose members are all synthetic @clash.test users.
const testUsers = (await db().select({ id: user.id }).from(user).where(inArray(user.email, ["test-a@clash.test", "test-b@clash.test", "test-c@clash.test"]))).map((u) => u.id);
const memberships = testUsers.length ? await db().select({ teamId: teamMembers.teamId }).from(teamMembers).where(inArray(teamMembers.userId, testUsers)) : [];
for (const { teamId } of memberships) {
  const r = await db().delete(cards).where(eq(cards.teamId, teamId)).returning({ id: cards.id });
  const [t] = await db().select({ name: teams.name }).from(teams).where(eq(teams.id, teamId));
  console.log(`cleared ${r.length} cards from test team ${t?.name}`);
}
