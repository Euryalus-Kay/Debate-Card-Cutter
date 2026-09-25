import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { atomic, db } from "@/server/db/client";
import { teamInvites, teamMembers, teams, user } from "@/server/db/schema";
import { HttpError } from "@/server/authz";
import { newId, randomToken } from "@/server/ids";
import { sha256Hex } from "@/server/docs/store";

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function createTeam(userId: string, userName: string, name: string, school = ""): Promise<string> {
  const id = newId("team");
  await atomic((d) => [
    d.insert(teams).values({ id, name: name.trim() || "My team", school: school.trim(), createdBy: userId }),
    d.insert(teamMembers).values({ teamId: id, userId, role: "owner", initials: initialsFor(userName) }),
  ]);
  return id;
}

export async function teamsForUser(userId: string) {
  return db()
    .select({ id: teams.id, name: teams.name, school: teams.school, role: teamMembers.role, initials: teamMembers.initials })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
    .orderBy(teams.createdAt);
}

export async function teamMembersList(teamId: string) {
  return db()
    .select({ userId: user.id, name: user.name, email: user.email, role: teamMembers.role, initials: teamMembers.initials })
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
}

/** Create an invite link token. Only the hash is stored. */
export async function createInvite(teamId: string, createdBy: string, days = 14, maxUses = 5): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await db()
    .insert(teamInvites)
    .values({ id: newId("inv"), teamId, tokenHash: await sha256Hex(new TextEncoder().encode(token)), createdBy, expiresAt, maxUses });
  return { token, expiresAt };
}

export async function inviteInfo(token: string) {
  const hash = await sha256Hex(new TextEncoder().encode(token));
  const [inv] = await db()
    .select({ id: teamInvites.id, teamId: teamInvites.teamId, teamName: teams.name, uses: teamInvites.uses, maxUses: teamInvites.maxUses })
    .from(teamInvites)
    .innerJoin(teams, eq(teams.id, teamInvites.teamId))
    .where(and(eq(teamInvites.tokenHash, hash), gt(teamInvites.expiresAt, new Date()), isNull(teamInvites.revokedAt)));
  if (!inv || inv.uses >= inv.maxUses) return null;
  return inv;
}

export async function acceptInvite(token: string, userId: string, userName: string): Promise<string> {
  const inv = await inviteInfo(token);
  if (!inv) throw new HttpError(404, "This invite link is invalid, expired, or already used.");
  const [existing] = await db().select().from(teamMembers).where(and(eq(teamMembers.teamId, inv.teamId), eq(teamMembers.userId, userId)));
  if (existing) return inv.teamId;
  await atomic((d) => [
    d.insert(teamMembers).values({ teamId: inv.teamId, userId, role: "member", initials: initialsFor(userName) }).onConflictDoNothing(),
    d
      .update(teamInvites)
      .set({ uses: sql`${teamInvites.uses} + 1` })
      .where(eq(teamInvites.id, inv.id)),
  ]);
  return inv.teamId;
}
