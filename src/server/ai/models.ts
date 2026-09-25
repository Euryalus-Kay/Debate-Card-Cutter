/**
 * Model registry: every AI task resolves its model here, so models can be
 * changed per task without touching product code. Choices are justified in
 * docs/research/models-and-providers.md §8 and updated from live benchmarks
 * (docs/PROJECT_RECORD.md, "Model evaluation").
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type AiTask =
  | "flow_interpret" // roles + response links for a speech doc
  | "flow_extract" // typed notes / transcript lines → flow arguments (quote-checked)
  | "speech_draft" // full speech from flow + evidence
  | "speech_draft_fast"
  | "section_revise" // targeted rewrites (clarify / reword / condense / strengthen)
  | "section_alternatives"
  | "span_edit" // rewrite exactly the selected words, or reply to an @AI comment on them
  | "file_segment" // which paragraphs of an unstyled file are tags, cites, card text, headings (never writes text)
  | "card_label" // library labels for a card: side, argument type, position, role, one-line claim
  | "evidence_fit" // how well each library card fits what a speech needs (0–3), with what it proves there
  | "file_plan" // plan a whole evidence file: every speech's sections, card claims to find, analytics written out
  | "cx_prep" // cross-examination questions aimed at their warrants, or likely questions and answers for ours
  | "speech_fit" // whole-speech keep/condense/cut plan to fit the time limit
  | "speech_patch" // update an existing draft: add answers to new arguments, relink, minimal edits
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
  // benchmark-only (see isGemini)
  gemini38flash: "gemini-3.8-flash",
  gemini31pro: "gemini-3.1-pro-preview",
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
  // Mid-round, latency-critical (target ≤ 10 s per update on a few new lines): fast model first; every
  // output is quote-checked in code (src/domain/flow-extract.ts). Benchmarked by scripts/bench/flow-extract.ts.
  flow_extract: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 6000, firstChunkMs: 12000 },
    fallbacks: [{ model: MODELS.haiku45, maxOutputTokens: 6000, firstChunkMs: 12000 }, { model: MODELS.opus55, effort: "low", maxOutputTokens: 6000 }],
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
  // Whole-speech triage needs strategic judgement but must be fast mid-round: same tier as fast drafting.
  speech_fit: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 12000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 12000 }],
  },
  // Mid-round updates: the same strategic tier as fast drafting, but the output is only the changes.
  speech_patch: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 12000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 12000, firstChunkMs: 30000 }],
  },
  // Selection edits and comment replies are interactive: answer in seconds.
  span_edit: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 3000, firstChunkMs: 12000 },
    fallbacks: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 3000 }],
  },
  // Bulk library work on big files: cheapest model; outputs are labels only and are checked in code.
  file_segment: {
    primary: { model: MODELS.haiku45, maxOutputTokens: 4000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 4000 }],
  },
  card_label: {
    primary: { model: MODELS.haiku45, maxOutputTokens: 6000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 6000 }],
  },
  cx_prep: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 4000, firstChunkMs: 20000 },
    fallbacks: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 4000 }],
  },
  file_plan: {
    primary: { model: MODELS.opus55, effort: "medium", maxOutputTokens: 16000, firstChunkMs: 60000 },
    fallbacks: [{ model: MODELS.sonnet5, effort: "medium", maxOutputTokens: 16000 }],
  },
  evidence_fit: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 4000, firstChunkMs: 10000 },
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
  // Live runs 2026-09-25 (docs/evals/results/card-cut-run1.json, card-cut-run3.json; 7 real sources × 4 models):
  // Opus 5.5 low kept the author's hedges in tags, had zero formatting phrases that failed to match the source,
  // and no lint errors, at a median ~7 s. Sonnet 5 (thinking off) dropped hedges and skipped a negation once;
  // Haiku 4.5 missed phrases and under-highlighted. All refused to cut cards from sources that contradicted the claim.
  card_cut: {
    primary: { model: MODELS.opus55, effort: "low", maxOutputTokens: 8000, firstChunkMs: 30000 },
    fallbacks: [{ model: MODELS.sonnet5, effort: "low", maxOutputTokens: 8000, firstChunkMs: 30000 }, { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 8000 }],
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
  // Live check 2026-09-25 (scripts/try-paradigm.ts, synthetic paradigm): Sonnet 5 (thinking off) read
  // "I will not judge kick unless the 2NR tells me to" correctly as if-asked and set nothing unstated;
  // Haiku 4.5 recorded "no" and mislabeled a T statement as a theory view, with slower first output.
  paradigm: {
    primary: { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 3000, firstChunkMs: 20000 },
    fallbacks: [{ model: MODELS.haiku45, maxOutputTokens: 3000 }],
  },
};

let provider: ReturnType<typeof createAnthropic> | null = null;
let google: ReturnType<typeof createGoogleGenerativeAI> | null = null;

/**
 * Gemini models are for benchmarks only. Google's Gemini API terms bar apps
 * "likely to be accessed by individuals under the age of 18" (on every tier,
 * including via Vertex AI), so the production registry never routes to them.
 */
export const isGemini = (model: string) => model.startsWith("gemini-") || model.startsWith("gemma-");

export function languageModel(spec: ModelSpec): LanguageModel {
  if (isGemini(spec.model)) {
    if (!google) {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured (benchmarks only).");
      google = createGoogleGenerativeAI({ apiKey });
    }
    return google(spec.model);
  }
  if (!provider) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    // Explicit base URL: never inherit a proxy base URL from the environment.
    provider = createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" });
  }
  return provider(spec.model);
}

export function providerOptions(spec: ModelSpec) {
  if (isGemini(spec.model)) {
    // Gemini 3.8 Flash accepts low/medium/high ("minimal" is rejected), so "off" maps to low.
    const level = spec.effort === "medium" || spec.effort === "high" ? spec.effort : "low";
    return { google: { thinkingConfig: { thinkingLevel: level, includeThoughts: false } } } as never;
  }
  const anthropic: Record<string, unknown> = {};
  if (spec.effort) anthropic.effort = spec.effort;
  if (spec.thinkingOff) anthropic.thinking = { type: "disabled" };
  return { anthropic } as never;
}

export function taskConfig(task: AiTask): TaskConfig {
  return REGISTRY[task];
}
