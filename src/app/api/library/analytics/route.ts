import { and, desc, eq, sql } from "drizzle-orm";
import { handle, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { analyticsBank, rounds } from "@/server/db/schema";

/** The team's analytics bank: blocks from imported files and answers from delivered speeches, newest first. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const rows = await db()
    .select({
      id: analyticsBank.id,
      title: analyticsBank.title,
      position: analyticsBank.position,
      speech: analyticsBank.speech,
      side: analyticsBank.side,
      answers: analyticsBank.answers,
      analytic: analyticsBank.analytic,
      cites: analyticsBank.cites,
      source: analyticsBank.source,
      roundId: analyticsBank.roundId,
      tournament: rounds.tournament,
      roundLabel: rounds.roundLabel,
      createdAt: analyticsBank.createdAt,
    })
    .from(analyticsBank)
    .leftJoin(rounds, eq(rounds.id, analyticsBank.roundId))
    .where(and(eq(analyticsBank.teamId, teamId), q ? sql`${analyticsBank.search} @@ websearch_to_tsquery('english', ${q})` : undefined))
    .orderBy(q ? sql`ts_rank_cd(${analyticsBank.search}, websearch_to_tsquery('english', ${q})) desc` : desc(analyticsBank.createdAt))
    .limit(150);
  return Response.json({ entries: rows });
});
