/**
 * Built file vs a real camp file of the same kind (Phase G "look at examples"): matching sections (the 1NC
 * shell and the answers to the permutation) from each, shown blind as A and B in both orders to a judge
 * model scoring tag accuracy, evidence, analytics and round-readiness. Counts and scores only in <out.json>.
 *
 *   npx tsx --env-file=.env.local scripts/bench/file-vs-camp.ts <built.docx> <camp.docx> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { ingest } from "@/server/uploads";
import { readAloud, type BodyBlock } from "@/domain/card";
import { runStructured } from "@/server/ai/run";
import { MODELS } from "@/server/ai/models";
import type { ImportedItem } from "@/server/ingest/structure";

const [builtPath, campPath, out] = process.argv.slice(2);

/** The items under the first heading matching `re`, rendered as a debater would read them. */
function section(items: ImportedItem[], re: RegExp, maxCards = 5): string {
  const i = items.findIndex((x) => x.kind === "heading" && re.test(x.text));
  if (i < 0) return "(no such section)";
  const level = (items[i] as { level: number }).level;
  const lines: string[] = [`## ${(items[i] as { text: string }).text}`];
  let cards = 0;
  for (const it of items.slice(i + 1)) {
    if (it.kind === "heading" && it.level <= level) break;
    if (it.kind === "heading") lines.push(`### ${it.text}`);
    else if (it.kind === "analytic") lines.push(`ANALYTIC: ${it.text}`);
    else if (it.kind === "card" && cards++ < maxCards) {
      const read = readAloud(it.body as BodyBlock[]);
      const words = read.text.split(/\s+/);
      lines.push(`CARD — TAG: ${it.tag}\n  CITE: ${it.cite?.raw.slice(0, 260) ?? "(none)"}\n  ${read.basis === "highlight" ? "READ (highlighted)" : read.basis === "underline" ? "UNDERLINED" : "TEXT"}: ${words.slice(0, 160).join(" ")}${words.length > 160 ? " …" : ""}`);
    }
  }
  return lines.join("\n");
}

const load = async (p: string) => (await ingest(new Uint8Array(readFileSync(p)), p)).structure.items;
const built = await load(builtPath);
const camp = await load(campPath);
const pick = (items: ImportedItem[]) => `${section(items, /^1nc\b/i)}\n\n${section(items, /perm/i, 3)}`;
const X = { built: pick(built), camp: pick(camp) };

const Verdict = z.object({
  scores: z.object({
    A: z.object({ tagAccuracy: z.number(), evidence: z.number(), analytics: z.number(), readiness: z.number() }),
    B: z.object({ tagAccuracy: z.number(), evidence: z.number(), analytics: z.number(), readiness: z.number() }),
  }),
  better: z.enum(["A", "B", "tie"]),
  why: z.string(),
});
const SYSTEM = `You are an experienced high-school policy debate coach judging two evidence-file excerpts of the same kind of argument (a capitalism kritik): each has a 1NC shell and the answers to the permutation. They were written for different resolutions: judge the quality, not the topic. Score each 1–10 on: tagAccuracy (does each card's text support its tag, without overclaiming), evidence (qualified authors, strength and relevance of what the cards say), analytics (clear claim–warrant–impact, answering the other side's actual argument), readiness (could a debater read this in a round now: complete shell, organization, highlighting or underlining). Then say which excerpt is better overall, or tie, and why in 2–3 sentences.`;
const results: unknown[] = [];
for (const order of [["built", "camp"], ["camp", "built"]] as const) {
  const prompt = `EXCERPT A\n${X[order[0]]}\n\nEXCERPT B\n${X[order[1]]}`;
  const r = await runStructured({ task: "speech_draft", system: SYSTEM, prompt, schema: Verdict, models: [{ model: MODELS.opus55, effort: "medium", maxOutputTokens: 4000 }] as never });
  const map = { A: order[0], B: order[1] } as const;
  const v = r.output;
  const row = { order: order.join(" first, "), winner: v.better === "tie" ? "tie" : map[v.better], built: v.scores[order[0] === "built" ? "A" : "B"], camp: v.scores[order[0] === "camp" ? "A" : "B"], why: v.why };
  console.log(JSON.stringify(row));
  results.push(row);
}
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Blind pairwise judgment (Opus 5.5 medium), both orders; scores only.", results: results.map((r) => ({ ...(r as object), why: undefined })) }, null, 2));
