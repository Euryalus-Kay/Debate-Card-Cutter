/**
 * Import files into a team's library the way the app's Import button does: each file goes to private Blob
 * storage under the team's incoming path, then the same import job splits it into cards, saves its analytics
 * by block, and labels the cards. Runs each job to the end here, so it needs no deployment to continue it.
 *
 *   npx tsx --env-file=.env.local scripts/import-files.ts <teamId> <file.docx>...
 *
 * Prints counts only (no card text).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { jobs, teamMembers } from "@/server/db/schema";
import { createImportJob, runImportJob } from "@/server/library/import-job";

const [teamId, ...files] = process.argv.slice(2);
if (!teamId || !files.length) {
  console.error("usage: import-files.ts <teamId> <file>...");
  process.exit(1);
}
const [member] = await db().select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
if (!member) throw new Error(`team ${teamId} has no members`);

const totals = { files: 0, created: 0, duplicates: 0, variants: 0, analytics: 0, blocks: 0, labeled: 0 };
for (const path of files) {
  const name = basename(path);
  const bytes = readFileSync(path);
  const safe = name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
  const pathname = `teams/${teamId}/incoming/${randomUUID()}-${safe}`;
  await put(pathname, bytes, { access: "private", addRandomSuffix: false, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const jobId = await createImportJob(teamId, member.userId, { pathname, fileName: name, size: bytes.byteLength, labels: [], label: true });
  const t0 = Date.now();
  let job = null as null | typeof jobs.$inferSelect;
  for (let run = 0; run < 30; run++) {
    await runImportJob(jobId);
    [job] = await db().select().from(jobs).where(eq(jobs.id, jobId));
    if (!["queued", "running"].includes(job.status)) break;
  }
  const r = (job?.result ?? {}) as Record<string, number>;
  totals.files++;
  for (const k of ["created", "duplicates", "variants", "analytics", "blocks", "labeled"] as const) totals[k] += r[k] ?? 0;
  console.log(`${name.slice(0, 48).padEnd(48)} ${job?.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${r.created ?? 0} new cards, ${r.duplicates ?? 0} duplicates, ${r.variants ?? 0} variants, ${r.blocks ?? 0} analytic blocks, ${r.labeled ?? 0} labeled${job?.error ? ` — ${job.error}` : ""}`);
}
console.log(JSON.stringify(totals));
process.exit(0);
