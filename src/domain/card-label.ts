/**
 * Library labels a card carries (see src/server/library/label.ts for how they are made): what it proves, where
 * it fits, and a clearer tag when the file's tag doesn't say the claim. Shared by the library pages and the AI.
 */

export const ARG_TYPES = ["advantage", "solvency", "inherency", "plan", "disad", "counterplan", "kritik", "topicality", "theory", "case_answer", "impact", "framework", "other"] as const;
export const CARD_ROLES = ["uniqueness", "link", "internal_link", "impact", "solvency", "answer", "turn", "alternative", "perm", "interpretation", "standard", "framework", "other"] as const;
export const SPEECH_NAMES = ["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"] as const;

export interface CardMeta {
  side: "aff" | "neg" | "either";
  argType: (typeof ARG_TYPES)[number];
  position: string;
  role: (typeof CARD_ROLES)[number];
  /** what the card proves, from its own words */
  claim: string;
  /** where it fits: the speeches that read it and what it answers or sets up */
  use?: string;
  speeches?: (typeof SPEECH_NAMES)[number][];
  /** a clearer tag, only when the file's tag doesn't state the claim; shown as a suggestion, never applied */
  suggestedTag?: string;
  /** what the checks removed, so a person can see why a label is missing */
  dropped?: string[];
  /** set when the labels came from the model */
  by?: "ai" | "file";
}

/** The words a card's labels are searched by. */
export function metaText(m: CardMeta): string {
  return [m.side === "either" ? "" : m.side, m.argType.replace("_", " "), m.position, m.role.replace("_", " "), m.claim, m.use ?? "", m.suggestedTag ?? ""].filter(Boolean).join(" · ");
}

/** One line for a person or a model: "neg · Midterms DA · link — claim. Use: …" */
export function labelLine(m: CardMeta | null | undefined): string {
  if (!m) return "";
  const head = [m.side === "either" ? "" : m.side, m.position, m.role === "other" ? "" : m.role.replace("_", " ")].filter(Boolean).join(" · ");
  return [head, m.claim ? `proves: ${m.claim}` : "", m.use ? `use: ${m.use}` : ""].filter(Boolean).join(" — ");
}
