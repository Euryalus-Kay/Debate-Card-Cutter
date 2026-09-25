/**
 * Build the 2026–27 starter files (Phase F) with the real models, in this process against the development
 * database: each file is planned, approved in full, built (library first, then research), and exported as
 * a Verbatim Word file to <outDir>. Counts and spend go to <out.json>. Specs follow the topic brief's
 * recommended set (docs/research/topic-nhi.md §6).
 *
 *   npx tsx --env-file=.env.local scripts/build-starter-set.ts <teamId> <outDir> <out.json> [onlyTitle]
 */
import { writeFileSync } from "node:fs";
import { eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { jobs, teamMembers, telemetry } from "@/server/db/schema";
import { approveFileBuild, assemble, createFileBuild, runFileBuild, type BuildCheckpoint, type FileBuildInput } from "@/server/files/build-job";
import { getCards } from "@/server/cards";
import { buildDocx } from "@/server/export/docx-writer";
import { costOf } from "@/server/ai/cost";

const RES = "Resolved: The United States federal government should establish national health insurance in the United States.";
const SPECS: FileBuildInput[] = [
  { kind: "aff", resolution: RES, maxCards: 16, argument: "Single payer: the United States federal government should establish single-payer national health insurance. Advantage 1 — Coverage and lives: tens of millions are uninsured or underinsured, and coverage losses are growing after the enhanced ACA subsidies expired; lack of coverage causes preventable deaths. Advantage 2 — Costs and medical debt: administrative waste and medical debt drive financial ruin; a single payer cuts administrative costs and ends medical debt." },
  { kind: "t", resolution: RES, maxCards: 8, argument: "T — National health insurance means single payer: 'national health insurance' is a government-run single-payer program covering everyone; public options, ACA expansions, subsidies and multi-payer plans are not topical. Include sub-shells for T–universal (covers all residents) and T–establish (create a new program, not expand one)." },
  { kind: "da", resolution: RES, maxCards: 12, argument: "Deficits and taxes DA: national health insurance costs trillions of new federal spending; financing it means huge tax increases or more borrowing on top of record deficits and debt, raising interest rates and risking a fiscal crisis that slows the economy." },
  { kind: "da", resolution: RES, maxCards: 10, argument: "Pharma innovation DA: national health insurance uses its buying power to cut drug prices and payments, which reduces pharmaceutical revenue and R&D investment, slowing new cures." },
  { kind: "cp", resolution: RES, maxCards: 10, argument: "Universal coverage CP: expand the ACA with automatic enrollment and permanent enhanced subsidies to reach universal coverage without single payer, keeping private insurance; the net benefit is the deficits and taxes DA." },
  { kind: "k", resolution: RES, maxCards: 12, argument: "Capitalism K: the aff's health reform stabilizes capitalism by making workers healthier and cheaper to maintain, while commodified health care under capitalism remains the root cause of illness and inequality; the alternative is to reject capitalism and organize for decommodified care." },
  { kind: "answers", side: "aff", resolution: RES, maxCards: 6, argument: "States CP: the fifty states should each establish single-payer or universal health insurance programs. Answer it for our single-payer aff: states lack the money and can't borrow during downturns, federal ERISA preemption blocks state single payer, state efforts (Vermont, California, Oregon) failed or stalled, and a patchwork can't coordinate; perms first." },
];

const [teamId, outDir, outJson, only] = process.argv.slice(2);
const [m] = await db().select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
const results: unknown[] = [];
for (const spec of SPECS) {
  const t0 = new Date();
  const id = await createFileBuild(teamId, m.userId, spec);
  await runFileBuild(id);
  let j = (await db().select().from(jobs).where(eq(jobs.id, id)))[0];
  if (j.status !== "awaiting_approval") {
    results.push({ kind: spec.kind, status: j.status, error: j.error });
    continue;
  }
  const title = (j.checkpoint as BuildCheckpoint).plan!.title;
  if (only && !title.toLowerCase().includes(only.toLowerCase())) continue;
  console.log(`\n== ${title}: ${(j.checkpoint as BuildCheckpoint).items.length} cards planned`);
  await approveFileBuild(teamId, id, []);
  for (let i = 0; i < 40; i++) {
    j = (await db().select().from(jobs).where(eq(jobs.id, id)))[0];
    if (!["queued", "running"].includes(j.status)) break;
    await runFileBuild(id);
  }
  j = (await db().select().from(jobs).where(eq(jobs.id, id)))[0];
  const cp = j.checkpoint as BuildCheckpoint;
  const cards = await getCards(teamId, cp.items.map((i) => i.cardId).filter((x): x is string => !!x));
  const file = `${outDir}/${title.replace(/[\\/:*?"<>|]+/g, "-")}.docx`;
  writeFileSync(file, buildDocx(assemble(cp, cards).nodes, { title }));
  const tel = await db().select().from(telemetry).where(gt(telemetry.createdAt, t0));
  const usd = tel.reduce((a, r) => {
    const d = r.data as { usage?: Parameters<typeof costOf>[1]; searches?: number } | null;
    return a + (costOf(r.name.split(":")[1] ?? "", d?.usage) ?? 0) + (d?.searches ?? 0) * 0.01;
  }, 0);
  const plan = cp.plan!;
  const row = {
    title,
    kind: spec.kind,
    status: j.status,
    minutes: +((Date.now() - t0.getTime()) / 60000).toFixed(1),
    usd: +usd.toFixed(2),
    sections: plan.sections.length,
    blocks: plan.sections.reduce((a, s) => a + s.blocks.length, 0),
    analytics: plan.sections.reduce((a, s) => a + s.blocks.reduce((b, k) => b + k.items.filter((x) => x.kind !== "card").length, 0), 0),
    ...(j.result as object),
  };
  console.log(JSON.stringify(row));
  results.push(row);
  writeFileSync(outJson, JSON.stringify({ at: new Date().toISOString(), note: "Counts and spend only; the files are outside the repository.", results }, null, 2));
}
