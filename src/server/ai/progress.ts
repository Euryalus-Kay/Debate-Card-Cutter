/**
 * Progress for AI jobs (A4). Stages come from the job itself (the outline a
 * draft plans before writing, the new arguments an update must answer); time
 * left comes from measured run times (telemetry medians per task and model)
 * until the job's own pace can be measured.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { telemetry } from "@/server/db/schema";
import { median, remainingMs, type Progress } from "@/domain/progress";
import { taskConfig, type AiTask } from "./models";

export interface Timing {
  /** typical total run time (ms) */
  totalMs: number;
  /** typical time to first output (ms) */
  ttftMs: number;
}

/** Fallbacks before a task has run often enough to measure (roughly what the benchmarks showed). */
const DEFAULT_TIMING: Partial<Record<AiTask, Timing>> = {
  speech_draft: { totalMs: 110_000, ttftMs: 25_000 },
  speech_draft_fast: { totalMs: 45_000, ttftMs: 3_000 },
  speech_patch: { totalMs: 15_000, ttftMs: 5_000 },
  speech_fit: { totalMs: 30_000, ttftMs: 3_000 },
  section_revise: { totalMs: 10_000, ttftMs: 2_000 },
  flow_extract: { totalMs: 5_000, ttftMs: 2_000 },
};

const cache = new Map<string, { at: number; timing: Timing }>();

/** Typical run time of a task on its primary model: the median of its last 30 successful runs. */
export async function taskTiming(task: AiTask): Promise<Timing> {
  const model = taskConfig(task).primary.model;
  const key = `${task}:${model}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.timing;
  const fallback = DEFAULT_TIMING[task] ?? { totalMs: 30_000, ttftMs: 3_000 };
  let timing = fallback;
  try {
    const rows = await db()
      .select({ ms: telemetry.ms, data: telemetry.data })
      .from(telemetry)
      .where(and(eq(telemetry.kind, "ai"), eq(telemetry.name, key), eq(telemetry.ok, true)))
      .orderBy(desc(telemetry.createdAt))
      .limit(30);
    const total = median(rows.map((r) => r.ms ?? NaN));
    const ttft = median(rows.map((r) => Number((r.data as { ttftMs?: number } | null)?.ttftMs ?? NaN)));
    if (rows.length >= 3 && total !== null) timing = { totalMs: total, ttftMs: ttft ?? fallback.ttftMs };
  } catch {
    /* timing is a nicety; never fail a job over it */
  }
  cache.set(key, { at: Date.now(), timing });
  return timing;
}

type Emit = (p: Progress) => void;

/** Emits at most every 700 ms unless the stage or count changed. */
function throttled(emit: Emit): Emit {
  let last = 0;
  let key = "";
  return (p) => {
    const k = `${p.stage}|${p.done}|${p.total}`;
    if (k === key && Date.now() - last < 700) return;
    key = k;
    last = Date.now();
    emit({ ...p, fraction: Math.max(0, Math.min(1, p.fraction)), etaMs: p.etaMs === null ? null : Math.max(0, Math.round(p.etaMs)) });
  };
}

interface Streamed {
  outline?: (string | undefined)[];
  sections?: ({ title?: string } | undefined)[];
}

/**
 * A speech draft: reading the round → planning (the model lists its outline
 * first, so the number of sections is known) → writing section k of n →
 * checking coverage → fitting to time → ready.
 */
export function draftProgress(emitRaw: Emit, timing: Timing, fitTiming: Timing) {
  const emit = throttled(emitRaw);
  const t0 = Date.now();
  let writingSince: number | null = null;
  let planned = 0;
  let expected = 0;
  const writingMs = Math.max(5_000, timing.totalMs - timing.ttftMs);
  return {
    start() {
      emit({ stage: "Reading the round", done: 0, total: null, etaMs: timing.totalMs, fraction: 0.02 });
    },
    /** how many sections the speech will likely need, from what it must answer */
    expect(n: number) {
      expected = n;
    },
    partial(p: Streamed) {
      const outline = (p.outline ?? []).filter((x): x is string => !!x);
      const sections = (p.sections ?? []).filter((x): x is { title?: string } => !!x);
      const now = Date.now();
      if (!sections.length) {
        planned = outline.length;
        const f = Math.min(1, (now - t0) / Math.max(timing.ttftMs, 1000));
        emit({ stage: outline.length ? `Planned ${outline.length} sections` : "Planning the speech", done: 0, total: outline.length || null, etaMs: Math.max(writingMs, timing.totalMs - (now - t0)), fraction: 0.03 + 0.12 * f });
        return;
      }
      writingSince ??= now;
      // The outline sometimes lists only the positions; what the speech must answer is a floor on the count.
      const total = Math.max(planned, outline.length, expected, sections.length);
      const done = sections.length - 1;
      const title = sections[sections.length - 1]?.title?.trim();
      const eta = remainingMs({ done, total, since: writingSince, now, typicalWritingMs: writingMs });
      emit({ stage: `Writing section ${Math.min(done + 1, total)} of ${total}${title ? `: ${title.slice(0, 60)}` : ""}`, done, total, etaMs: eta, fraction: 0.15 + 0.7 * (done / Math.max(total, 1)) });
    },
    checking(total: number) {
      emit({ stage: "Checking what it answers", done: total, total, etaMs: 1500, fraction: 0.88 });
    },
    fitting(label: string, total: number) {
      emit({ stage: label, done: total, total, etaMs: fitTiming.totalMs, fraction: 0.9 });
    },
  };
}

/** An update of a draft: reading what changed → answering k of n new arguments → checking. */
export function patchProgress(emitRaw: Emit, timing: Timing, toAnswer: number) {
  const emit = throttled(emitRaw);
  const t0 = Date.now();
  let since: number | null = null;
  return {
    start() {
      emit({ stage: "Reading what changed", done: 0, total: toAnswer || null, etaMs: timing.totalMs, fraction: 0.05 });
    },
    partial(p: { adds?: ({ targets?: (string | undefined)[] } | undefined)[] }) {
      const now = Date.now();
      const adds = (p.adds ?? []).filter(Boolean).length;
      if (!adds) {
        emit({ stage: toAnswer ? `Planning answers to ${toAnswer} new argument${toAnswer === 1 ? "" : "s"}` : "Planning the update", done: 0, total: toAnswer || null, etaMs: Math.max(3_000, timing.totalMs - (now - t0)), fraction: 0.05 + 0.2 * Math.min(1, (now - t0) / Math.max(timing.ttftMs, 1000)) });
        return;
      }
      since ??= now;
      const total = Math.max(toAnswer, adds);
      const done = adds - 1;
      emit({ stage: `Writing answer ${Math.min(adds, total)} of ${total}`, done, total, etaMs: remainingMs({ done, total, since, now, typicalWritingMs: Math.max(3_000, timing.totalMs - timing.ttftMs) }), fraction: 0.25 + 0.65 * (done / Math.max(total, 1)) });
    },
    checking() {
      emit({ stage: "Checking the update", done: toAnswer, total: toAnswer || null, etaMs: 1000, fraction: 0.95 });
    },
  };
}

/** Fitting a speech to time: planning k of n sections → filling to length. */
export function fitProgress(emitRaw: Emit, timing: Timing, sections: number) {
  const emit = throttled(emitRaw);
  const t0 = Date.now();
  let since: number | null = null;
  return {
    start() {
      emit({ stage: "Reading the speech", done: 0, total: sections, etaMs: timing.totalMs, fraction: 0.05 });
    },
    partial(p: { plan?: unknown[] }) {
      const now = Date.now();
      const n = (p.plan ?? []).filter(Boolean).length;
      if (!n) {
        emit({ stage: "Deciding what to keep, cut, and condense", done: 0, total: sections, etaMs: Math.max(3_000, timing.totalMs - (now - t0)), fraction: 0.05 + 0.15 * Math.min(1, (now - t0) / Math.max(timing.ttftMs, 1000)) });
        return;
      }
      since ??= now;
      const done = n - 1;
      emit({ stage: `Planning section ${Math.min(n, sections)} of ${sections}`, done, total: sections, etaMs: remainingMs({ done, total: sections, since, now, typicalWritingMs: Math.max(3_000, timing.totalMs - timing.ttftMs) }), fraction: 0.2 + 0.7 * (done / Math.max(sections, 1)) });
    },
    stage(label: string, fraction: number, etaMs: number | null) {
      emit({ stage: label, done: sections, total: sections, etaMs, fraction });
    },
  };
}

/** Reading typed or transcribed lines onto the flow: k of n lines. */
export function extractProgress(emitRaw: Emit, timing: Timing, lines: number) {
  const emit = throttled(emitRaw);
  const t0 = Date.now();
  return {
    start() {
      emit({ stage: `Reading ${lines} line${lines === 1 ? "" : "s"}`, done: 0, total: lines, etaMs: timing.totalMs, fraction: 0.1 });
    },
    partial(p: { lines?: unknown[] }) {
      const n = (p.lines ?? []).filter(Boolean).length;
      const done = Math.max(0, n - 1);
      const since = Date.now() - t0;
      emit({ stage: `Reading line ${Math.min(n, lines)} of ${lines}`, done, total: lines, etaMs: done ? (since / done) * (lines - done) : Math.max(1_000, timing.totalMs - since), fraction: 0.1 + 0.8 * (done / Math.max(lines, 1)) });
    },
    stage(label: string) {
      emit({ stage: label, done: lines, total: lines, etaMs: 500, fraction: 0.95 });
    },
  };
}
