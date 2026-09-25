/**
 * Building a file (Phase E) as a durable job: plan → the team reviews the plan → each card is found (the
 * team's library first; else a research job cuts it from a real source for its speech and verifies it word
 * for word) → the file is assembled in Verbatim form and saved like an imported file: browsable in Files,
 * blocks insert into speeches, and a Word copy downloads. Cards that can't be found are listed as missing,
 * never written. Runs in steps it checkpoints; each run continues the next (src/server/jobs/continue.ts).
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { z } from "zod";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { getCards, type CardRow } from "@/server/cards";
import { storeParsedUpload } from "@/server/uploads";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";
import { findEvidence } from "@/server/library/find";
import { createResearchJob, runResearchJob } from "@/server/research/jobs";
import { continueJob } from "@/server/jobs/continue";
import { monthSpendUsd, teamCapUsd } from "@/server/limits";
import { fullCite, shortCite } from "@/domain/citation";
import type { BodyBlock, BodyText } from "@/domain/card";
import type { ImportedItem, StructuredDoc } from "@/server/ingest/structure";
import type { CardUse } from "@/domain/card-use";
import { FILE_KINDS, sideOf } from "./knowledge";
import { analyticLine, cardItems, planFile, type FilePlan } from "./plan";

export const FileBuildInput = z.object({
  kind: z.enum(FILE_KINDS),
  side: z.enum(["aff", "neg"]).optional(),
  argument: z.string().trim().min(3).max(1500),
  resolution: z.string().trim().max(500).default(""),
  target: z.string().trim().max(1000).optional(),
  maxCards: z.number().int().min(1).max(30).default(20),
  instructions: z.string().trim().max(1500).optional(),
});
export type FileBuildInput = z.infer<typeof FileBuildInput>;

export type BuildItemStatus = "pending" | "library" | "researching" | "cut" | "not_found" | "removed";

export interface BuildItem {
  /** "section.block.item" in the plan */
  key: string;
  use: CardUse;
  label: string;
  search: string;
  status: BuildItemStatus;
  cardId?: string;
  researchJobId?: string;
  note?: string;
}

export interface BuildCheckpoint {
  stage: "plan" | "review" | "fill" | "assemble" | "done";
  plan?: FilePlan;
  items: BuildItem[];
  uploadId?: string;
  fileName?: string;
}

const LEASE_SECONDS = 90;
const RUN_BUDGET_MS = 230_000;
const IN_FLIGHT = 4;
/** rough cost of one researched card (search, reading, cutting, checks) */
export const RESEARCH_COST_USD = 0.25;

export async function createFileBuild(teamId: string, userId: string, input: FileBuildInput): Promise<string> {
  const id = newId("job");
  await db().insert(jobs).values({ id, teamId, kind: "file_build", status: "queued", input, checkpoint: { stage: "plan", items: [] } satisfies BuildCheckpoint, progress: [], createdBy: userId });
  return id;
}

export async function getFileBuild(teamId: string, jobId: string) {
  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.teamId, teamId), eq(jobs.kind, "file_build")));
  if (!job) return null;
  const needsRunner = (job.status === "queued" || job.status === "running") && (!job.leaseUntil || job.leaseUntil.getTime() < Date.now());
  return { job, needsRunner };
}

export async function listFileBuilds(teamId: string) {
  return db()
    .select({ id: jobs.id, status: jobs.status, input: jobs.input, checkpoint: jobs.checkpoint, result: jobs.result, error: jobs.error, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "file_build")))
    .orderBy(desc(jobs.createdAt))
    .limit(20);
}

/** The team approves the plan (optionally without some cards); building starts. */
export async function approveFileBuild(teamId: string, jobId: string, removed: string[]): Promise<boolean> {
  const r = await getFileBuild(teamId, jobId);
  if (!r || r.job.status !== "awaiting_approval") return false;
  const cp = r.job.checkpoint as BuildCheckpoint;
  const drop = new Set(removed);
  cp.items = cp.items.map((i) => (drop.has(i.key) ? { ...i, status: "removed" as const } : i));
  cp.stage = "fill";
  const rows = await db()
    .update(jobs)
    .set({ status: "queued", checkpoint: cp, progress: progressOf(cp), updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "awaiting_approval")))
    .returning();
  return rows.length === 1;
}

export function progressOf(cp: BuildCheckpoint) {
  const live = cp.items.filter((i) => i.status !== "removed");
  const done = live.filter((i) => i.status === "library" || i.status === "cut" || i.status === "not_found").length;
  return [{ stage: cp.stage, done, total: live.length, library: live.filter((i) => i.status === "library").length, cut: live.filter((i) => i.status === "cut").length, missing: live.filter((i) => i.status === "not_found").length }];
}

async function lease(jobId: string) {
  const rows = await db()
    .update(jobs)
    .set({ status: "running", leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, heartbeatAt: sql`now()`, attempts: sql`${jobs.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.kind, "file_build"), sql`${jobs.status} in ('queued','running')`, sql`(${jobs.leaseUntil} is null or ${jobs.leaseUntil} < now())`, eq(jobs.cancelRequested, false)))
    .returning();
  return rows[0] ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runFileBuild(jobId: string): Promise<void> {
  const job = await lease(jobId);
  if (!job) return;
  const started = Date.now();
  const input = FileBuildInput.parse(job.input);
  const cp = job.checkpoint as BuildCheckpoint;
  const side = sideOf(input);
  const save = (extra: Record<string, unknown> = {}) =>
    db()
      .update(jobs)
      .set({ checkpoint: cp, progress: progressOf(cp), heartbeatAt: sql`now()`, leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: new Date(), ...extra })
      .where(eq(jobs.id, jobId));
  const cancelled = async () => (await db().select({ c: jobs.cancelRequested }).from(jobs).where(eq(jobs.id, jobId)))[0]?.c ?? false;
  const inProcess: Promise<void>[] = [];

  try {
    if (cp.stage === "plan") {
      const { plan } = await planFile(input, { teamId: job.teamId });
      cp.plan = plan;
      cp.items = cardItems(plan).map((c) => ({ key: `${c.section}.${c.block}.${c.item}`, use: c.use, label: c.label, search: c.search, status: "pending" as const }));
      cp.stage = "review";
      // Nothing is spent on research until the team approves the plan.
      await save({ status: "awaiting_approval", leaseUntil: null });
      return;
    }

    if (cp.stage === "fill") {
      const plan = cp.plan!;
      const where = (key: string) => {
        const [s, b] = key.split(".").map(Number);
        return `${plan.title} — ${plan.sections[s]?.heading ?? ""} — ${plan.sections[s]?.blocks[b]?.heading ?? ""}`;
      };
      while (Date.now() - started < RUN_BUDGET_MS) {
        if (await cancelled()) {
          await save({ status: "cancelled", leaseUntil: null, error: "Stopped." });
          return;
        }
        let changed = false;
        // Results of research already running.
        const researching = cp.items.filter((i) => i.status === "researching" && i.researchJobId);
        if (researching.length) {
          const rows = await db()
            .select({ id: jobs.id, status: jobs.status, result: jobs.result })
            .from(jobs)
            .where(inArray(jobs.id, researching.map((i) => i.researchJobId!)));
          for (const it of researching) {
            const r = rows.find((x) => x.id === it.researchJobId);
            if (!r || ["queued", "running"].includes(r.status)) continue;
            const res = (r.result ?? {}) as { cardIds?: string[]; summary?: string };
            // A new card identical to one already in the file (research found the same passage) counts as missing.
            const fresh = res.cardIds?.find((id) => !cp.items.some((x) => x !== it && x.cardId === id));
            if (r.status === "succeeded" && fresh) Object.assign(it, { status: "cut", cardId: fresh });
            else if (r.status === "succeeded" && res.cardIds?.length) Object.assign(it, { status: "not_found", note: "Research found only a card this file already uses." });
            else Object.assign(it, { status: "not_found", note: res.summary ?? `research ${r.status}` });
            changed = true;
          }
        }
        // Start more: the library first; research only for what it doesn't have.
        const slots = IN_FLIGHT - cp.items.filter((i) => i.status === "researching").length;
        for (const it of cp.items.filter((i) => i.status === "pending").slice(0, Math.max(0, slots))) {
          // A card already placed in this file isn't placed again: each item gets its own evidence.
          const placed = new Set(cp.items.map((x) => x.cardId).filter((x): x is string => !!x));
          const found = await findEvidence(job.teamId, [{ id: it.key, text: it.search ? `${it.label} (source: ${it.search})` : it.label, intent: "support" }], { side, perNeed: 8, maxCards: 1, exclude: placed });
          const best = found.cardIds[0];
          if (best && (found.byCard.get(best)?.[0]?.fit ?? 0) >= 3) {
            Object.assign(it, { status: "library", cardId: best, note: found.byCard.get(best)?.[0]?.use });
          } else if ((await monthSpendUsd(job.teamId)) >= (await teamCapUsd(job.teamId))) {
            // The month's AI budget ran out mid-build: the rest is reported missing, not researched.
            Object.assign(it, { status: "not_found", note: "Not researched: this month's AI budget is used up." });
          } else {
            const rid = await createResearchJob(job.teamId, job.createdBy ?? "", { claim: it.label, context: `${where(it.key)}. Look for: ${it.search || "the best qualified source"}`, maxCards: 1, search: true, use: it.use, side, labels: ["file"] }, `file:${jobId}:${it.key}`);
            Object.assign(it, { status: "researching", researchJobId: rid });
            // Its own run, in another function when deployed; here otherwise.
            if (!(await continueJob(rid, 0))) inProcess.push(runResearchJob(rid).catch(() => {}));
          }
          changed = true;
        }
        if (changed) await save();
        if (!cp.items.some((i) => i.status === "pending" || i.status === "researching")) {
          cp.stage = "assemble";
          await save();
          break;
        }
        await sleep(changed ? 500 : 4000);
      }
      if (cp.stage === "fill") {
        // Out of time for this run: research keeps going in its own jobs; the next run collects it.
        await Promise.all(inProcess);
        await save({ leaseUntil: null });
        await continueJob(jobId, job.attempts);
        return;
      }
    }

    if (cp.stage === "assemble") {
      await Promise.all(inProcess);
      const cards = await getCards(job.teamId, cp.items.map((i) => i.cardId).filter((x): x is string => !!x));
      const { nodes, structure } = assemble(cp, cards);
      const fileName = `${cp.plan!.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120)}.docx`;
      const bytes = buildDocx(nodes, { title: cp.plan!.title });
      const uploadId = newId("upl");
      let blobPath: string | null = null;
      try {
        const blob = await put(`teams/${job.teamId}/uploads/${uploadId}/${fileName.replace(/[^\w.\-]+/g, "_")}`, Buffer.from(bytes), { access: "private", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", addRandomSuffix: false });
        blobPath = blob.pathname;
      } catch {
        /* the file still works in Files without the Word copy */
      }
      const counts = { cards: structure.counts.cards, analytics: structure.counts.analytics, headings: structure.counts.headings };
      await storeParsedUpload({
        id: uploadId,
        teamId: job.teamId,
        userId: job.createdBy ?? "",
        purpose: "library_file",
        fileName,
        bytes,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind: "docx",
        result: { paragraphs: [], structure, warnings: [], quality: { characters: bytes.byteLength, paragraphs: 0, ...counts, formatted: true } },
        blobPath,
        attribution: { built: jobId, kind: input.kind },
      });
      cp.uploadId = uploadId;
      cp.fileName = fileName;
      cp.stage = "done";
      const live = cp.items.filter((i) => i.status !== "removed");
      await save({
        status: "succeeded",
        leaseUntil: null,
        result: { uploadId, fileName, cards: live.filter((i) => i.cardId).length, fromLibrary: live.filter((i) => i.status === "library").length, researched: live.filter((i) => i.status === "cut").length, missing: live.filter((i) => i.status === "not_found").map((i) => i.label) },
      });
    }
  } catch (e) {
    await Promise.all(inProcess);
    await save({ status: "failed", leaseUntil: null, error: (e as Error).message.slice(0, 500) });
  }
}

/** The file in Verbatim order: H1 title, file notes, H2 sections, H3 blocks, then tags, cards and analytics. */
export function assemble(cp: BuildCheckpoint, cards: CardRow[]): { nodes: ExportNode[]; structure: StructuredDoc } {
  const plan = cp.plan!;
  const nodes: ExportNode[] = [{ kind: "heading", level: 1, text: plan.title }];
  const items: ImportedItem[] = [{ kind: "heading", level: 1, text: plan.title, paragraphIndex: -1 }];
  if (plan.notes) {
    nodes.push({ kind: "paragraph", text: `File notes: ${plan.notes}` });
  }
  const byKey = new Map(cp.items.map((i) => [i.key, i]));
  plan.sections.forEach((s, si) => {
    nodes.push({ kind: "heading", level: 2, text: s.heading });
    items.push({ kind: "heading", level: 2, text: s.heading, paragraphIndex: -1 });
    s.blocks.forEach((b, bi) => {
      const path = [plan.title, s.heading, b.heading];
      const blockNodes: ExportNode[] = [];
      const blockItems: ImportedItem[] = [];
      b.items.forEach((it, ii) => {
        if (it.kind === "card") {
          const bi2 = byKey.get(`${si}.${bi}.${ii}`);
          if (!bi2 || bi2.status === "removed") return;
          const c = bi2.cardId ? cards.find((x) => x.id === bi2.cardId) : undefined;
          if (!c) {
            // Missing evidence is said plainly, never filled in.
            const text = `Card needed — ${it.label}`;
            blockNodes.push({ kind: "paragraph", text });
            blockItems.push({ kind: "analytic", text, detail: [], paragraphIndex: -1, path });
            return;
          }
          blockNodes.push({ kind: "card", tag: c.tag, shortCite: shortCite(c.citation), fullCite: fullCite(c.citation), body: c.body as BodyBlock[] });
          blockItems.push({ kind: "card", tag: c.tag, tagParagraph: -1, cite: { short: shortCite(c.citation), rest: fullCite(c.citation), raw: `${shortCite(c.citation)} ${fullCite(c.citation)}`, paragraphIndex: -1 }, citation: c.citation, body: c.body as BodyText[], paragraphRange: [-1, -1], path, issues: [] });
        } else {
          const text = it.kind === "text" ? `${it.label}: ${it.text}` : analyticLine(it.label, it.text);
          blockNodes.push({ kind: "analytic", text, asTag: true });
          blockItems.push({ kind: "analytic", text, detail: [], paragraphIndex: -1, path });
        }
      });
      if (!blockNodes.length) return;
      nodes.push({ kind: "heading", level: 3, text: b.heading }, ...blockNodes);
      items.push({ kind: "heading", level: 3, text: b.heading, paragraphIndex: -1 }, ...blockItems);
    });
  });
  const counts = { headings: items.filter((i) => i.kind === "heading").length, cards: items.filter((i) => i.kind === "card").length, analytics: items.filter((i) => i.kind === "analytic").length };
  return { nodes, structure: { items, counts, issues: [], styled: true } };
}
