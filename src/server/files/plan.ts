/**
 * Planning a file (Phase E): the whole kit for an argument, speech by speech, as an outline of card claims
 * to find and analytics written out. The plan is shown to the team before anything is spent on research.
 */

import { z } from "zod";
import { runStructured } from "@/server/ai/run";
import { stripIds } from "@/domain/span-check";
import { CARD_USES, type CardUse } from "@/domain/card-use";
import { FILE_KIND_LABEL, FILE_KNOWLEDGE, FILE_RULES, sideOf, type FileKind } from "./knowledge";

export const FilePlanSchema = z.object({
  title: z.string().describe("The file's title as camp files name them, e.g. 'DA — Capital Flight' or 'Aff — Single Payer'"),
  notes: z.string().describe("File notes: 3–6 sentences a lab leader would brief — what it's for, which opponents, how to extend it, how it wins in the last rebuttal"),
  sections: z.array(
    z.object({
      heading: z.string().describe("H2: the speech and position, e.g. '1NC — Capital Flight DA', '2NC — AT: Link Turn'"),
      speech: z.enum(CARD_USES).describe("the speech this section is read in (block = 2NC/1NR; rebuttal = 2NR/2AR)"),
      blocks: z.array(
        z.object({
          heading: z.string().describe("H3 block title, e.g. 'Uniqueness', 'AT: Perm do both'"),
          items: z.array(
            z.object({
              kind: z.enum(["card", "analytic", "text"]),
              label: z.string().describe("card: the claim its evidence must make, one sentence; analytic: its short label for the outline (1–4 words); text: 'Plan text', 'CP text', 'Alt text' or 'Interpretation'"),
              text: z.string().describe("analytic: the whole analytic exactly as read, starting with its number and label ('1. No link — the plan …'); text: the words of the plan, CP, alt or interpretation; card: empty"),
              search: z.string().describe("card: what source would make this claim (kind of expert or institution, key terms, how recent); else empty"),
            }),
          ),
        }),
      ),
    }),
  ),
  questions: z.array(z.string()).describe("anything the team should decide or confirm"),
});
export type FilePlan = z.infer<typeof FilePlanSchema>;

export interface FileBuildInput {
  kind: FileKind;
  /** for an answers file: whose answers */
  side?: "aff" | "neg";
  /** what the argument is, in the team's words */
  argument: string;
  resolution: string;
  /** optional: the opponent's aff or the arguments this file answers */
  target?: string;
  /** the most cards to find */
  maxCards: number;
  instructions?: string;
}

export function planPrompt(input: FileBuildInput): string {
  return [
    `Plan a complete ${FILE_KIND_LABEL[input.kind].toLowerCase()} file for the ${sideOf(input).toUpperCase()}.`,
    `Argument: ${input.argument}`,
    `Resolution: ${input.resolution}`,
    input.target ? `Against / for: ${input.target}` : "",
    input.instructions ? `Team instructions: ${input.instructions}` : "",
    `Card budget: at most ${input.maxCards} card items in the whole file (analytics and text items don't count).`,
    `Cover every speech this argument is read in, as the structure below describes.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A small plan with the right shape, for tests and AI_FAKE. */
function fakePlan(input: FileBuildInput): FilePlan {
  const neg = sideOf(input) === "neg";
  const name = input.argument.split(/[.:—-]/)[0].trim().slice(0, 40) || "Argument";
  return {
    title: `[AI_FAKE] ${FILE_KIND_LABEL[input.kind]} — ${name}`,
    notes: "[AI_FAKE] Read the shell first; extend the strongest link in the block.",
    sections: [
      {
        heading: `${neg ? "1NC" : "1AC"} — ${name}`,
        speech: neg ? "1NC" : "1AC",
        blocks: [
          {
            heading: neg ? "Shell" : "Advantage",
            items: [
              { kind: "card", label: `${name} is happening now`, text: "", search: "recent expert analysis" },
              { kind: "card", label: `The plan causes ${name}`, text: "", search: "policy analysts" },
              { kind: "analytic", label: "Impact", text: "Impact — [AI_FAKE] that outweighs because it is faster and larger than their impact.", search: "" },
            ],
          },
        ],
      },
      {
        heading: `${neg ? "2NC" : "2AC"} — AT: ${neg ? "Link turn" : "Counterplan"}`,
        speech: neg ? "block" : "2AC",
        blocks: [{ heading: "AT: Turn", items: [{ kind: "analytic", label: "No turn", text: "1. No turn — [AI_FAKE] their turn assumes the status quo, so it doesn't apply to the plan.", search: "" }] }],
      },
    ],
    questions: [],
  };
}

/** Clean a plan: ids out, empty blocks and sections dropped, the card budget held. */
export function cleanPlan(plan: FilePlan, maxCards: number): FilePlan {
  let cards = 0;
  const sections = plan.sections
    .map((s) => ({
      ...s,
      heading: stripIds(s.heading),
      blocks: s.blocks
        .map((b) => ({
          ...b,
          heading: stripIds(b.heading),
          items: b.items
            .map((i) => ({ ...i, label: stripIds(i.label).trim(), text: stripIds(i.text).trim(), search: i.search.trim() }))
            .filter((i) => i.label || i.text)
            .filter((i) => i.kind !== "card" || ++cards <= maxCards),
        }))
        .filter((b) => b.items.length),
    }))
    .filter((s) => s.blocks.length);
  return { ...plan, title: stripIds(plan.title), notes: stripIds(plan.notes), sections, questions: plan.questions.map(stripIds) };
}

export async function planFile(input: FileBuildInput, opts: { teamId: string; abortSignal?: AbortSignal; onPartial?: (p: unknown) => void }) {
  const system = `You are a debate camp lab leader planning a complete, tournament-ready evidence file for high-school policy debate.\n\n${FILE_KNOWLEDGE[input.kind]}\n\n${FILE_RULES}`;
  const res = await runStructured({ task: "file_plan", system, prompt: planPrompt(input), schema: FilePlanSchema, teamId: opts.teamId, abortSignal: opts.abortSignal, onPartial: opts.onPartial, fake: () => fakePlan(input) });
  return { plan: cleanPlan(res.output, input.maxCards), run: res };
}

export function cardItems(plan: FilePlan): { section: number; block: number; item: number; use: CardUse; label: string; search: string }[] {
  const out: { section: number; block: number; item: number; use: CardUse; label: string; search: string }[] = [];
  plan.sections.forEach((s, si) => s.blocks.forEach((b, bi) => b.items.forEach((it, ii) => it.kind === "card" && out.push({ section: si, block: bi, item: ii, use: s.speech, label: it.label, search: it.search }))));
  return out;
}

export { analyticLine } from "@/domain/analytic-line";
