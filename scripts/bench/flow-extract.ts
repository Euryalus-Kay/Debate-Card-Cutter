/**
 * Flow extraction benchmark (Phase G gate: recall ≥ 95%): synthetic typed notes of their speeches (messy
 * shorthand, as a debater types while listening) with the arguments a good flow must contain, per line.
 * Each case runs extract_flow with the real model on a fresh development round. Counts only in <out.json>.
 *
 *   npx tsx --env-file=.env.local scripts/bench/flow-extract.ts <teamId> <out.json>
 */
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { teamMembers } from "@/server/db/schema";
import { createRound, RoundInput } from "@/server/rounds";
import { applyServerChange, loadDoc } from "@/server/docs/store";
import { heardLines, heardText, readGraph } from "@/shared/round-doc";
import { extractFlow } from "@/server/ai/ops";
import type { SpeechId } from "@/domain/format";

// SYNTHETIC notes (invented speeches). gold: per line (1-based), the arguments it holds, each as keywords (any one matches).
const CASES: { name: string; speech: SpeechId; notes: string; gold: Record<number, string[][]> }[] = [
  {
    name: "1NC shorthand",
    speech: "1NC",
    notes: `T establish — aff expands medicare, doesnt create a new program
violation: they amend existing law not establish
voters: limits and neg ground
Deficits DA
1. CBO - M4A costs 32T over 10 yrs
2. link - taxes or borrowing, both spike interest rates
3. impact - fiscal crisis causes recession
States CP - 50 states each est single payer, solves bc states already run medicaid
Cap K - health reform stabilizes capitalism, commodification is the root cause, alt: reject the aff
case - no solvency, doctor shortage means longer wait times`,
    gold: { 1: [["establish", "expands", "new program"]], 2: [["amend", "violation", "existing law"]], 3: [["limits", "ground", "voter"]], 5: [["32", "cbo", "cost"]], 6: [["interest", "taxes", "borrowing"]], 7: [["crisis", "recession"]], 8: [["states", "50", "medicaid"]], 9: [["capitalism", "commodif"], ["reject", "alt"]], 10: [["shortage", "wait", "solvency"]] },
  },
  {
    name: "2NC line-by-line",
    speech: "2NC",
    notes: `2nc deficits
ov: DA outweighs case - faster and bigger
their 1 non-u — wrong, deficits r bad now but plan is 32T more = brink
their 2 link turn: admin savings - doesn't offset, CBO still says net cost
their 3 no impact — empirics: 2008 crisis
extend CBO
states cp
perm do both - severs federal action, links to NB
perm do cp — intrinsic, adds states
solv def ERISA: states can get a waiver — cross apply Brown from the 1nc`,
    gold: { 2: [["outweigh", "faster", "bigger"]], 3: [["brink", "32", "non-u", "non-unique"]], 4: [["admin", "offset", "net cost"]], 5: [["2008", "empiric", "impact"]], 6: [["cbo", "extend"]], 8: [["sever", "perm do both"]], 9: [["intrinsic", "perm do cp"]], 10: [["erisa", "waiver"]] },
  },
  {
    name: "1NR case and K",
    speech: "1NR",
    notes: `case: advantage 1 - coverage
1. alt cause: underinsurance from high deductibles persists
2. no internal link: coverage doesnt = health outcomes - oregon experiment
3. turn: wait times kill (canada)
cap k - fw: judge is a critical intellectual
link: they save capitalism (Harvey)
perm: severs the alt`,
    gold: { 2: [["deductible", "underinsurance", "alt cause"]], 3: [["oregon", "outcomes", "internal link"]], 4: [["wait", "canada", "turn"]], 5: [["intellectual", "framework", "fw"]], 6: [["harvey", "save capitalism", "link"]], 7: [["sever", "perm"]] },
  },
];

const [teamId, out] = process.argv.slice(2);
const [m] = await db().select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
const rows: unknown[] = [];
let goldTotal = 0;
let goldHit = 0;
for (const c of CASES) {
  const { id: roundId, stateDocId } = await createRound(teamId, m.userId, RoundInput.parse({ ourSide: "aff", roundLabel: `bench flow ${c.name}` }));
  await applyServerChange(stateDocId, (doc) => heardText(doc, c.speech, "bench").insert(0, c.notes), { userId: m.userId, origin: "bench" });
  const t0 = Date.now();
  await extractFlow({ roundId, speech: c.speech, teamId, userId: m.userId } as never);
  const ms = Date.now() - t0;
  const { doc } = await loadDoc(stateDocId);
  const graph = readGraph(doc, "aff");
  const args = graph.args.filter((a) => a.speech === c.speech && a.provenance.type === "heard");
  const lines = heardLines(doc, c.speech);
  const unflowed = lines.filter((l) => l.status !== "flowed").length;
  // Which line each argument came from: its mark's line.
  const lineOf = (argId: string) => lines.find((l) => l.markIds.some((mid) => (doc.getMap("heard_marks").get(mid) as { argIds?: string[] } | undefined)?.argIds?.includes(argId)))?.line;
  let hit = 0;
  let total = 0;
  const missed: string[] = [];
  const used = new Set<string>();
  for (const [lineStr, groups] of Object.entries(c.gold)) {
    const line = Number(lineStr) - 1;
    for (const kws of groups) {
      total++;
      const match = args.find((a) => !used.has(a.id) && (lineOf(a.id) === line || lineOf(a.id) === undefined) && kws.some((k) => `${a.text} ${a.label ?? ""}`.toLowerCase().includes(k.toLowerCase())));
      if (match) {
        hit++;
        used.add(match.id);
      } else missed.push(`line ${lineStr}: ${kws.join("/")}`);
    }
  }
  goldTotal += total;
  goldHit += hit;
  const row = { case: c.name, lines: c.notes.split("\n").length, gold: total, found: hit, recall: +(hit / total).toFixed(3), extracted: args.length, unflowedLines: unflowed, positions: graph.positions.map((p) => p.name), ms, missed };
  console.log(JSON.stringify(row));
  rows.push(row);
}
const summary = { recall: +(goldHit / goldTotal).toFixed(3), gold: goldTotal, found: goldHit };
console.log("TOTAL", JSON.stringify(summary));
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Synthetic notes; counts only.", summary, rows }, null, 2));
