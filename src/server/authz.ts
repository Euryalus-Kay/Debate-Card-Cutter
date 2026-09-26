/**
 * Authorization. Every route that touches team data resolves the resource's
 * team and checks membership here. Errors are typed so routes can map them
 * to 401/403/404 without leaking whether a resource exists.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { aiOperations, cards, documents, jobs, rounds, sources, teamMembers, uploads, user } from "@/server/db/schema";
import { joinSiteTeam, siteTeamId } from "@/server/teams";
import { currentUser, type SessionUser } from "@/server/auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Sign in required.");
  return u;
}

export async function membership(userId: string, teamId: string): Promise<{ role: "owner" | "member"; initials: string } | null> {
  const [m] = await db()
    .select({ role: teamMembers.role, initials: teamMembers.initials })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return m ?? null;
}

export async function requireTeam(userId: string, teamId: string) {
  let m = await membership(userId, teamId);
  // The site's shared team is everyone's: an account that hasn't joined it yet joins on first use.
  if (!m && teamId === (await siteTeamId())) {
    const [who] = await db().select({ name: user.name }).from(user).where(eq(user.id, userId));
    if (who) {
      await joinSiteTeam(userId, who.name);
      m = await membership(userId, teamId);
    }
  }
  // 404 rather than 403 so outsiders cannot probe for team ids.
  if (!m) throw new HttpError(404, "Not found.");
  return m;
}

type Kind = "round" | "document" | "card" | "upload" | "job" | "aiop" | "source";

async function teamOf(kind: Kind, id: string): Promise<string | null> {
  const d = db();
  const pick = async (rows: { teamId: string }[]) => rows[0]?.teamId ?? null;
  switch (kind) {
    case "round":
      return pick(await d.select({ teamId: rounds.teamId }).from(rounds).where(eq(rounds.id, id)));
    case "document":
      return pick(await d.select({ teamId: documents.teamId }).from(documents).where(eq(documents.id, id)));
    case "card":
      return pick(await d.select({ teamId: cards.teamId }).from(cards).where(eq(cards.id, id)));
    case "upload":
      return pick(await d.select({ teamId: uploads.teamId }).from(uploads).where(eq(uploads.id, id)));
    case "job":
      return pick(await d.select({ teamId: jobs.teamId }).from(jobs).where(eq(jobs.id, id)));
    case "aiop":
      return pick(await d.select({ teamId: aiOperations.teamId }).from(aiOperations).where(eq(aiOperations.id, id)));
    case "source":
      return pick(await d.select({ teamId: sources.teamId }).from(sources).where(eq(sources.id, id)));
  }
}

/** Resolve the resource's team and require membership. Returns the team id. */
export async function requireAccess(userId: string, kind: Kind, id: string): Promise<string> {
  const teamId = await teamOf(kind, id);
  if (!teamId) throw new HttpError(404, "Not found.");
  await requireTeam(userId, teamId);
  return teamId;
}

/** Wrap a route handler: maps HttpError to JSON responses and hides internals. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong on the server. Your local work is unaffected." }, { status: 500 });
    }
  };
}
