// @vitest-environment node
/**
 * Resilience (Phase G): when the primary model errors, stalls before its first output, or refuses, the
 * request falls through to the next model; when all fail, the error explains itself. Models are mocks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

type Behavior = "ok" | "error" | "stall" | "refuse";
const behavior: Record<string, Behavior> = {};
const calls: string[] = [];

function stream(parts: unknown[], delay = 0) {
  return { stream: simulateReadableStream({ chunks: parts as never[], initialDelayInMs: delay, chunkDelayInMs: 0 }) };
}
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };

vi.mock("../models", async (orig) => ({
  ...(await orig<typeof import("../models")>()),
  languageModel: (spec: { model: string }) =>
    new MockLanguageModelV4({
      modelId: spec.model,
      doStream: async (opts: { abortSignal?: AbortSignal }) => {
        calls.push(spec.model);
        const b = behavior[spec.model] ?? "ok";
        if (b === "error") throw new Error("overloaded_error");
        const text = JSON.stringify({ answer: `from ${spec.model}` });
        const parts = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: text }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: b === "refuse" ? "content-filter" : "stop", raw: undefined }, usage }];
        if (b === "stall") {
          // Never produces output: the runner's first-chunk timer aborts it.
          return { stream: new ReadableStream({ start(c) { opts.abortSignal?.addEventListener("abort", () => c.error(new Error("aborted"))); } }) };
        }
        return stream(parts);
      },
    } as never),
}));

const { runStructured } = await import("../run");
const schema = z.object({ answer: z.string() });
const models = [
  { model: "primary-model", maxOutputTokens: 100, firstChunkMs: 200 },
  { model: "fallback-model", maxOutputTokens: 100 },
];

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(behavior)) delete behavior[k];
  delete process.env.AI_FAKE;
});

describe("runStructured fallbacks", () => {
  it("uses the primary when it works", async () => {
    const r = await runStructured({ task: "section_revise", system: "s", prompt: "p", schema, models: models as never });
    expect(r.output.answer).toBe("from primary-model");
    expect(calls).toEqual(["primary-model"]);
  });

  it("falls through to the next model when the primary errors", async () => {
    behavior["primary-model"] = "error";
    const r = await runStructured({ task: "section_revise", system: "s", prompt: "p", schema, models: models as never });
    expect(r.output.answer).toBe("from fallback-model");
    expect(r.attempts.map((a) => a.ok)).toEqual([false, true]);
  });

  it("falls through when the primary produces nothing before its first-output deadline", async () => {
    behavior["primary-model"] = "stall";
    const r = await runStructured({ task: "section_revise", system: "s", prompt: "p", schema, models: models as never });
    expect(r.output.answer).toBe("from fallback-model");
    expect(r.attempts[0].error).toMatch(/no response within 200 ms/);
  });

  it("falls through on a refusal, and explains when every model fails", async () => {
    behavior["primary-model"] = "refuse";
    behavior["fallback-model"] = "error";
    await expect(runStructured({ task: "section_revise", system: "s", prompt: "p", schema, models: models as never })).rejects.toThrow(/AI request failed/);
    behavior["fallback-model"] = "refuse";
    await expect(runStructured({ task: "section_revise", system: "s", prompt: "p", schema, models: models as never })).rejects.toThrow(/declined this request/);
  });
});
