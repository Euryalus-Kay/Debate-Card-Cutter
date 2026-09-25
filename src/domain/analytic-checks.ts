/**
 * Expert norms for analytics and blocks (A5; docs/research/analytics-and-blocks.md
 * §7, speech-strategy.md). Warnings and notes, never hard gates: almost nothing
 * about speech construction is a formal rule, and judges differ. Run on every
 * section of the speech as it stands, human-written or AI.
 */

import type { ArgUnit, Position, RoundGraph } from "./flow";
import type { SpeechId } from "./format";
import { citesIn } from "./span-check";
import { guessKind } from "./positions";
import type { CheckSection, SpeechCheck } from "./speech-checks";

const STOP = new Set("the a an and or but so of to in on for with that this is are was be it its their they them our we you not no as at by from if then than because since which who what when will would can could should do does did have has had there here into about more most less just only also very".split(" "));
const FILLER = /\b(i'?d like to|basically|it is important to note|at the end of the day|needless to say|as you can see|obviously|clearly,)\b/i;
const JARGON = /\b(perm(utation)?|non-?unique|uq|link turn|impact turn|condo|conditionality|fiat|pics?|severance|intrinsic|kritik|alt\b|framework|t is a voter|reasonability|competing interps?|dispo)\b/i;
const DIMENSIONS: [string, RegExp][] = [
  ["magnitude", /\b(magnitude|extinction|scope|how (big|many)|bigger)\b/i],
  ["probability", /\b(probab|likel|risk|chance)\w*/i],
  ["timeframe", /\b(time ?frame|faster|sooner|first|immediate|years? before)\b/i],
  ["reversibility", /\b(reversib|irreversib|permanent)\w*/i],
  ["turns the case", /\bturns? (the )?case\b/i],
];

const words = (s: string) => s.split(/\s+/).filter(Boolean);
// Content words, with plurals folded ("states" = "state") so "the state" engages "the states".
const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const content = (s: string) => new Set(words(s.toLowerCase().replace(/[^\w\s'’-]/g, " ")).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const CONSTRUCTIVE: SpeechId[] = ["1NC", "2AC", "2NC", "1NR"];

export function analyticChecks(input: { graph: RoundGraph; speech: SpeechId; sections: CheckSection[]; judgeLay?: boolean }): SpeechCheck[] {
  const { graph, speech, sections } = input;
  const out: SpeechCheck[] = [];
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const posById = new Map(graph.positions.map((p) => [p.id, p]));
  const targetsOf = (s: CheckSection) => s.targets.map((t) => argById.get(argById.get(t)?.sameAs ?? t)).filter((a): a is ArgUnit => !!a);
  const answers = sections.filter((s) => s.kind !== "position" && s.kind !== "overview" && s.relation !== "extend");
  const label = (s: CheckSection) => `"${s.title || "A section"}"`;

  // 1–4. One analytic: long enough to have a warrant, short enough to flow, aimed at their words, one claim.
  const maxWords = speech === "1AR" ? 140 : CONSTRUCTIVE.includes(speech) ? 45 : Infinity;
  for (const s of answers) {
    const text = s.analytic.trim();
    if (!text || s.cardCites.length) continue;
    const n = words(text).length;
    if (n < 8 && s.role !== "perm") out.push({ code: "analytic_thin", severity: "warning", message: `${label(s)} is ${n} word${n === 1 ? "" : "s"}: an answer needs its reason to be flowed.`, sectionIds: [s.id] });
    if (n > maxWords) out.push({ code: "analytic_long", severity: "info", message: `${label(s)} runs ${n} words; one answer is usually ${speech === "1AR" ? "about 125" : "8–45"} words. Split it or trim.`, sectionIds: [s.id] });
    const theirs = targetsOf(s).filter((a) => a.side !== graph.ourSide);
    if (theirs.length) {
      const own = content(`${s.title} ${text}`);
      const shared = theirs.some((a) => {
        const t = content(`${a.text} ${(a.cites ?? []).join(" ")} ${a.provenance.type === "heard" ? a.provenance.quote : ""}`);
        return [...t].some((w) => own.has(w));
      });
      if (!shared) out.push({ code: "analytic_no_engagement", severity: "info", message: `${label(s)} doesn't use any of their argument's words: aim it at their warrant.`, sectionIds: [s.id] });
    }
    const sentences = text.split(/[.!?]+\s/).filter((x) => words(x).length > 2).length;
    if (sentences >= 3 && CONSTRUCTIVE.includes(speech)) out.push({ code: "analytic_many_claims", severity: "info", message: `${label(s)} makes ${sentences} points in one answer; number them separately.`, sectionIds: [s.id] });
    if ((s.role === "link_turn" || s.role === "impact_turn") && /\b(no link|non-?unique|no impact)\b/i.test(text)) out.push({ code: "turn_with_defense", severity: "warning", message: `${label(s)} mixes a turn with a defensive answer in one point; give each its own number.`, sectionIds: [s.id] });
  }

  // 5, 7, 10, 22. Blocks: numbering, answer counts, perms first, order.
  const byParent = new Map<string, CheckSection[]>();
  for (const s of sections) if (s.parentId) byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), s]);
  const positionOf = (s: CheckSection): Position | undefined => {
    const kids = byParent.get(s.id) ?? [];
    const ids = [...targetsOf(s), ...kids.flatMap(targetsOf)].map((a) => a.positionId);
    return ids.length ? posById.get(ids[0]) : undefined;
  };
  for (const parent of sections.filter((s) => (byParent.get(s.id)?.length ?? 0) > 0)) {
    const kids = byParent.get(parent.id)!;
    const nums = kids.map((k) => /^\s*(\d+)[.)-]/.exec(k.title)?.[1]).filter((x): x is string => !!x).map(Number);
    if (nums.length >= 2) {
      const dup = nums.find((x, i) => nums.indexOf(x) !== i);
      const gap = nums.some((x, i) => i > 0 && x !== nums[i - 1] + 1);
      if (dup !== undefined || gap) out.push({ code: "numbering", severity: "info", message: `Answers under ${label(parent)} are numbered ${nums.join(", ")}; renumber them in order so the judge can flow them.`, sectionIds: [parent.id] });
    }
    const pos = positionOf(parent);
    if (!pos) continue;
    const offCase = !["advantage", "harms", "inherency", "solvency", "plan", "case_other"].includes(pos.kind);
    if (speech === "2AC" && offCase && pos.side !== graph.ourSide) {
      if (kids.length < 3) out.push({ code: "few_answers", severity: "info", message: `Only ${kids.length} answer${kids.length === 1 ? "" : "s"} to the ${pos.name}; a 2AC usually gives 3–8 so the 1AR has options.`, sectionIds: [parent.id] });
      if (kids.length > 8) out.push({ code: "many_answers", severity: "info", message: `${kids.length} answers to the ${pos.name}; past 8, the best ones get less time.`, sectionIds: [parent.id] });
      const permAt = kids.findIndex((k) => k.role === "perm" || /\bperm/i.test(k.title));
      if (pos.kind === "cp" && permAt > 0) out.push({ code: "perm_first", severity: "info", message: `On the ${pos.name}, put the perm first.`, sectionIds: [kids[permAt].id] });
      if (pos.kind === "k") {
        const have = (re: RegExp, roles: string[]) => kids.some((k) => roles.includes(k.role ?? "") || re.test(`${k.title} ${k.analytic}`));
        const missing = [
          ["framework", have(/framework|weigh the aff/i, ["framework"])],
          ["a perm", have(/\bperm/i, ["perm"])],
          ["a link answer", have(/no link|link turn|doesn'?t link/i, ["no_link", "link_turn"])],
          ["alt fails", have(/alt(ernative)? (fails|can'?t|doesn'?t)/i, ["alternative"])],
        ]
          .filter(([, ok]) => !ok)
          .map(([n]) => n);
        if (missing.length) out.push({ code: "k_frontline", severity: "warning", message: `The answers to the ${pos.name} have no ${missing.join(", ")}.`, sectionIds: [parent.id] });
      }
      if (pos.kind === "t") {
        const ci = kids.some((k) => k.role === "counter_interpretation" || /counter[- ]?interp/i.test(`${k.title} ${k.analytic}`));
        if (!ci) out.push({ code: "t_no_counter_interp", severity: "warning", message: `Against ${pos.name}, read a counter-interpretation (with reasons it's better), not just "we meet".`, sectionIds: [parent.id] });
      }
    }
    if (speech === "1AR" && kids.length > 4) out.push({ code: "1ar_too_many", severity: "info", message: `${kids.length} answers on the ${pos.name}; the 1AR usually extends 2–4 per position.`, sectionIds: [parent.id] });
  }

  // 1NC shells are complete for their type.
  if (speech === "1NC") {
    const need: Record<string, string[][]> = {
      da: [["uniqueness", "non_unique"], ["link"], ["impact"]],
      cp: [["cp_text"], ["net_benefit", "solvency"]],
      t: [["interpretation"], ["violation"], ["standard"], ["voter"]],
      theory: [["interpretation"], ["standard"], ["voter"]],
      k: [["link"], ["impact"], ["alternative"]],
    };
    for (const parent of sections.filter((s) => s.kind === "position")) {
      // A 1NC introduces its positions, so its shells often target nothing: tell the type from the heading.
      const kind = positionOf(parent)?.kind ?? guessKind(parent.title);
      if (!need[kind]) continue;
      const kids = byParent.get(parent.id) ?? [];
      const roles = new Set(kids.map((k) => k.role ?? ""));
      const missing = need[kind].filter((opts) => !opts.some((r) => roles.has(r))).map((opts) => opts[0].replace("_", " "));
      if (missing.length && kids.length) out.push({ code: "shell_incomplete", severity: "warning", message: `${label(parent)} has no ${missing.join(", ")}: a ${kind.toUpperCase()} shell needs ${need[kind].map((o) => o[0].replace("_", " ")).join(", ")}.`, sectionIds: [parent.id] });
    }
  }

  // 22. Threshold issues (T, theory) first in the 2AC; never last in the 1AR.
  if (speech === "2AC" || speech === "1AR") {
    const top = sections.filter((s) => !s.parentId && s.kind !== "overview");
    const kinds = top.map((s) => positionOf(s)?.kind ?? "");
    const firstOther = kinds.findIndex((k) => k && k !== "t" && k !== "theory");
    const lateT = kinds.findIndex((k, i) => (k === "t" || k === "theory") && firstOther >= 0 && i > firstOther);
    if (lateT >= 0) out.push({ code: speech === "1AR" ? "threshold_last" : "t_first", severity: speech === "1AR" ? "warning" : "info", message: `${label(top[lateT])} comes after other positions; answer topicality and theory first.`, sectionIds: [top[lateT].id] });
  }

  // 15–16. Rebuttals weigh on two or more dimensions; overviews stay short.
  if (speech === "2NR" || speech === "2AR") {
    const all = sections.map((s) => `${s.title} ${s.analytic}`).join(" ");
    const dims = DIMENSIONS.filter(([, re]) => re.test(all)).map(([n]) => n);
    if (dims.length === 1) out.push({ code: "impact_calc_one_dimension", severity: "warning", message: `The impact comparison uses only ${dims[0]}; compare on at least two (magnitude, probability, timeframe, reversibility, turns the case).` });
  } else {
    for (const s of sections.filter((x) => x.kind === "overview" || x.role === "overview")) if (words(s.analytic).length > 90) out.push({ code: "long_overview", severity: "warning", message: `${label(s)} runs over 20 seconds; keep overviews short and put the rest on the line by line.`, sectionIds: [s.id] });
  }

  // 18–20. Filler, jargon for a lay judge, and author-year cites with no card behind them.
  const knownCites = new Set([...sections.flatMap((s) => s.cardCites), ...graph.args.flatMap((a) => a.cites ?? [])].flatMap((c) => citesIn(c)));
  for (const s of sections) {
    const text = `${s.title} ${s.analytic}`;
    if (FILLER.test(s.analytic)) out.push({ code: "filler", severity: "info", message: `${label(s)} has filler ("${FILLER.exec(s.analytic)![0]}"); cut it for time.`, sectionIds: [s.id] });
    if (input.judgeLay && JARGON.test(text)) out.push({ code: "lay_jargon", severity: "warning", message: `${label(s)} uses debate jargon ("${JARGON.exec(text)![0]}") with a lay judge; say it in plain words.`, sectionIds: [s.id] });
    const unknown = citesIn(s.analytic).filter((c) => !knownCites.has(c));
    if (unknown.length) out.push({ code: "cite_without_card", severity: "warning", message: `${label(s)} names ${unknown.map((c) => c.replace(/\b\w/, (x) => x.toUpperCase())).join(", ")}, but no card in the speech or on the flow is by them. Read the card or drop the name.`, sectionIds: [s.id] });
  }

  // Variety: two answers that say the same thing (generated text tends to repeat itself).
  const bodies = answers.filter((s) => words(s.analytic).length >= 10).map((s) => ({ s, w: content(s.analytic) }));
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++)
      if (jaccard(bodies[i].w, bodies[j].w) >= 0.6) out.push({ code: "repeats", severity: "warning", message: `${label(bodies[j].s)} repeats ${label(bodies[i].s)}; cut one or make them different answers.`, sectionIds: [bodies[i].s.id, bodies[j].s.id] });
  return out;
}

/**
 * How much prep to spend before this speech (Snider's caps, speech-strategy.md):
 * shares of the team's total prep, cumulative by speech. The 1NR uses the
 * block's time instead; final rebuttals use what's left.
 */
export function prepGuide(speech: SpeechId, totalSec: number, usedSec: number): { maxNowSec: number; note: string } | null {
  const cap: Partial<Record<SpeechId, number>> = { "1NC": 0.1, "2AC": 0.25, "2NC": 0.4, "1AR": 0.5 };
  const left = Math.max(0, totalSec - usedSec);
  if (speech === "1NR") return { maxNowSec: 0, note: "The 1NR prepares during the 2AC's cross-ex, the 2NC, and its cross-ex: no prep needed." };
  if (speech === "2NR" || speech === "2AR") return { maxNowSec: left, note: "Final rebuttal: use what's left." };
  const share = cap[speech];
  if (share === undefined) return null;
  const maxNowSec = Math.max(0, Math.round(totalSec * share - usedSec));
  return { maxNowSec, note: `Keep the ${speech} to about ${Math.round(share * 100)}% of your prep so far, to save time for the rebuttals.` };
}
