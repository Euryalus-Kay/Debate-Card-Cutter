/**
 * Cut real cards for a library review's gaps: one research job per card the review asks for (web search, the
 * page read, the card cut from it and checked word for word), then a Verbatim file of the cards, grouped by
 * gap. Claims no source supports stay uncut and are listed; nothing is written from memory.
 *
 *   npx tsx --env-file=.env.local scripts/cut-gap-cards.ts <teamId> <review.json> <out.docx> [priorityMax=1] [idea titles…]
 */
import { writeFileSync } from "node:fs";
import { eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { jobs, teamMembers, telemetry } from "@/server/db/schema";
import { createResearchJob, runResearchJob } from "@/server/research/jobs";
import { getCards } from "@/server/cards";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";
import { fullCite, shortCite } from "@/domain/citation";
import { costOf } from "@/server/ai/cost";
import type { GapReview } from "@/server/library/gaps";
import type { CardUse } from "@/domain/card-use";

const [teamId, reviewPath, outFile, maxPriority = "1", ...ideaTitles] = process.argv.slice(2);
const { review } = JSON.parse((await import("node:fs")).readFileSync(reviewPath, "utf8")) as { review: GapReview };
const [member] = await db().select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
const t0 = new Date();

interface Want {
  group: string;
  side: "aff" | "neg";
  claim: string;
  context: string;
  use: CardUse;
}
const wants: Want[] = [];
for (const g of review.gaps.filter((g) => g.priority <= Number(maxPriority))) {
  for (const c of g.cards) {
    if (/no card needed/i.test(c.source)) continue;
    // Aff frontlines are 2AC cards; a neg shell's cards are 1NC cards; other neg cards go in the block.
    const use: CardUse = g.side === "aff" ? "2AC" : /shell|T-|topicality/i.test(g.title) ? "1NC" : "block";
    wants.push({ group: `${g.side.toUpperCase()} — ${g.title}`, side: g.side, claim: c.claim, context: `${g.title}. ${g.why} Look in: ${c.source}.`, use });
  }
}
for (const d of review.ideas.filter((d) => ideaTitles.some((t) => d.title.toLowerCase().includes(t.toLowerCase())))) {
  for (const c of d.firstCards) wants.push({ group: `${d.side.toUpperCase()} — ${d.title}`, side: d.side, claim: c.claim, context: `${d.title}: ${d.pitch} Look in: ${c.source}.`, use: d.side === "aff" ? "2AC" : "1NC" });
}
console.log(`${wants.length} cards to look for`);

const got: { want: Want; cardIds: string[]; status: string; summary: string }[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < wants.length) {
      const w = wants[next++];
      const id = await createResearchJob(teamId, member.userId, { claim: w.claim, context: w.context, search: true, maxCards: 1, use: w.use, side: w.side, labels: ["gap review", w.group.slice(0, 60)] });
      let job = null as null | typeof jobs.$inferSelect;
      for (let run = 0; run < 12; run++) {
        await runResearchJob(id);
        [job] = await db().select().from(jobs).where(eq(jobs.id, id));
        if (!["queued", "running"].includes(job.status)) break;
      }
      const result = (job?.result ?? {}) as { cardIds?: string[]; summary?: string };
      got.push({ want: w, cardIds: result.cardIds ?? [], status: job?.status ?? "?", summary: result.summary ?? job?.error ?? "" });
      console.log(`${job?.status?.padEnd(9)} ${w.claim.slice(0, 90)}`);
    }
  }),
);

// The file: one hat per gap, the cards in the order the review asked for them.
const nodes: ExportNode[] = [{ kind: "heading", level: 1, text: "NHI 2026–27 — cards for the library's gaps" }];
const cards = await getCards(teamId, got.flatMap((g) => g.cardIds));
for (const group of [...new Set(wants.map((w) => w.group))]) {
  nodes.push({ kind: "heading", level: 2, text: group });
  for (const g of got.filter((x) => x.want.group === group).sort((a, b) => wants.indexOf(a.want) - wants.indexOf(b.want))) {
    for (const c of cards.filter((c) => g.cardIds.includes(c.id))) nodes.push({ kind: "card", tag: c.tag, shortCite: shortCite(c.citation), fullCite: fullCite(c.citation), body: c.body });
    if (!g.cardIds.length) nodes.push({ kind: "analytic", text: `Card needed — ${g.want.claim} (no source found that says it; ${g.summary.slice(0, 160)})` });
  }
}
writeFileSync(outFile, buildDocx(nodes, { title: "NHI 2026–27 gap cards" }));
const tel = await db().select().from(telemetry).where(gt(telemetry.createdAt, t0));
const usd = tel.reduce((a, r) => {
  const d = r.data as { usage?: Parameters<typeof costOf>[1]; searches?: number } | null;
  return a + (costOf(r.name.split(":")[1] ?? "", d?.usage) ?? 0) + (d?.searches ?? 0) * 0.01;
}, 0);
console.log(JSON.stringify({ wanted: wants.length, cut: got.filter((g) => g.cardIds.length).length, notFound: got.filter((g) => !g.cardIds.length).length, usd: +usd.toFixed(2), minutes: +((Date.now() - t0.getTime()) / 60000).toFixed(1), file: outFile }));
process.exit(0);
