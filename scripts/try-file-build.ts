/**
 * A real file build (Phase E/F) with the real models, run in this process against the development database:
 * plan → print the outline → approve only the first N cards (cost control) → build → summary. Saves counts
 * to <out.json> and the Word file to <docx path> (outside the repo).
 *
 *   npx tsx --env-file=.env.local scripts/try-file-build.ts <teamId> <kind> "<argument>" <keepCards> <out.json> <file.docx>
 */
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { jobs, telemetry } from "@/server/db/schema";
import { approveFileBuild, assemble, createFileBuild, runFileBuild, type BuildCheckpoint } from "@/server/files/build-job";
import { getCards } from "@/server/cards";
import { buildDocx } from "@/server/export/docx-writer";
import { gt } from "drizzle-orm";

const [teamId, kind, argument, keep, out, docxPath] = process.argv.slice(2);
const RES = "Resolved: The United States federal government should establish national health insurance in the United States.";
const t0 = new Date();
const [creator] = await db().select({ createdBy: jobs.createdBy }).from(jobs).where(eq(jobs.teamId, teamId)).limit(1);
const id = await createFileBuild(teamId, creator?.createdBy ?? "", { kind: kind as never, argument, resolution: RES, maxCards: 16 });
const ms0 = Date.now();
await runFileBuild(id);
const planMs = Date.now() - ms0;
const job = async () => (await db().select().from(jobs).where(eq(jobs.id, id)))[0];
let j = await job();
const cp = j.checkpoint as BuildCheckpoint;
if (!cp.plan) throw new Error(`no plan: ${j.status} ${j.error}`);
console.log(`PLAN (${Math.round(planMs / 1000)} s): ${cp.plan.title}\n  notes: ${cp.plan.notes}`);
for (const s of cp.plan.sections) {
  console.log(`## ${s.heading} [${s.speech}]`);
  for (const b of s.blocks) {
    console.log(`  ### ${b.heading}`);
    for (const it of b.items) console.log(`    - ${it.kind === "card" ? "CARD" : it.kind === "text" ? "TEXT" : "ANALYTIC"}: ${it.label}${it.text ? ` — ${it.text}` : ""}${it.search ? `   [look for: ${it.search}]` : ""}`);
  }
}
const keepN = Number(keep);
const removed = cp.items.slice(keepN).map((i) => i.key);
await approveFileBuild(teamId, id, removed);
const ms1 = Date.now();
for (let i = 0; i < 20; i++) {
  j = await job();
  if (!["queued", "running"].includes(j.status)) break;
  await runFileBuild(id);
}
j = await job();
const fin = j.checkpoint as BuildCheckpoint;
console.log(`\nBUILD ${j.status} in ${Math.round((Date.now() - ms1) / 1000)} s:`, JSON.stringify(j.result));
for (const it of fin.items.filter((i) => i.status !== "removed")) console.log(`  ${it.status.padEnd(9)} ${it.label}${it.note ? ` (${it.note.slice(0, 100)})` : ""}`);
const cards = await getCards(teamId, fin.items.map((i) => i.cardId).filter((x): x is string => !!x));
writeFileSync(docxPath, buildDocx(assemble(fin, cards).nodes, { title: fin.plan!.title }));
const tel = await db().select().from(telemetry).where(gt(telemetry.createdAt, t0));
const plan = fin.plan!;
const stats = {
  sections: plan.sections.length,
  blocks: plan.sections.reduce((a, s) => a + s.blocks.length, 0),
  cardItems: plan.sections.reduce((a, s) => a + s.blocks.reduce((b, k) => b + k.items.filter((i) => i.kind === "card").length, 0), 0),
  analytics: plan.sections.reduce((a, s) => a + s.blocks.reduce((b, k) => b + k.items.filter((i) => i.kind === "analytic").length, 0), 0),
  textItems: plan.sections.reduce((a, s) => a + s.blocks.reduce((b, k) => b + k.items.filter((i) => i.kind === "text").length, 0), 0),
  speeches: [...new Set(plan.sections.map((s) => s.speech))],
};
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Counts only.", kind, planMs, stats, kept: keepN, status: j.status, result: j.result, aiCalls: tel.filter((t) => t.kind === "ai").length }, null, 2));
