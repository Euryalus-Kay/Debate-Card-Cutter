/**
 * What AI use costs (standard API prices, USD per million tokens; docs/research/models-and-providers.md
 * §1.1). Cache reads bill at the cache-read rate and 1-hour cache writes at the write rate.
 */

export const PRICE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite1h: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite1h: 8 },
  "claude-sonnet-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite1h: 4 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1, cacheWrite1h: 2 },
};

interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}

/** Cost in USD of one call, or null for a model without a known price. */
export function costOf(model: string, usage: Usage | null | undefined): number | null {
  const p = PRICE[model];
  if (!p || !usage) return null;
  const read = usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
  const write = usage.inputTokenDetails?.cacheWriteTokens ?? usage.cacheWriteTokens ?? 0;
  const fresh = usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - read - write);
  return (fresh * p.in + read * p.cacheRead + write * p.cacheWrite1h + (usage.outputTokens ?? 0) * p.out) / 1e6;
}

/** What each task is called on the Settings page. */
export const TASK_LABEL: Record<string, string> = {
  speech_draft: "Speech drafts (deep)",
  speech_draft_fast: "Speech drafts (fast)",
  speech_patch: "Draft updates",
  speech_fit: "Fitting speeches to time",
  section_revise: "Section rewrites",
  section_alternatives: "Section alternatives",
  span_edit: "Selection edits and @AI comments",
  flow_extract: "Reading notes onto the flow",
  flow_interpret: "Flow interpretation",
  card_cut: "Cutting cards",
  card_support: "Checking cards support their tags",
  card_highlight: "Highlighting",
  research_plan: "Research searches",
  web_discover: "Research searches",
  web_fetch: "Reading blocked pages",
  file_segment: "Splitting imported files",
  card_label: "Labeling imported cards",
  evidence_fit: "Checking library cards fit",
  file_plan: "Planning files",
  cx_prep: "Cross-ex help",
  judge_paradigm: "Judge paradigms",
};
