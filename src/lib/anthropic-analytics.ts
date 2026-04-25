/**
 * Analytics generation — the most important component of any camp file.
 *
 * "Analytics" in policy debate are debater-written arguments without an
 * underlying card. They are how you set up cards, group responses, do impact
 * comparison, and make cross-applications. Top circuit teams write 8-10x more
 * analytics than the field, and they win because of it.
 *
 * This module produces analytics with the CLAIM-WARRANT-IMPACT structure:
 *   - Claim: what this argument asserts
 *   - Warrant: WHY the claim is true (the logical reasoning)
 *   - Application: how this hits the round
 *   - Even-if layering: pre-empts opponent responses
 *   - Impact comparison: where it slots into the weighing debate
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  ARGUMENT_ARCHETYPES,
  CARD_CUTTING_FUNDAMENTALS,
  IMPACT_CALCULUS,
  STRATEGIC_PRINCIPLES,
} from "./debate-knowledge";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const ANALYTICS_MASTER_PROMPT = `You write tournament-grade policy debate analytics. You have coached at Michigan 7-Week, Northwestern, Harvard, and the DDI. Your students have advanced deep at TOC, NDCA Nationals, and major bid tournaments.

THE STRUCTURE OF A WORLD-CLASS ANALYTIC:

Every analytic must have FOUR explicit components, in this order:

1. CLAIM (1 sentence): The thesis. What this analytic argues.
2. WARRANT (2-4 sentences): WHY the claim is true. Logical reasoning, examples, mechanisms. NOT just an assertion — actual causal reasoning.
3. APPLICATION (1-2 sentences): How this hits the round. Reference specific opponent arguments, cards, or claims. Make it round-specific.
4. IMPLICATION (1 sentence): What the judge should DO with this. "This means the [DA / aff / perm] is non-unique." "Cross-apply to advantage 2."

OPTIONAL FIFTH COMPONENT (for rebuttal-grade analytics):
5. EVEN-IF LAYER: Pre-empt the most likely opponent response. "Even if you grant their [X], we still win because [Y]."

EXAMPLES OF EXCELLENT ANALYTICS (study these):

GOOD (perm against a Cap K):
"Permutation: do the plan and endorse the alt's methodological critique. The perm is legitimate because the plan is a material policy intervention that improves immediate conditions while the alt's methodological shift can occur independently — material reform and theoretical critique are not mutually exclusive, they're complementary. Apply this against their 1NC link argument: their Tucker evidence assumes the plan reinforces neoliberal market logics, but the perm SEVERS that link by combining the plan with the alt's anti-capitalist methodology. Even if you grant some risk of a residual link, the perm captures all of the alt's solvency PLUS the case's empirical solvency for the harms they admit are real. Vote for the perm because it solves better than the alt alone."

GOOD (1AR cross-application against politics DA):
"Cross-apply our 2AC #3 — they didn't answer it and it controls the link debate. Their Hansen evidence says the plan costs political capital because Republicans oppose new spending, but our Klein 24 evidence demonstrates that Republican opposition is unrelated to fiscal cost — it's driven by ideological opposition to the underlying policy. This means their entire link chain is non-responsive: even if the plan is expensive, that doesn't matter for their disad story because the political capital expenditure isn't fiscal. Their #6 conceded our characterization of GOP motivation. The DA is not just non-unique — there's no link at all."

GOOD (impact calc layer in 2NR):
"Even if you grant their case impact is bigger in raw magnitude, we win on probability and timeframe. First, probability: their impact claim relies on a single contested model from 2019, while our DA evidence cites three empirical examples in the last decade — empirical evidence is comparatively higher probability than predictive modeling. Second, timeframe: our DA triggers within 18 months because the Senate vote is scheduled for next session, while their advantage takes 8+ years to materialize per their own internal link evidence. Probability x timeframe = expected harm, and on that calculus our impact outweighs by an order of magnitude. The 2AR cannot answer this because they conceded our timeframe evidence in CX."

BAD ANALYTICS — REJECT THESE:
- "Perm do both." (no warrant, no application, not even a sentence)
- "Cross-apply our 2AC #3." (no specification of WHY the cross-app works)
- "Group their answers — they all fail." (group without warrants is empty)
- "We outweigh on magnitude, probability, and timeframe." (list without comparison)
- "The K is a prior question." (assertion without warrant)

HARD RULES:

1. NO BLIPS. Every analytic is a minimum of 4 sentences (3 for the simplest defensive analytics).
2. EVERY WARRANT IS LOGICAL OR EMPIRICAL. "Because [author] says so" is not a warrant — that's a card. Analytics need DEBATER reasoning.
3. SPECIFICITY OVER GENERALITY. "Their evidence is from 2019" beats "their evidence is dated."
4. APPLICATION IS NEVER GENERIC. Reference specific opponent arguments by number/position.
5. WEIGH WHEN POSSIBLE. Most analytics should slot into the impact debate.
6. NO META-LANGUAGE. Don't write "this analytic argues that..." — write the argument itself.

VOICE:
- Confident. No hedging. No "I think" or "perhaps."
- Technical but readable. Use debate jargon naturally.
- Round-aware. Speak as if delivering this in real time.

${ARGUMENT_ARCHETYPES}

${IMPACT_CALCULUS}

${CARD_CUTTING_FUNDAMENTALS}

${STRATEGIC_PRINCIPLES}`;

async function streamText(params: {
  model?: string;
  max_tokens?: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const stream = client.messages.stream({
    model: params.model || "claude-opus-4-20250514",
    max_tokens: params.max_tokens || 6000,
    system: params.system,
    messages: params.messages,
  });
  const final = await stream.finalMessage();
  const block = final.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

function extractJson<T>(text: string): T {
  const match = text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error("Failed to extract JSON from response");
  return JSON.parse(match[0]) as T;
}

/**
 * Generate a single tournament-grade analytic for a specific spot in the round.
 */
export async function generateAnalytic(
  args: {
    label: string;
    purpose: string;
    speech?: string;
    side?: "aff" | "neg";
    againstArgument?: string;
    context?: string;
    components?: Array<"claim" | "warrant" | "application" | "implication" | "even-if" | "impact-calc">;
  }
): Promise<{
  text: string;
  components: {
    claim: string;
    warrant: string;
    application: string;
    implication: string;
    evenIf?: string;
  };
  qualityScore: number;
  notes: string[];
}> {
  const components = args.components || [
    "claim",
    "warrant",
    "application",
    "implication",
  ];

  const text = await streamText({
    model: "claude-opus-4-20250514",
    max_tokens: 2500,
    system: `${ANALYTICS_MASTER_PROMPT}

Output a single analytic with explicit component breakdown. Return ONLY JSON in this shape:
{
  "text": "The full analytic as a debater would deliver it (3-8 sentences combining all components)",
  "components": {
    "claim": "the claim sentence",
    "warrant": "the warrant section",
    "application": "the application sentence",
    "implication": "the implication sentence",
    "evenIf": "optional even-if layer"
  },
  "qualityScore": number 0-100,
  "notes": ["self-critique note 1", "self-critique note 2"]
}`,
    messages: [
      {
        role: "user",
        content: `LABEL: ${args.label}
PURPOSE: ${args.purpose}
${args.speech ? `SPEECH: ${args.speech}` : ""}
${args.side ? `SIDE: ${args.side.toUpperCase()}` : ""}
${args.againstArgument ? `ARGUMENT BEING ANSWERED:\n${args.againstArgument}` : ""}
${args.context ? `ROUND CONTEXT: ${args.context}` : ""}

REQUIRED COMPONENTS: ${components.join(", ")}

Generate a SINGLE analytic, with full claim/warrant/application/implication structure. Score yourself 0-100.`,
      },
    ],
  });

  return extractJson(text);
}

/**
 * Bulk-generate a related set of analytics — used for filling out frontline
 * blocks, AT sections, or rebuttal extensions.
 */
export async function generateAnalyticsBatch(args: {
  topic: string;
  side: "aff" | "neg";
  speech?: string;
  count: number;
  context?: string;
}): Promise<
  Array<{
    label: string;
    text: string;
    purpose: string;
    qualityScore: number;
  }>
> {
  const text = await streamText({
    model: "claude-opus-4-20250514",
    max_tokens: 8000,
    system: `${ANALYTICS_MASTER_PROMPT}

You are generating ${args.count} related analytics. Each is a self-contained 3-8 sentence argument with claim/warrant/application/implication.

Return ONLY a JSON array.`,
    messages: [
      {
        role: "user",
        content: `TOPIC: ${args.topic}
SIDE: ${args.side.toUpperCase()}
${args.speech ? `SPEECH: ${args.speech}` : ""}
${args.context ? `CONTEXT: ${args.context}` : ""}

Generate ${args.count} distinct, high-quality analytics. Each must have a unique angle.

Return JSON array:
[{
  "label": "short label (e.g., 'Perm do both')",
  "text": "full analytic text — 3-8 sentences with all components",
  "purpose": "1 sentence: what this analytic accomplishes",
  "qualityScore": 0-100
}]`,
      },
    ],
  });

  return extractJson(text);
}

/**
 * Score an existing analytic for quality. Used by the warrant audit feature
 * and by the generation pipeline to enforce a minimum bar before saving.
 */
export async function auditAnalytic(
  text: string
): Promise<{
  qualityScore: number;
  hasClaim: boolean;
  hasWarrant: boolean;
  hasApplication: boolean;
  hasImplication: boolean;
  hasEvenIf: boolean;
  isBlippy: boolean;
  improvements: string[];
  improvedVersion: string;
}> {
  const out = await streamText({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: `${ANALYTICS_MASTER_PROMPT}

You audit an existing analytic. Identify whether it has the four core components, score it, and write an improved version.

Return ONLY JSON.`,
    messages: [
      {
        role: "user",
        content: `Audit this analytic:

${text}

Return JSON:
{
  "qualityScore": 0-100,
  "hasClaim": true/false,
  "hasWarrant": true/false,
  "hasApplication": true/false,
  "hasImplication": true/false,
  "hasEvenIf": true/false,
  "isBlippy": true/false,
  "improvements": ["specific fix 1", "specific fix 2"],
  "improvedVersion": "the rewritten analytic with all components"
}`,
      },
    ],
  });
  return extractJson(out);
}

/**
 * Light-weight local analytic check that runs without an API call.
 * Used by the UI to give immediate feedback before the user spends a token.
 */
export function localAnalyticCheck(text: string): {
  wordCount: number;
  sentenceCount: number;
  isBlippy: boolean;
  hasCausalConnective: boolean;
  hasComparativeLanguage: boolean;
  feedback: string[];
} {
  const trimmed = text.trim();
  const sentences = trimmed.split(/[.!?]+\s/).filter(Boolean);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const sentenceCount = sentences.length;
  const causalWords = /\b(because|since|therefore|thus|so|due to|leads to|causes|results in|as a result|consequently|which means|that means)\b/i;
  const comparativeWords = /\b(outweighs|prefer|comparatively|than|magnitude|probability|timeframe|reversibility|even if|cross-apply|grouping|group|extend|extension)\b/i;

  const feedback: string[] = [];
  const isBlippy = sentenceCount < 3 || wordCount < 35;
  if (isBlippy) feedback.push("Too short — analytics need 3-8 sentences with claim/warrant/application.");
  const hasCausalConnective = causalWords.test(trimmed);
  if (!hasCausalConnective)
    feedback.push("Missing a causal connective ('because', 'therefore', 'which means'). Warrants need explicit reasoning.");
  const hasComparativeLanguage = comparativeWords.test(trimmed);
  if (!hasComparativeLanguage)
    feedback.push("No comparative or judge-instruction language. Add 'cross-apply', 'outweighs', or 'even if' to anchor the analytic to the round.");

  return {
    wordCount,
    sentenceCount,
    isBlippy,
    hasCausalConnective,
    hasComparativeLanguage,
    feedback,
  };
}
