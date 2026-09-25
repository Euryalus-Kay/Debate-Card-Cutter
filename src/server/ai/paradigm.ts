/**
 * Judge paradigm → structured profile (debate-domain.md JUD-1..3).
 *
 * Preferences are inferred ONLY from explicit statements: every value must
 * come with a quote that appears in the paradigm text, or it is reset to
 * "unknown". "Tabula rasa" alone sets nothing.
 */

import { z } from "zod";
import { runStructured } from "./run";
import { normalizeText } from "@/domain/verify";

const quoted = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    quote: z.string().describe("The exact words from the paradigm that state this, copied verbatim. Empty if the paradigm doesn't say."),
  });

const rating = z.number().int().min(0).max(5).describe("1 = strongly dislikes, 5 = strongly likes, 0 = the paradigm doesn't say");

export const JudgeProfileSchema = z.object({
  experience: quoted(z.enum(["lay", "parent", "former_debater", "coach", "college_judge", "unknown"])),
  speed: quoted(z.enum(["slow", "moderate", "fast_ok", "unknown"])).describe(
    "slow = asks for slow or conversational delivery overall (e.g. no spreading); moderate = accepts some speed but wants clarity or slowing on parts (tags, analytics) or says moderate; fast_ok = explicitly fine with speed/spreading",
  ),
  docSharing: quoted(z.enum(["wants_docs", "prefers_no_docs", "unknown"])),
  topicality: quoted(rating),
  counterplans: quoted(rating),
  disads: quoted(rating),
  kritiks: quoted(rating),
  condo: quoted(z.enum(["fine", "limited", "dislikes", "unknown"])),
  judgeKick: quoted(z.enum(["yes", "no", "if_asked", "unknown"])).describe(
    "yes = kicks the counterplan by default; if_asked = only when the 2NR asks for it (e.g. 'I won't judge kick unless told to'); no = refuses to judge kick even if asked",
  ),
  new2NC: quoted(z.enum(["fine", "disfavored", "unknown"])),
  techTruth: quoted(z.enum(["tech", "truth", "balanced", "unknown"])),
  theory: quoted(z.string().describe("the judge's stated view on theory arguments, in a few words; empty if unstated")),
  advice: z.array(z.string()).describe("2-5 concrete adaptations for this judge, each tied to something the paradigm says"),
});
export type JudgeProfile = z.infer<typeof JudgeProfileSchema>;

const SYSTEM = `You read high school policy debate judge paradigms and record the judge's preferences. Record a preference ONLY when the paradigm explicitly states it, and copy the exact words that state it into "quote". If the paradigm doesn't address something, set the value to "unknown" (or 0 for ratings) with an empty quote. "Tabula rasa", "I'll vote on anything", or "I'm open" alone set nothing. Do not guess from the judge's background or school. Advice must follow from quoted statements.`;

function occurs(quote: string, text: string): boolean {
  const q = normalizeText(quote, { caseFold: true });
  return q.length >= 3 && normalizeText(text, { caseFold: true }).includes(q);
}

/** Reset any field whose quote isn't found verbatim in the paradigm. Returns the fields that were reset. */
export function enforceQuotes(profile: JudgeProfile, paradigm: string): { profile: JudgeProfile; dropped: string[] } {
  const dropped: string[] = [];
  const out = { ...profile } as Record<string, unknown>;
  for (const [key, field] of Object.entries(profile)) {
    if (key === "advice" || !field || typeof field !== "object") continue;
    const f = field as { value: unknown; quote: string };
    const set = f.value !== "unknown" && f.value !== 0 && f.value !== "";
    if (!set) {
      out[key] = { ...f, quote: "" };
      continue;
    }
    if (!f.quote.trim() || !occurs(f.quote, paradigm)) {
      dropped.push(key);
      out[key] = { value: typeof f.value === "number" ? 0 : "unknown", quote: "" };
    }
  }
  return { profile: out as JudgeProfile, dropped };
}

export async function extractJudgeProfile(paradigm: string, teamId: string | null): Promise<{ profile: JudgeProfile; dropped: string[]; model: string; ms: number }> {
  const t0 = Date.now();
  const res = await runStructured({ task: "paradigm", system: SYSTEM, prompt: `PARADIGM:\n"""${paradigm.slice(0, 20_000)}"""`, schema: JudgeProfileSchema, teamId });
  const { profile, dropped } = enforceQuotes(res.output, paradigm);
  return { profile, dropped, model: res.model, ms: Date.now() - t0 };
}

const LABEL: Record<string, string> = {
  experience: "Experience",
  speed: "Speed",
  docSharing: "Speech docs",
  topicality: "Topicality",
  counterplans: "Counterplans",
  disads: "Disads",
  kritiks: "Kritiks",
  condo: "Conditionality",
  judgeKick: "Judge kick",
  new2NC: "New 2NC arguments",
  techTruth: "Tech vs truth",
  theory: "Theory",
};

/** Compact text for the AI context: only known preferences, each with its quote. */
export function renderJudgeProfile(p: JudgeProfile): string {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(LABEL)) {
    const f = (p as unknown as Record<string, { value: unknown; quote: string } | undefined>)[key];
    if (!f || f.value === "unknown" || f.value === 0 || f.value === "") continue;
    lines.push(`  - ${label}: ${typeof f.value === "number" ? `${f.value}/5` : String(f.value).replace(/_/g, " ")} ("${f.quote.slice(0, 160)}")`);
  }
  const kick = p.judgeKick?.value ?? "unknown";
  if (kick !== "yes") lines.push(`  - Judge kick is ${kick === "no" ? "rejected" : kick === "if_asked" ? "only on request" : "not stated"}: if the neg wants the status quo as an option, the 2NR must ask for it explicitly${kick === "no" ? " (and expect the judge to refuse)" : ""}.`);
  return lines.length ? lines.join("\n") : "  (the paradigm states no specific preferences)";
}

export function profileLabel(key: string): string {
  return LABEL[key] ?? key;
}
