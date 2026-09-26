/**
 * Importing a big evidence file into the library as a durable job (Phase B1).
 * The browser uploads the file straight to Vercel Blob (up to 50 MB); this job
 * reads it from there and, checkpointing after every step so it survives
 * timeouts and deploys:
 *   1. parses it (Verbatim styles give cards directly);
 *   2. for unstyled files (Google Docs exports, PDFs, text), has a cheap model
 *      label paragraphs so code can build cards from the file's own words;
 *   3. saves the file's structure and imports its cards in batches (skipping
 *      duplicates, keeping near-duplicates as variants);
 *   4. labels the new cards (side, argument type, position, role, claim).
 * Each run works for up to four minutes; the next status poll resumes it.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { ingest, readPrivateBlob, sniffKind, storeParsedUpload, type IngestResult } from "@/server/uploads";
import { structureDocument, type ImportedCard } from "@/server/ingest/structure";
import { importCardsBatch } from "@/server/cards";
import type { BodyBlock } from "@/domain/card";
import { applyLabels, CHUNK, needsSegmentation, segmentChunk, type LabelRuns } from "./segment";
import { continueJob } from "@/server/jobs/continue";
import { labelAndSave } from "./label";
import { saveImportedAnalytics } from "./analytics-import";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const LEASE_SECONDS = 90;
const RUN_BUDGET_MS = 240_000;
const PARALLEL = 3;
const LABEL_BATCH = 25;

export const ImportInput = z.object({
  pathname: z.string().min(1).max(600),
  fileName: z.string().min(1).max(300),
  size: z.number().int().positive().max(MAX_IMPORT_BYTES),
  labels: z.array(z.string().max(80)).max(10).default([]),
  /** label new cards with the model (small cost); off keeps imports free */
  label: z.boolean().default(true),
});
export type ImportInput = z.infer<typeof ImportInput>;

export interface ImportCheckpoint {
  stage: "read" | "segment" | "import" | "label" | "done";
  kind?: string;
  quality?: IngestResult["quality"];
  ai?: { total: number; done: number; runs: LabelRuns };
  uploadId?: string;
  created?: string[];
  duplicates?: number;
  variants?: number;
  analytics?: number;
  /** analytic blocks added to the analytics bank */
  blocks?: number;
  labeled?: number;
  warnings: string[];
}

export function importProgress(cp: ImportCheckpoint) {
  const created = cp.created?.length ?? 0;
  return [
    { stage: "read", status: cp.stage === "read" ? "running" : "done", detail: cp.quality ? `${cp.quality.paragraphs} paragraphs` : "" },
    ...(cp.ai ? [{ stage: "split", status: cp.stage === "segment" ? "running" : "done", detail: `${cp.ai.done} of ${cp.ai.total} parts split into cards` }] : []),
    { stage: "import", status: cp.stage === "import" ? "running" : ["label", "done"].includes(cp.stage) ? "done" : "pending", detail: cp.created ? `${created} new cards, ${cp.duplicates ?? 0} already in the library, ${cp.variants ?? 0} variants${cp.blocks ? `; ${cp.blocks} blocks of analytics saved for drafts` : ""}` : "" },
    { stage: "label", status: cp.stage === "label" ? "running" : cp.stage === "done" ? "done" : "pending", detail: cp.created ? `${cp.labeled ?? 0} of ${created} labeled` : "" },
  ];
}

export async function createImportJob(teamId: string, userId: string, input: ImportInput): Promise<string> {
  const id = newId("job");
  await db()
    .insert(jobs)
    .values({ id, teamId, kind: "library_import", status: "queued", input, checkpoint: { stage: "read", warnings: [] } satisfies ImportCheckpoint, progress: [], idempotencyKey: `import:${input.pathname}`, createdBy: userId })
    .onConflictDoNothing();
  const [row] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.idempotencyKey, `import:${input.pathname}`)))
    .limit(1);
  return row.id;
}

export async function getImportJob(teamId: string, jobId: string) {
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.id, jobId), eq(jobs.kind, "library_import")))
    .limit(1);
  if (!job) return null;
  const stale = job.status === "running" || job.status === "queued" ? !job.leaseUntil || job.leaseUntil.getTime() < Date.now() : false;
  return { job, needsRunner: stale };
}

export async function listImportJobs(teamId: string, limit = 30) {
  return db()
    .select({ id: jobs.id, status: jobs.status, input: jobs.input, progress: jobs.progress, result: jobs.result, error: jobs.error, createdAt: jobs.createdAt, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "library_import")))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
}

async function lease(jobId: string) {
  const rows = await db()
    .update(jobs)
    .set({ status: "running", leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, heartbeatAt: sql`now()`, attempts: sql`${jobs.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.kind, "library_import"), sql`${jobs.status} in ('queued','running')`, sql`(${jobs.leaseUntil} is null or ${jobs.leaseUntil} < now())`, eq(jobs.cancelRequested, false)))
    .returning();
  return rows[0] ?? null;
}

/** Run with at most `n` at a time, in order. */
async function pool<T>(n: number, items: T[], fn: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function runImportJob(jobId: string): Promise<void> {
  const job = await lease(jobId);
  if (!job) return;
  const started = Date.now();
  const input = ImportInput.parse(job.input);
  const teamId = job.teamId;
  const userId = job.createdBy ?? "";
  const cp = job.checkpoint as ImportCheckpoint;
  const controller = new AbortController();
  const outOfTime = () => Date.now() - started > RUN_BUDGET_MS || controller.signal.aborted;

  let writing: Promise<void> = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      const [row] = await db()
        .update(jobs)
        .set({ checkpoint: cp, progress: importProgress(cp), heartbeatAt: sql`now()`, leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: new Date() })
        .where(eq(jobs.id, jobId))
        .returning();
      if (row?.cancelRequested) controller.abort();
    });
    return writing;
  };
  const finish = async (status: "succeeded" | "failed" | "cancelled", error?: string) => {
    await writing;
    await db()
      .update(jobs)
      .set({
        status,
        error: error ?? null,
        checkpoint: cp,
        progress: importProgress(cp),
        leaseUntil: null,
        result: { uploadId: cp.uploadId ?? null, created: cp.created?.length ?? 0, duplicates: cp.duplicates ?? 0, variants: cp.variants ?? 0, analytics: cp.analytics ?? 0, blocks: cp.blocks ?? 0, labeled: cp.labeled ?? 0, warnings: cp.warnings },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  };
  const pause = async () => {
    await writing;
    await db().update(jobs).set({ checkpoint: cp, progress: importProgress(cp), leaseUntil: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    // Keep going without anyone watching: the next run starts now (polling would also resume it).
    await continueJob(jobId, job.attempts);
  };

  try {
    // Every run re-reads the file from storage (parsing is quick next to the model calls).
    const bytes = await readPrivateBlob(input.pathname);
    const kind = sniffKind(bytes, input.fileName);
    if (!kind) throw new Error("Unsupported file. Upload .docx, .pdf, or text (legacy .doc files must be re-saved as .docx).");
    const parsed = await ingest(bytes, input.fileName, kind);

    if (cp.stage === "read") {
      cp.kind = kind;
      cp.quality = parsed.quality;
      cp.warnings = parsed.warnings.slice(0, 20);
      const split = needsSegmentation(parsed.quality, parsed.structure.styled, kind);
      if (split) cp.ai = { total: Math.ceil(parsed.paragraphs.length / CHUNK), done: 0, runs: [] };
      cp.stage = split ? "segment" : "import";
      await persist();
    }

    if (cp.stage === "segment" && cp.ai) {
      const ai = cp.ai;
      const todo = Array.from({ length: ai.total - ai.done }, (_, k) => ai.done + k);
      const results = new Map<number, LabelRuns>();
      await pool(PARALLEL, todo, async (c) => {
        if (outOfTime()) return;
        results.set(c, await segmentChunk(parsed.paragraphs, c * CHUNK, Math.min(parsed.paragraphs.length - 1, (c + 1) * CHUNK - 1), { teamId, abortSignal: controller.signal }));
        // Commit finished chunks in order so a resumed run knows exactly where to start.
        while (results.has(ai.done)) {
          ai.runs.push(...results.get(ai.done)!);
          results.delete(ai.done);
          ai.done++;
        }
        await persist();
      });
      if (ai.done < ai.total) return void (await pause());
      cp.stage = "import";
      await persist();
    }

    if (cp.stage === "import") {
      let result = parsed;
      if (cp.ai) {
        const labeled = applyLabels(parsed.paragraphs, cp.ai.runs);
        const structure = structureDocument(labeled.paragraphs, { cites: labeled.cites, junk: labeled.junk });
        result = { ...parsed, paragraphs: labeled.paragraphs, structure, quality: { ...parsed.quality, ...structure.counts } };
      }
      const uploadId = cp.uploadId ?? newId("upl");
      if (!cp.uploadId) {
        await storeParsedUpload({ id: uploadId, teamId, userId, purpose: "library_file", fileName: input.fileName, bytes, mime: kind, kind, result, blobPath: input.pathname });
        cp.uploadId = uploadId;
        await persist();
      }
      const items = result.structure.items
        .map((it, blockIdx) => ({ it, blockIdx }))
        .filter((x): x is { it: ImportedCard; blockIdx: number } => x.it.kind === "card" && x.it.body.length > 0)
        .map(({ it, blockIdx }) => ({ blockIdx, tag: it.tag, citation: it.citation, body: it.body as BodyBlock[], path: it.path }));
      const label = input.labels.length ? input.labels : [input.fileName.replace(/\.(docx|pdf|txt)$/i, "")];
      const r = await importCardsBatch({ teamId, userId, uploadId, fileName: input.fileName, labels: label, items });
      cp.created = r.created;
      cp.duplicates = r.duplicates;
      cp.variants = r.variants;
      cp.analytics = result.structure.counts.analytics;
      cp.blocks = await saveImportedAnalytics({ teamId, uploadId, fileName: input.fileName, items: result.structure.items });
      cp.labeled = 0;
      cp.stage = input.label && r.created.length ? "label" : "done";
      await persist();
    }

    if (cp.stage === "label") {
      const ids = cp.created ?? [];
      const base = cp.labeled ?? 0;
      const batches: string[][] = [];
      for (let i = base; i < ids.length; i += LABEL_BATCH) batches.push(ids.slice(i, i + LABEL_BATCH));
      let leading = 0;
      const finished = new Set<number>();
      await pool(PARALLEL, batches.map((_, i) => i), async (b) => {
        if (outOfTime()) return;
        const batch = batches[b];
        const first = ids.indexOf(batch[0]);
        await labelAndSave(teamId, batch, { abortSignal: controller.signal, fileName: input.fileName, before: first > 0 ? ids[first - 1] : undefined });
        // Progress counts only batches finished without a gap before them, so a resumed run redoes nothing twice.
        finished.add(b);
        while (finished.has(leading)) leading++;
        cp.labeled = Math.min(ids.length, base + leading * LABEL_BATCH);
        await persist();
      });
      if ((cp.labeled ?? 0) < ids.length) return void (await pause());
      cp.stage = "done";
    }

    await finish(controller.signal.aborted ? "cancelled" : "succeeded");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (controller.signal.aborted) return void (await finish("cancelled"));
    // Model hiccups are retried by the next run; a file that can't be read fails for good.
    if (job.attempts >= 6 || /Unsupported file|couldn't be read|Could not read/.test(message)) await finish("failed", message);
    else await pause();
  }
}
