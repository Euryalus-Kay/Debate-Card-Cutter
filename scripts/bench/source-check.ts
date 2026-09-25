/**
 * Imported cards checked against their live sources (B4), in this process against the development
 * database: how many verify, don't match, or can't be read. Counts only in <out.json>.
 *   npx tsx --env-file=.env.local scripts/bench/source-check.ts <teamId> <out.json>
 */
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards, jobs, teamMembers } from "@/server/db/schema";
import { createCheckJob, runCheckJob, type CheckCheckpoint } from "@/server/library/check-job";

const [teamId, out] = process.argv.slice(2);
const [member] = await db().select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
const r = await createCheckJob(teamId, member.userId);
if (!r) throw new Error("nothing to check");
const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  await runCheckJob(r.jobId);
  const [j] = await db().select().from(jobs).where(eq(jobs.id, r.jobId));
  if (!["queued", "running"].includes(j.status)) break;
}
const [j] = await db().select().from(jobs).where(eq(jobs.id, r.jobId));
const cp = j.checkpoint as CheckCheckpoint;
console.log(JSON.stringify(j.result), `${Math.round((Date.now() - t0) / 1000)} s`);
for (const d of cp.done.filter((x) => x.outcome === "mismatch").slice(0, 8)) {
  const [c] = await db().select({ v: cards.verification, url: cards.citation }).from(cards).where(eq(cards.id, d.cardId));
  const issues = ((c.v as { issues?: { code: string; message: string }[] }).issues ?? []).map((i) => i.code);
  console.log("mismatch:", (c.url as { url?: string }).url?.slice(0, 80), issues.slice(0, 4).join(","));
}
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Counts only.", result: j.result, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
