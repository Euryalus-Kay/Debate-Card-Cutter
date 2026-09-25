/**
 * Opponent memory: what a team ran against us before (positions on the flow of earlier rounds against the
 * same opponent code, or the same school when there's no code). For pre-round prep; read-only.
 */

import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { loadDoc } from "@/server/docs/store";
import { readGraph } from "@/shared/round-doc";
import { POSITION_KIND_LABEL } from "@/domain/flow";

export interface PastRound {
  roundId: string;
  tournament: string;
  roundLabel: string;
  when: string;
  /** the opponent's side in that round */
  theirSide: "aff" | "neg";
  positions: { name: string; kind: string; args: number; cites: string[] }[];
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export async function opponentHistory(roundId: string): Promise<{ opponent: string; rounds: PastRound[] }> {
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) return { opponent: "", rounds: [] };
  const opp = (round.opponent ?? {}) as { code?: string; school?: string };
  const code = norm(opp.code);
  const school = norm(opp.school);
  if (!code && !school) return { opponent: "", rounds: [] };
  const others = await db().select().from(rounds).where(and(eq(rounds.teamId, round.teamId), ne(rounds.id, roundId))).orderBy(desc(rounds.createdAt)).limit(200);
  const same = others.filter((r) => {
    const o = (r.opponent ?? {}) as { code?: string; school?: string };
    return code ? norm(o.code) === code : !norm(o.code) && norm(o.school) === school;
  });
  const out: PastRound[] = [];
  for (const r of same.slice(0, 8)) {
    try {
      const { doc } = await loadDoc(r.stateDocId);
      const graph = readGraph(doc, r.ourSide);
      const theirSide = r.ourSide === "aff" ? "neg" : "aff";
      const positions = graph.positions
        .filter((p) => p.side === theirSide)
        .map((p) => {
          const args = graph.args.filter((a) => a.positionId === p.id && a.side === theirSide);
          return { name: p.name, kind: POSITION_KIND_LABEL[p.kind] ?? p.kind, args: args.length, cites: [...new Set(args.flatMap((a) => a.cites ?? []))].slice(0, 6) };
        })
        .filter((p) => p.args > 0);
      out.push({ roundId: r.id, tournament: r.tournament, roundLabel: r.roundLabel, when: r.createdAt.toISOString(), theirSide, positions });
    } catch {
      /* a round whose flow can't be read is skipped */
    }
  }
  return { opponent: opp.code || opp.school || "", rounds: out };
}
