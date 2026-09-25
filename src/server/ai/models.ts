/**
 * Model registry: every AI task resolves its model here, so models can be
 * changed per task without touching product code. Choices are justified in
 * docs/research/models-and-providers.md §8 and updated from live benchmarks
 * (docs/PROJECT_RECORD.md, "Model evaluation").
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type AiTask =
  | "flow_interpret" // roles + response links for a speech doc
  | "speech_draft" // full speech from flow + evidence
  | "speech_draft_fast"
  | "section_revise" // targeted rewrites (clarify / reword / condense / strengthen)
  | "section_alternatives"
  | "coverage_review" // what's still missing, strategic risks
  | "card_cut" // select passages/highlights from stored source text
  | "card_support" // does the card support the tag
  | "research_plan"
  | "source_eval"
  | "paradigm";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelSpec {
  model: string;
  /** adaptive-thinking effort (Opus 5.5 / Sonnet 5 / Fable) */
  effort?: Effort;
  /** turn thinking off where the model allows it (Sonnet 5, Opus 5 at ≤ high) */
  thinkingOff?: boolean;
  maxOutputTokens: number;
  /** abort if no first chunk arrives within this many ms, then try the next model */
  firstChunkMs?: number;
}

export interface TaskConfig {
  primary: ModelSpec;
  fallbacks: ModelSpec[];
}

export const MODELS = {
  opus55: "claude-opus-5-5",
  sonnet5: "claude-sonnet-5",
  haiku45: "claude-haiku-4-5",
  opus5: "claude-opus-5",
  fable51: "claude-fable-5-1",
} as const;

/**
 * Initial routing (before live benchmarks): quality-critical reasoning on
 * Opus 5.5; latency-critical edits on Sonnet 5 with thinking off; bulk
 * labeling on Sonnet 5. Every task has a fallback for refusals and outages.
 */
export const REGISTRY: Record<AiTask, TaskConfig> = {
  // Live run 2026-09-25: Sonnet 5 (effort medium) produced no output within 30 s on the 2NC; Opus 5.5 low
  // finished in 18 s (first output 2.4 s) with accurate links.
  flow_interpret: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 16000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 16000 }],
  },
  // Live benchmark 2026-09-25 (docs/evals/results/draft-latency-2ac-run1.json): Opus 5.5 at low
  // effort had the fastest first output (3.2 s) and completion (46 s), fit the time limit, and got
  // turn theory right; Sonnet 5 / Opus 5 / Haiku 4.5 ran over the speech time or misread evidence.
  speech_draft: {
    primary: { model: MODELS.opus55, effort: "medium", maxOutputTokens: 24000, firstChunkMs: 120000 },
    fallbacks: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 16000, firstChunkMs: 45000 }, { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 16000 }],
  },
  speech_draft_fast: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 16000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 16000, firstChunkMs: 30000 }, { model: MODELS.opus5, thinkingOff: true, maxOutputTokens: 16000 }],
  },
  section_revise: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 4000, firstChunkMs: 12000 },
    fallbacks: [{ model: MODELS.haiku45, maxOutputTokens: 4000 }],
  },
  section_alternatives: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 8000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, effort: "medium", maxOutputTokens: 8000 }],
  },
  coverage_review: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 6000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, effort: "medium", maxOutputTokens: 6000 }],
  },
  card_cut: {
    primary: { model: MODELS.sonnet5, effort: "medium", maxOutputTokens: 8000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 8000 }],
  },
  card_support: {
    primary: { model: MODELS.haiku45, maxOutputTokens: 2000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 2000 }],
  },
  research_plan: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 3000 },
    fallbacks: [{ model: MODELS.haiku45, maxOutputTokens: 3000 }],
  },
  source_eval: {
    primary: { model: MODELS.haiku45, maxOutputTokens: 3000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 3000 }],
  },
  paradigm: {
    primary: { model: MODELS.haiku45, maxOutputTokens: 3000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 3000 }],
  },
};

let provider: ReturnType<typeof createAnthropic> | null = null;

export function languageModel(spec: ModelSpec): LanguageModel {
  if (!provider) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    // Explicit base URL: never inherit a proxy base URL from the environment.
    provider = createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" });
  }
  return provider(spec.model);
}

export function providerOptions(spec: ModelSpec) {
  const anthropic: Record<string, unknown> = {};
  if (spec.effort) anthropic.effort = spec.effort;
  if (spec.thinkingOff) anthropic.thinking = { type: "disabled" };
  return { anthropic } as never;
}

export function taskConfig(task: AiTask): TaskConfig {
  return REGISTRY[task];
}
