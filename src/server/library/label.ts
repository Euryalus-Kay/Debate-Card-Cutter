/**
 * Library labels (Phase B1): side, argument type, the position it belongs to,
 * its role in that argument, and a one-line claim, so speeches can find the
 * right card. A cheap model reads the tag, cite, file headings and the words a
 * debater reads; it never changes the card. Labels are searchable (meta_text).
 */

import { z } from "zod";
import { readAloud, type BodyBlock } from "@/domain/card";
import { runStructured } from "@/server/ai/run";

export const ARG_TYPES = ["advantage", "solvency", "inherency", "plan", "disad", "counterplan", "kritik", "topicality", "theory", "case_answer", "impact", "framework", "other"] as const;
export const CARD_ROLES = ["uniqueness", "link", "internal_link", "impact", "solvency", "answer", "turn", "alternative", "perm", "interpretation", "standard", "framework", "other"] as const;

export interface CardMeta {
  side: "aff" | "neg" | "either";
  argType: (typeof ARG_TYPES)[number];
  position: string;
  role: (typeof CARD_ROLES)[number];
  claim: string;
  /** set when the labels came from the model */
  by?: "ai" | "file";
}

export const CardLabelSchema = z.object({
  cards: z.array(
    z.object({
      n: z.number().describe("the card's number in the list"),
      side: z.enum(["aff", "neg", "either"]).describe("which side reads it"),
      argType: z.enum(ARG_TYPES),
      position: z.string().describe("the argument it belongs to, in 1–5 words (e.g. 'Politics DA', 'States CP', 'Cap K', 'Heg advantage')"),
      role: z.enum(CARD_ROLES),
      claim: z.string().describe("what the card proves, in one plain sentence of at most 20 words, from its words only"),
    }),
  ),
});

export interface LabelInput {
  tag: string;
  cite: string;
  path: string[];
  body: BodyBlock[];
  fileName?: string;
}

const SYSTEM = `You label policy debate evidence cards for a team's library, so they can be found later. Read each card's file headings, tag, cite and read text, and say:
- side: aff, neg, or either (general impact or theory cards).
- argType: the kind of argument (advantage, solvency, inherency, plan, disad, counterplan, kritik, topicality, theory, case_answer, impact, framework, other).
- position: the argument it belongs to, in 1–5 words, as debaters name it.
- role: what it does in that argument (uniqueness, link, internal_link, impact, solvency, answer, turn, alternative, perm, interpretation, standard, framework, other).
- claim: what the card itself proves, in one plain sentence, only from its words.
Headings like "2AC — Politics DA" or "AT: Perm" tell you the side and position. Never invent facts.`;

/** The words a card's labels are searched by. */
export function metaText(m: CardMeta): string {
  return [m.side === "either" ? "" : m.side, m.argType.replace("_", " "), m.position, m.role.replace("_", " "), m.claim].filter(Boolean).join(" · ");
}

export async function labelCards(items: LabelInput[], opts: { teamId: string; abortSignal?: AbortSignal; onUsage?: (u: { inputTokens?: number; outputTokens?: number } | null) => void }): Promise<(CardMeta | null)[]> {
  if (!items.length) return [];
  const list = items
    .map((c, i) => {
      const read = readAloud(c.body).text.split(/\s+/).slice(0, 90).join(" ");
      return `${i + 1}. FILE: ${c.fileName ?? ""} ${c.path.length ? `> ${c.path.join(" > ")}` : ""}\n   TAG: ${c.tag.slice(0, 300)}\n   CITE: ${c.cite.slice(0, 160)}\n   READ: ${read}`;
    })
    .join("\n");
  const res = await runStructured({
    task: "card_label",
    system: SYSTEM,
    prompt: `${list}\n\nLabel every card above, by its number.`,
    schema: CardLabelSchema,
    teamId: opts.teamId,
    abortSignal: opts.abortSignal,
    // Side from the file's headings, as a reader would (neg speeches or files → neg; aff ones → aff).
    fake: () => ({
      cards: items.map((c, i) => {
        const where = `${c.fileName ?? ""} ${c.path.join(" ")}`;
        const side = /\b(1NC|2NC|1NR|2NR|neg)\b/i.test(where) ? ("neg" as const) : /\b(1AC|2AC|1AR|2AR|aff)\b/i.test(where) ? ("aff" as const) : ("either" as const);
        return { n: i + 1, side, argType: "other" as const, position: c.path[c.path.length - 1]?.slice(0, 40) ?? "", role: "other" as const, claim: c.tag.slice(0, 120) };
      }),
    }),
  });
  opts.onUsage?.(res.usage);
  const out: (CardMeta | null)[] = items.map(() => null);
  for (const c of res.output.cards) {
    const i = Math.round(c.n) - 1;
    if (i < 0 || i >= items.length || out[i]) continue;
    out[i] = { side: c.side, argType: c.argType, position: c.position.slice(0, 60), role: c.role, claim: c.claim.slice(0, 240), by: "ai" };
  }
  return out;
}
