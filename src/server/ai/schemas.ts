/**
 * Output schemas for AI tasks. Constrained by Anthropic structured outputs:
 * no recursion (flat lists linked by ids), required fields with empty-string
 * or empty-array sentinels instead of optional/nullable unions.
 */

import { z } from "zod";
import { ARG_ROLES } from "@/domain/flow";

export const SECTION_KINDS = ["overview", "position", "response", "extension", "impact_calc", "judge_instruction"] as const;
export const RELATIONS = ["answers", "group", "cross_apply", "extend", "new", "none"] as const;
export const ROLES = ["", ...ARG_ROLES] as const;

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
  outline: z.array(z.string()).describe("Before writing any section: the title of every section you will write, in speaking order (positions and the answers under them)"),
  sections: z.array(DraftSectionSchema),
  omitted: z.array(z.object({ targets: z.array(z.string()), reason: z.string() })).describe("arguments you deliberately did not answer and why"),
  questions: z.array(z.string()).describe("things the debaters should confirm (unclear record, missing evidence, judge preference)"),
});
export type SpeechDraftOutput = z.infer<typeof SpeechDraftSchema>;

/**
 * Updating an existing draft (A3): only what changed. New sections carry the
 * arguments they answer; code decides where they go. Existing sections are
 * linked (retargets) or rewritten (edits) only when that is the smallest fix.
 */
export const PatchPlanSchema = z.object({
  summary: z.string().describe("One or two sentences: what this update changes and why."),
  adds: z.array(
    DraftSectionSchema.extend({
      ref: z.string().describe("Your local id for this new section, e.g. n1, n2"),
      parentRef: z.string().describe("ref of another NEW section in this update that contains it (only when you add a whole new position with its answers), else empty string"),
      anchor: z.string().describe("id of the EXISTING draft section it belongs under (the section holding that position's answers), else empty string"),
    }),
  ),
  retargets: z
    .array(z.object({ sectionId: z.string(), addTargets: z.array(z.string()).describe("ids of new arguments this existing section already answers as written"), reason: z.string() }))
    .describe("existing sections that already answer a new argument as written: link them instead of writing a duplicate answer"),
  edits: z
    .array(
      z.object({
        sectionId: z.string(),
        title: z.string(),
        analytic: z.string().describe("the section's full new analytic text; change only the sentences that must change"),
        cardIds: z.array(z.string()).describe("cards to read: the section's current cards, plus provided cards only if the change needs them"),
        reason: z.string(),
      }),
    )
    .describe("existing sections whose answer must change (the argument it answers changed, or the team asked); keep everything that still works"),
  notAddressed: z.array(z.object({ targets: z.array(z.string()), reason: z.string() })).describe("arguments you deliberately leave unanswered, and why"),
  questions: z.array(z.string()),
});
export type PatchPlanOutput = z.infer<typeof PatchPlanSchema>;

/** A change to exactly the words a debater selected (A7). */
export const SpanEditSchema = z.object({
  replacement: z.string().describe("The new text for exactly the selected words. It must read naturally between the text before and after them. Plain text."),
  note: z.string().describe("One short sentence: what changed and why."),
});
export type SpanEditOutput = z.infer<typeof SpanEditSchema>;

/** The AI's reply in a comment thread on the speech, with an optional change to the commented words (A7). */
export const CommentReplySchema = z.object({
  reply: z.string().describe("Your reply in the thread: answer the question or give the critique, specific to these words and this round, in two to five sentences."),
  replacement: z.string().describe("Only if changing the commented words would help: the full new text for exactly those words. Otherwise an empty string."),
  note: z.string().describe("If you suggested new words: one short sentence on what they change. Otherwise an empty string."),
});
export type CommentReplyOutput = z.infer<typeof CommentReplySchema>;

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
      action: z.enum(["keep", "condense", "cut", "expand"]),
      targetSeconds: z.number().describe("condense: the intended length of this section's own content in seconds; keep: its current seconds; cut: 0"),
      title: z.string().describe("condense/expand: the section heading; otherwise empty"),
      analytic: z.string().describe("condense/expand: the new analytic text to say (shorter for condense, fuller for expand); otherwise empty"),
      cardIds: z.array(z.string()).describe("condense: which of this section's card ids to keep; expand: this section's cards plus any provided evidence cards to add"),
      reason: z.string().describe("one short phrase: why this section is kept, condensed, or cut"),
    }),
  ),
  sacrificed: z.array(z.string()).describe("what the speech gives up, in plain words (answers dropped, weaker coverage, less impact comparison)"),
});
export type FitPlanOutput = z.infer<typeof FitPlanSchema>;

export const TopUpSchema = z.object({
  sections: z.array(z.object({ sectionId: z.string(), analytic: z.string().describe("the full new analytic text for this section, at the requested length") })),
});

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

/** Reading typed notes or transcript lines onto the flow. Every argument must quote its own line. */
export const FlowExtractSchema = z.object({
  lines: z.array(
    z.object({
      line: z.number().describe("the input line number"),
      action: z.enum(["create", "same_as", "not_argument"]).describe("create = new argument(s); same_as = repeats an argument already on the flow; not_argument = roadmap, header, filler, question"),
      category: z.string().describe("for not_argument: header, roadmap, filler, question, or other; else empty"),
      sameAs: z.string().describe("for same_as: the id of the existing argument; else empty"),
      args: z.array(
        z.object({
          quote: z.string().describe("the exact words from this line that this argument is (copied, not reworded)"),
          text: z.string().describe("the argument as a short flow entry; stay close to the line's words, expanding only shorthand"),
          warrant: z.string().describe("the reason given on the line, if any; else empty"),
          role: z.enum(ARG_ROLES),
          evidence: z.enum(["card", "analytic"]).describe("card if the line names an author/cite or evidence; else analytic"),
          label: z.string().describe("the number or letter the debater typed (\"3\", \"B\"), else empty"),
          positionId: z.string().describe("id of the existing position it belongs to, else empty"),
          newPositionName: z.string().describe("if it starts a new position: its name, else empty"),
          newPositionKind: z.string().describe("for a new position: advantage, solvency, da, cp, k, t, theory, framework, case_other, or other; else empty"),
          answers: z.array(z.string()).describe("ids of OUR arguments this responds to"),
          confidence: z.number().describe("0–1: how sure you are of this reading"),
        }),
      ),
    }),
  ),
});
export type FlowExtractOutput = z.infer<typeof FlowExtractSchema>;
