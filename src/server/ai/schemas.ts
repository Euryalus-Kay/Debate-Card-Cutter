/**
 * Output schemas for AI tasks. Constrained by Anthropic structured outputs:
 * no recursion (flat lists linked by ids), required fields with empty-string
 * or empty-array sentinels instead of optional/nullable unions.
 */

import { z } from "zod";

export const SECTION_KINDS = ["overview", "position", "response", "extension", "impact_calc", "judge_instruction"] as const;
export const RELATIONS = ["answers", "group", "cross_apply", "extend", "new", "none"] as const;
export const ROLES = [
  "",
  "uniqueness",
  "link",
  "internal_link",
  "impact",
  "solvency",
  "perm",
  "theory",
  "non_unique",
  "no_link",
  "no_internal_link",
  "no_impact",
  "impact_mitigation",
  "link_turn",
  "impact_turn",
  "impact_calc",
  "framework",
  "alternative",
  "counter_interpretation",
  "we_meet",
  "defense",
  "other",
] as const;

export const DraftSectionSchema = z.object({
  ref: z.string().describe("Your local id for this section, e.g. s1, s2"),
  parentRef: z.string().describe("ref of the enclosing position section, or empty string for top level"),
  kind: z.enum(SECTION_KINDS),
  title: z.string().describe("Signpost/heading, e.g. 'Politics DA' or '1. Non-unique — the bill is already dead'"),
  relation: z.enum(RELATIONS),
  targets: z.array(z.string()).describe("ids of the flow arguments this section answers, groups, cross-applies against, or extends"),
  crossApplyFrom: z.string().describe("for cross_apply: the id of our argument being cross-applied; else empty string"),
  role: z.enum(ROLES).describe("argument role when this section is a single argument, else empty string"),
  analytic: z.string().describe("What to say, in speech-ready words (your reasoning; never attributed to an author). Empty if the section is only a card."),
  cardIds: z.array(z.string()).describe("ids of PROVIDED cards to read in this section, in order"),
  needsEvidence: z.string().describe("If a warrant needs a card that wasn't provided, describe the card to find; else empty"),
  budgetSeconds: z.number().describe("planned speaking time for this section"),
  priority: z.number().describe("1 = must keep, 2 = important, 3 = cut first if over time"),
});

export const SpeechDraftSchema = z.object({
  strategy: z.object({
    summary: z.string().describe("2–4 sentences: the path to the ballot and why"),
    choices: z.array(z.string()).describe("key strategic choices, e.g. 'go for the DA, kick the CP by conceding the solvency deficit'"),
    risks: z.array(z.string()).describe("what could lose this speech or the round, and how the draft handles it"),
  }),
  sections: z.array(DraftSectionSchema),
  omitted: z.array(z.object({ targets: z.array(z.string()), reason: z.string() })).describe("arguments you deliberately did not answer and why"),
  questions: z.array(z.string()).describe("things the debaters should confirm (unclear record, missing evidence, judge preference)"),
});
export type SpeechDraftOutput = z.infer<typeof SpeechDraftSchema>;

export const SectionRevisionSchema = z.object({
  title: z.string(),
  analytic: z.string(),
  cardIds: z.array(z.string()).describe("cards to keep/read, from the section's current cards or the provided cards"),
  needsEvidence: z.string(),
  note: z.string().describe("one short sentence explaining what changed and why"),
});
export type SectionRevisionOutput = z.infer<typeof SectionRevisionSchema>;

export const FitPlanSchema = z.object({
  summary: z.string().describe("One or two sentences: how the speech was fit to time and what it prioritizes."),
  plan: z.array(
    z.object({
      sectionId: z.string(),
      action: z.enum(["keep", "condense", "cut"]),
      targetSeconds: z.number().describe("condense: the intended length of this section's own content in seconds; keep: its current seconds; cut: 0"),
      title: z.string().describe("condense only: the section heading (may be shorter); otherwise empty"),
      analytic: z.string().describe("condense only: the new, shorter analytic text to say; otherwise empty"),
      cardIds: z.array(z.string()).describe("condense only: which of this section's card ids to keep reading"),
      reason: z.string().describe("one short phrase: why this section is kept, condensed, or cut"),
    }),
  ),
  sacrificed: z.array(z.string()).describe("what the speech gives up, in plain words (answers dropped, weaker coverage, less impact comparison)"),
});
export type FitPlanOutput = z.infer<typeof FitPlanSchema>;

export const AlternativesSchema = z.object({
  options: z.array(
    z.object({
      label: z.string().describe("short name for the approach"),
      approach: z.string().describe("the strategic idea in one or two sentences"),
      tradeoff: z.string().describe("what it gains and what it risks or concedes"),
      title: z.string(),
      analytic: z.string(),
      cardIds: z.array(z.string()),
      role: z.enum(ROLES),
    }),
  ),
});
export type AlternativesOutput = z.infer<typeof AlternativesSchema>;

export const FlowInterpretSchema = z.object({
  args: z.array(
    z.object({
      argId: z.string().describe("id of the flow argument being interpreted"),
      claim: z.string().describe("short flow text of the claim (≤ 20 words)"),
      warrant: z.string().describe("the reasoning/evidence behind it in ≤ 30 words, or empty"),
      role: z.enum(ROLES),
      offensive: z.boolean(),
      confidence: z.number().describe("0–1"),
    }),
  ),
  links: z.array(
    z.object({
      from: z.string().describe("argument id that responds"),
      to: z.array(z.string()).describe("argument ids it responds to"),
      type: z.enum(["answers", "extends", "cross_applies", "turns"]),
      grouped: z.boolean(),
      explicit: z.boolean().describe("true if the document signposts it (numbering, 'extend X', 'they say')"),
      confidence: z.number().describe("0–1"),
    }),
  ),
  positionMerges: z.array(z.object({ positionId: z.string(), sameAs: z.string(), reason: z.string() })).describe("positions that are the same sheet under different names"),
  notes: z.array(z.string()),
});
export type FlowInterpretOutput = z.infer<typeof FlowInterpretSchema>;
