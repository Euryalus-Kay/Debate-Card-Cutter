/**
 * Structured, streamed model calls with per-task fallback, refusal handling,
 * and latency telemetry (time to first output, total time, tokens).
 */

import { Output, streamText, type ModelMessage } from "ai";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { telemetry } from "@/server/db/schema";
import { languageModel, providerOptions, taskConfig, type AiTask, type ModelSpec } from "./models";

export interface RunAttempt {
  model: string;
  ok: boolean;
  error?: string;
  ttftMs?: number;
  totalMs: number;
  finishReason?: string;
}

export interface RunResult<T> {
  output: T;
  model: string;
  attempts: RunAttempt[];
  ttftMs: number | null;
  totalMs: number;
  usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number } | null;
}

export class AiRunError extends Error {
  constructor(
    message: string,
    public attempts: RunAttempt[],
  ) {
    super(message);
  }
}

const CACHE_1H = { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } } as const;

export interface RunInput<S extends z.ZodType> {
  task: AiTask;
  /** stable system prompt (cached) */
  system: string;
  /** stable per-round context (cached for an hour: many in-round calls reuse it) */
  context?: string;
  /** the specific request */
  prompt: string;
  schema: S;
  onPartial?: (partial: unknown) => void;
  abortSignal?: AbortSignal;
  teamId?: string | null;
  /** override the registry (benchmarks) */
  models?: ModelSpec[];
}

function buildMessages(context: string | undefined, prompt: string): ModelMessage[] {
  const parts: { type: "text"; text: string; providerOptions?: never }[] = [];
  if (context) parts.push({ type: "text", text: context, providerOptions: CACHE_1H as never });
  parts.push({ type: "text", text: prompt });
  return [{ role: "user", content: parts }];
}

export async function runStructured<S extends z.ZodType>(input: RunInput<S>): Promise<RunResult<z.infer<S>>> {
  const cfg = taskConfig(input.task);
  const chain = input.models ?? [cfg.primary, ...cfg.fallbacks];
  const attempts: RunAttempt[] = [];
  const messages = buildMessages(input.context, input.prompt);
  // AI SDK 7: system text goes in `instructions` (cached for an hour).
  const instructions = { role: "system" as const, content: input.system, providerOptions: CACHE_1H as never };

  for (const spec of chain) {
    if (input.abortSignal?.aborted) break;
    const started = Date.now();
    let ttft: number | undefined;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    input.abortSignal?.addEventListener("abort", onAbort);
    let firstChunkTimer: ReturnType<typeof setTimeout> | null = null;
    if (spec.firstChunkMs) firstChunkTimer = setTimeout(() => ttft === undefined && controller.abort(), spec.firstChunkMs);
    try {
      const result = streamText({
        model: languageModel(spec),
        instructions,
        messages,
        output: Output.object({ schema: input.schema }),
        providerOptions: providerOptions(spec),
        maxOutputTokens: spec.maxOutputTokens,
        abortSignal: controller.signal,
        maxRetries: 1,
      });
      for await (const partial of result.partialOutputStream) {
        if (ttft === undefined) {
          ttft = Date.now() - started;
          if (firstChunkTimer) clearTimeout(firstChunkTimer);
        }
        input.onPartial?.(partial);
      }
      const finishReason = await result.finishReason;
      if (finishReason === "content-filter") {
        attempts.push({ model: spec.model, ok: false, error: "refusal", ttftMs: ttft, totalMs: Date.now() - started, finishReason });
        continue;
      }
      const output = (await result.output) as z.infer<S>;
      const usage = await result.usage;
      const totalMs = Date.now() - started;
      attempts.push({ model: spec.model, ok: true, ttftMs: ttft, totalMs, finishReason });
      void recordTelemetry(input.teamId ?? null, input.task, spec.model, totalMs, true, { ttftMs: ttft, usage, attempts: attempts.length });
      return {
        output,
        model: spec.model,
        attempts,
        ttftMs: ttft ?? null,
        totalMs,
        usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens, cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens } : null,
      };
    } catch (e) {
      const msg = input.abortSignal?.aborted ? "cancelled" : ttft === undefined && controller.signal.aborted ? `no response within ${spec.firstChunkMs} ms` : e instanceof Error ? e.message : String(e);
      attempts.push({ model: spec.model, ok: false, error: msg.slice(0, 300), ttftMs: ttft, totalMs: Date.now() - started });
      void recordTelemetry(input.teamId ?? null, input.task, spec.model, Date.now() - started, false, { error: msg.slice(0, 300) });
      if (input.abortSignal?.aborted) break;
    } finally {
      if (firstChunkTimer) clearTimeout(firstChunkTimer);
      input.abortSignal?.removeEventListener("abort", onAbort);
    }
  }
  const last = attempts[attempts.length - 1];
  throw new AiRunError(
    input.abortSignal?.aborted ? "Cancelled." : last?.error === "refusal" ? "The model declined this request (safety filter). Try rephrasing, or write this part by hand." : `AI request failed: ${last?.error ?? "unknown error"}`,
    attempts,
  );
}

async function recordTelemetry(teamId: string | null, task: string, model: string, ms: number, ok: boolean, data: unknown) {
  try {
    await db().insert(telemetry).values({ teamId, kind: "ai", name: `${task}:${model}`, ms, ok, data: data as never });
  } catch {
    /* telemetry must never break a request */
  }
}
