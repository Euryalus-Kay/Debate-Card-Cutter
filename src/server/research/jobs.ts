/**
 * Research jobs: discover → retrieve → cut → verify → save, as a durable job.
 *
 * Every state change is written to the job's checkpoint, so a run that is cut
 * off (deploy, timeout, crash) resumes from where it stopped: the next status
 * poll re-leases the job and continues. Cancellation is a flag checked at
 * every checkpoint write; in-flight model calls are aborted.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { cards, jobEvents, jobs } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { createCard } from "@/server/cards";
import { bodyHash, type Card } from "@/domain/card";
import { citationGaps } from "@/domain/citation";
import { discoverOpenAlex, discoverWeb, dedupe, normalizeUrl, type Candidate } from "./discover";
import { fetchSource, paragraphsOf } from "./fetcher";
import { saveFetchedSource, saveTextSource, type SourceRow } from "./sources";
import { cutCard } from "./cut";
import { buildCitation } from "./cite";
import { continueJob } from "@/server/jobs/continue";
import { CARD_USES } from "@/domain/card-use";
import { styleExamples } from "./examples";

export const ResearchInput = z.object({
  claim: z.string().trim().min(3).max(600),
  context: z.string().trim().max(1500).optional(),
  urls: z.array(z.string().url()).max(10).optional(),
  text: z
    .object({
      body: z.string().min(50).max(400_000),
      title: z.string().max(500).optional(),
      authors: z.array(z.string().max(120)).max(12).optional(),
      qualifications: z.array(z.string().max(300)).max(12).optional(),
      date: z.string().max(60).optional(),
      publication: z.string().max(300).optional(),
      url: z.string().max(2000).optional(),
    })
    .optional(),
  search: z.boolean().default(true),
  maxCards: z.number().int().min(1).max(6).default(3),
  roundId: z.string().optional(),
  labels: z.array(z.string().max(60)).max(10).optional(),
  /** the speech the card is for: sets excerpt and read length (Phase D) */
  use: z.enum(CARD_USES).optional(),
  side: z.enum(["aff", "neg"]).optional(),
});
export type ResearchInput = z.infer<typeof ResearchInput>;

export type ItemStatus = "pending" | "fetching" | "fetched" | "fetch_failed" | "cutting" | "cut" | "duplicate" | "no_support" | "cut_failed" | "skipped";

export interface ResearchItem {
  key: string;
  url?: string;
  title?: string;
  publication?: string;
  provider: Candidate["provider"] | "pasted";
  why?: string;
  bibliographic?: Candidate["metadata"];
  status: ItemStatus;
  method?: string;
  sourceId?: string;
  cardId?: string;
  error?: string;
  detail?: string;
  support?: { level: string; explanation: string; caveats: string[] };
  model?: string;
  ms?: { fetch?: number; cut?: number };
}

export interface ResearchCheckpoint {
  stage: "discover" | "work" | "done";
  discovery?: { queries: string[]; seen: number; ms: number; error?: string; openalex?: number };
  items: ResearchItem[];
  cardsMade: number;
}

const LEASE_SECONDS = 90;
const RUN_BUDGET_MS = 240_000;

export async function createResearchJob(teamId: string, userId: string, input: ResearchInput, idempotencyKey?: string): Promise<string> {
  const id = newId("job");
  const inserted = await db()
    .insert(jobs)
    .values({
      id,
      teamId,
      roundId: input.roundId ?? null,
      kind: "research",
      status: "queued",
      input,
      checkpoint: { stage: "discover", items: [], cardsMade: 0 } satisfies ResearchCheckpoint,
      progress: [],
      idempotencyKey: idempotencyKey ?? null,
      createdBy: userId,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0].id;
  const existing = await db().select({ id: jobs.id }).from(jobs).where(and(eq(jobs.teamId, teamId), eq(jobs.idempotencyKey, idempotencyKey ?? ""))).limit(1);
  return existing[0].id;
}

export async function getResearchJob(teamId: string, jobId: string) {
  const rows = await db().select().from(jobs).where(and(eq(jobs.teamId, teamId), eq(jobs.id, jobId), eq(jobs.kind, "research"))).limit(1);
  const job = rows[0];
  if (!job) return null;
  const events = await db().select().from(jobEvents).where(eq(jobEvents.jobId, jobId)).orderBy(jobEvents.id).limit(200);
  const stale = job.status === "running" || job.status === "queued" ? !job.leaseUntil || job.leaseUntil.getTime() < Date.now() : false;
  return { job, events, needsRunner: stale };
}

export async function listResearchJobs(teamId: string, limit = 20) {
  return db()
    .select({ id: jobs.id, status: jobs.status, input: jobs.input, checkpoint: jobs.checkpoint, createdAt: jobs.createdAt, updatedAt: jobs.updatedAt, createdBy: jobs.createdBy })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "research")))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
}

export async function requestCancel(teamId: string, jobId: string): Promise<void> {
  await db()
    .update(jobs)
    .set({ cancelRequested: true, updatedAt: new Date() })
    .where(and(eq(jobs.teamId, teamId), eq(jobs.id, jobId)));
  // Nobody holds the lease: cancel right away.
  await db()
    .update(jobs)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), sql`${jobs.status} in ('queued','running')`, sql`(${jobs.leaseUntil} is null or ${jobs.leaseUntil} < now())`));
}

async function event(jobId: string, stage: string, message: string, level: "info" | "warn" | "error" = "info", data?: unknown) {
  await db().insert(jobEvents).values({ jobId, stage, message, level, data: data ?? null });
}

/** Take the lease if nobody else holds it. Returns the job row or null. */
async function lease(jobId: string) {
  const rows = await db()
    .update(jobs)
    .set({ status: "running", leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, heartbeatAt: sql`now()`, attempts: sql`${jobs.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), sql`${jobs.status} in ('queued','running')`, sql`(${jobs.leaseUntil} is null or ${jobs.leaseUntil} < now())`, eq(jobs.cancelRequested, false)))
    .returning();
  return rows[0] ?? null;
}

function progressOf(cp: ResearchCheckpoint) {
  const count = (s: ItemStatus[]) => cp.items.filter((i) => s.includes(i.status)).length;
  return [
    { stage: "discover", status: cp.stage === "discover" ? "running" : "done", detail: cp.discovery ? `${cp.items.length} sources to try` : "" },
    { stage: "retrieve", status: count(["pending", "fetching"]) ? "running" : "done", detail: `${count(["fetched", "cutting", "cut", "no_support", "cut_failed", "duplicate"])} read, ${count(["fetch_failed"])} unavailable` },
    { stage: "cut", status: cp.stage === "done" ? "done" : "running", detail: `${cp.cardsMade} cards, ${count(["no_support"])} sources didn't support the claim` },
  ];
}

export async function runResearchJob(jobId: string): Promise<void> {
  const job = await lease(jobId);
  if (!job) return;
  const started = Date.now();
  const input = ResearchInput.parse(job.input);
  const teamId = job.teamId;
  const userId = job.createdBy;
  const cp = job.checkpoint as ResearchCheckpoint;
  const controller = new AbortController();
  let cancelled = false;

  // Items interrupted mid-step by a previous run go back one step.
  for (const it of cp.items) {
    if (it.status === "fetching") it.status = "pending";
    if (it.status === "cutting") it.status = it.sourceId ? "fetched" : "pending";
  }

  let writing: Promise<void> = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      const rows = await db()
        .update(jobs)
        .set({ checkpoint: cp, progress: progressOf(cp), heartbeatAt: sql`now()`, leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: new Date() })
        .where(eq(jobs.id, jobId))
        .returning();
      if (rows[0]?.cancelRequested && !cancelled) {
        cancelled = true;
        controller.abort();
      }
    });
    return writing;
  };

  try {
    if (cp.stage === "discover") {
      await discover(input, cp, jobId, controller.signal, teamId);
      cp.stage = "work";
      await persist();
    }
    const sourcesById = new Map<string, SourceRow>();
    // Cuts in flight count against the target so parallel workers don't overshoot it.
    let inFlight = 0;
    const worker = async () => {
      while (!cancelled && Date.now() - started < RUN_BUDGET_MS) {
        if (cp.cardsMade >= input.maxCards) return;
        const readyToCut = cp.items.find((i) => i.status === "fetched");
        const toFetch = cp.items.find((i) => i.status === "pending");
        if (cp.cardsMade + inFlight >= input.maxCards || !readyToCut) {
          // Nothing to cut right now: read ahead, or wait for in-flight cuts (one may fail and free a slot).
          if (toFetch && cp.items.filter((i) => i.status === "fetched").length < 2) {
            toFetch.status = "fetching";
            await persist();
            await retrieve(toFetch, input, teamId, sourcesById);
            await persist();
            continue;
          }
          if (inFlight === 0 && !readyToCut && !toFetch) return;
          if (inFlight === 0 && !readyToCut) continue;
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        readyToCut.status = "cutting";
        inFlight++;
        await persist();
        try {
          await cut(readyToCut, input, teamId, userId, sourcesById, controller.signal, jobId);
        } finally {
          inFlight--;
        }
        if ((readyToCut.status as ItemStatus) === "cut") cp.cardsMade++;
        await persist();
      }
    };
    const parallel = Math.max(1, Math.min(3, input.maxCards));
    await Promise.all(Array.from({ length: parallel }, worker));
    await writing;

    if (cancelled) {
      for (const it of cp.items) if (["pending", "fetching", "fetched", "cutting"].includes(it.status)) it.status = "skipped";
      cp.stage = "done";
      await db().update(jobs).set({ status: "cancelled", checkpoint: cp, progress: progressOf(cp), leaseUntil: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
      await event(jobId, "done", "Cancelled.");
      return;
    }
    const remaining = cp.items.some((i) => i.status === "pending" || i.status === "fetched");
    if (remaining && cp.cardsMade < input.maxCards) {
      // Out of time for this invocation: release the lease and start the next run (a poll would also resume it).
      await db().update(jobs).set({ checkpoint: cp, progress: progressOf(cp), leaseUntil: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
      await continueJob(jobId, job.attempts);
      return;
    }
    for (const it of cp.items) if (it.status === "pending" || it.status === "fetched") it.status = "skipped";
    cp.stage = "done";
    const cardIds = cp.items.filter((i) => i.cardId && (i.status === "cut" || i.status === "duplicate")).map((i) => i.cardId!);
    const failures = cp.items.filter((i) => i.status === "fetch_failed" || i.status === "cut_failed").length;
    const status = cardIds.length === 0 ? "failed" : cardIds.length < input.maxCards && failures ? "partial" : "succeeded";
    const summary =
      cardIds.length === 0
        ? cp.items.length === 0
          ? "No sources were found."
          : "No source supported the claim closely enough to cut a card. Try rewording the claim or adding URLs."
        : `${cardIds.length} card${cardIds.length === 1 ? "" : "s"} cut and verified.`;
    await db()
      .update(jobs)
      .set({ status, checkpoint: cp, progress: progressOf(cp), result: { cardIds, summary }, error: status === "failed" ? summary : null, leaseUntil: null, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    await event(jobId, "done", summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await writing.catch(() => {});
    await db().update(jobs).set({ checkpoint: cp, progress: progressOf(cp), error: message, leaseUntil: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    await event(jobId, "error", `Interrupted: ${message}. It will resume.`, "error");
    // Too many attempts: give up rather than loop forever.
    if (job.attempts + 1 >= 6) await db().update(jobs).set({ status: "failed" }).where(eq(jobs.id, jobId));
  }
}

async function discover(input: ResearchInput, cp: ResearchCheckpoint, jobId: string, signal: AbortSignal, teamId: string) {
  const items: ResearchItem[] = [];
  if (input.text) {
    items.push({ key: "pasted", provider: "pasted", title: input.text.title, url: input.text.url, status: "pending" });
  }
  for (const url of input.urls ?? []) items.push({ key: normalizeUrl(url), url, provider: "user", status: "pending" });
  if (input.search && !input.text && !(input.urls?.length)) {
    await event(jobId, "discover", `Searching for sources on: ${input.claim}`);
    const want = Math.min(10, input.maxCards * 3);
    const [web, oa] = await Promise.all([discoverWeb(input.claim, { context: input.context, maxCandidates: want, signal, teamId }), discoverOpenAlex(input.claim, { max: 3, signal })]);
    cp.discovery = { queries: web.queries, seen: web.seen.length + oa.candidates.length, ms: web.ms, error: web.error, openalex: oa.candidates.length };
    if (web.error) await event(jobId, "discover", `Web search failed: ${web.error}`, "warn");
    // Web leads first (chosen after reading results), then open-access scholarship.
    for (const c of dedupe([...web.candidates, ...oa.candidates])) {
      items.push({ key: normalizeUrl(c.url), url: c.url, title: c.title, publication: c.publication, provider: c.provider, why: c.why, bibliographic: c.metadata, status: "pending" });
    }
    await event(jobId, "discover", `Found ${items.length} candidate sources (${web.queries.length} searches).`, "info", { queries: web.queries });
  }
  cp.items = dedupe(items.map((i) => ({ ...i, url: i.url ?? `pasted:${i.key}` }))).map((i) => (i.url?.startsWith("pasted:") ? { ...i, url: input.text?.url } : i));
}

async function retrieve(it: ResearchItem, input: ResearchInput, teamId: string, cache: Map<string, SourceRow>) {
  const t0 = Date.now();
  try {
    if (it.provider === "pasted" && input.text) {
      const paragraphs = paragraphsOf(input.text.body.replace(/\r\n/g, "\n"));
      const text = paragraphs.join("\n\n");
      const row = await saveTextSource(teamId, { text, paragraphs, title: input.text.title, url: input.text.url, publication: input.text.publication, authors: input.text.authors, date: input.text.date });
      cache.set(row.id, row);
      Object.assign(it, { status: "fetched", sourceId: row.id, method: "user_paste" });
      return;
    }
    const f = await fetchSource(it.url!, { teamId });
    it.ms = { ...it.ms, fetch: Date.now() - t0 };
    it.method = f.method;
    if (!f.ok) {
      Object.assign(it, { status: "fetch_failed", error: explainFetch(f.blocked, f.error) });
      return;
    }
    if (!it.title) it.title = f.metadata.title;
    const row = await saveFetchedSource(teamId, f, { bibliographic: it.bibliographic, discoveredVia: it.provider });
    cache.set(row.id, { ...row, paragraphPages: f.paragraphPages });
    Object.assign(it, { status: "fetched", sourceId: row.id });
    metaCache.set(row.id, { metadata: f.metadata, finalUrl: f.finalUrl });
  } catch (e) {
    Object.assign(it, { status: "fetch_failed", error: e instanceof Error ? e.message : String(e) });
  }
}

const metaCache = new Map<string, { metadata: import("./fetcher").SourceMetadata; finalUrl: string }>();

function explainFetch(blocked: string | undefined, error: string | undefined): string {
  switch (blocked) {
    case "robots":
      return "The site doesn't allow automated access (robots.txt). Open it yourself and paste the text.";
    case "paywall":
      return "Paywalled. If you have access, paste the article text.";
    case "bot_protection":
      return "The site blocked automated access. Open it yourself and paste the text.";
    case "empty":
      return "No readable text (scanned PDF or page needs JavaScript).";
    default:
      return error ?? "Could not retrieve the page.";
  }
}

async function loadSource(teamId: string, sourceId: string, cache: Map<string, SourceRow>): Promise<SourceRow | null> {
  const hit = cache.get(sourceId);
  if (hit) return hit;
  const { sources } = await import("@/server/db/schema");
  const rows = await db().select().from(sources).where(and(eq(sources.teamId, teamId), eq(sources.id, sourceId))).limit(1);
  const r = rows[0];
  if (!r?.fullText) return null;
  const md = r.metadata as { paragraphPages?: [number, number][] | null };
  const row: SourceRow = { id: r.id, fullText: r.fullText, textFormat: r.textFormat, paragraphs: r.fullText.split("\n\n"), paragraphPages: md.paragraphPages ?? undefined };
  metaCache.set(r.id, { metadata: { ...(r.metadata as import("./fetcher").SourceMetadata), authors: ((r.metadata as { authors?: string[] }).authors ?? []) as string[] }, finalUrl: r.url ?? "" });
  cache.set(r.id, row);
  return row;
}

async function cut(it: ResearchItem, input: ResearchInput, teamId: string, userId: string | null, cache: Map<string, SourceRow>, signal: AbortSignal, jobId: string) {
  const t0 = Date.now();
  try {
    const src = await loadSource(teamId, it.sourceId!, cache);
    if (!src) {
      Object.assign(it, { status: "cut_failed", error: "Stored source text is missing." });
      return;
    }
    const meta = metaCache.get(src.id);
    const pasted = it.provider === "pasted" ? input.text : undefined;
    const r = await cutCard({
      claim: input.claim,
      context: input.context,
      source: { title: pasted?.title ?? meta?.metadata.title, publication: pasted?.publication ?? meta?.metadata.siteName, url: pasted?.url ?? meta?.finalUrl, knownAuthors: pasted?.authors ?? meta?.metadata.authors, published: pasted?.date ?? meta?.metadata.published },
      paragraphs: src.paragraphs,
      sourceText: src.fullText,
      dehyphenate: src.textFormat === "pdf",
      teamId,
      signal,
      use: input.use,
      side: input.side,
      styleExamples: await styleExamples(teamId, input.claim),
    });
    it.ms = { ...it.ms, cut: Date.now() - t0 };
    it.model = r.run.model;
    it.support = r.run.output.support;
    if (!r.built) {
      Object.assign(it, { status: r.run.output.verdict === "no_support" ? "no_support" : "cut_failed", detail: r.rejectedReason ?? r.run.output.reason });
      return;
    }
    if (!r.built.verification.ok) {
      // Should be impossible (text is copied from the source); never save an unverified cut.
      Object.assign(it, { status: "cut_failed", error: "The excerpt failed verification against the stored source.", detail: r.built.verification.issues.map((i) => i.message).join(" ") });
      await event(jobId, "cut", `Verification failed for ${it.url}`, "error", r.built.verification.issues);
      return;
    }
    const pages = src.paragraphPages ? pageRange(src.paragraphPages, r.built.paragraphRange) : undefined;
    const { citation, rejected } = buildCitation({
      url: pasted?.url ?? meta?.finalUrl ?? it.url ?? "",
      metadata: meta?.metadata ?? { authors: [] },
      bibliographic: it.bibliographic,
      byline: r.run.output.byline,
      sourceText: src.fullText,
      pages,
      accessed: new Date().toISOString().slice(0, 10),
      user: pasted ? { title: pasted.title, publication: pasted.publication, url: pasted.url, authors: pasted.authors, date: pasted.date, qualifications: pasted.qualifications } : undefined,
    });
    const hash = await bodyHash(r.built.body);
    const dup = await db()
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.teamId, teamId), eq(cards.bodyHash, hash), sql`${cards.deletedAt} is null`))
      .limit(1);
    if (dup[0]) {
      Object.assign(it, { status: "duplicate", cardId: dup[0].id, detail: "Your library already has a card with this exact text." });
      return;
    }
    const gaps = citationGaps(citation).filter((g) => g !== "qualifications");
    const verification: Card["verification"] = {
      status: gaps.length ? "verified_quote_only" : "verified",
      checkedAt: new Date().toISOString(),
      sourceId: src.id,
      sourceTextHash: (await import("./sources")).textHash(src.fullText),
      issues: [
        ...r.built.issues,
        ...rejected.map((m) => ({ severity: "info" as const, code: "cite_field_rejected", message: `Not added to the cite: ${m}.` })),
      ],
    };
    const cardId = await createCard({
      teamId,
      userId,
      tag: r.built.tag,
      citation,
      body: r.built.body,
      origin: "ai_cut",
      verification,
      sourceId: src.id,
      labels: ["research", ...(input.labels ?? [])],
      importedFrom: {
        kind: "research",
        jobId,
        claim: input.claim,
        model: r.run.model,
        support: r.run.output.support,
        paragraphs: r.built.paragraphRange,
        retrieval: it.method ?? null,
      },
    });
    Object.assign(it, { status: "cut", cardId, detail: r.run.output.reason });
  } catch (e) {
    if (signal.aborted) {
      it.status = "skipped";
      return;
    }
    Object.assign(it, { status: "cut_failed", error: e instanceof Error ? e.message : String(e) });
  }
}

function pageRange(paragraphPages: [number, number][], [first, last]: [number, number]): string | undefined {
  const a = paragraphPages[first - 1];
  const b = paragraphPages[last - 1];
  if (!a || !b) return undefined;
  const lo = Math.min(a[0], b[0]);
  const hi = Math.max(a[1], b[1]);
  return lo === hi ? `${lo} of PDF` : `${lo}-${hi} of PDF`;
}
