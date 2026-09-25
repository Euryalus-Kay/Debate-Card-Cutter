/**
 * Speech checks (A2/A5): the "drop nothing" gates and the expert norms from
 * docs/research/speech-strategy.md and analytics-and-blocks.md, run on the
 * speech as it stands (every section, human-written or AI). Pure: the same
 * code runs in the browser (obligations panel) and on the server (validating
 * AI drafts and patches). Criticals mean something the next speech needs is
 * missing; warnings are expert norms worth a look.
 */

import { blockExclusions, computeCoverage, droppedByThem, isLive, type ArgUnit, type CoverageReport, type DraftTarget, type RoundGraph, type TheirDrop } from "./flow";
import { isRebuttal, SPEECHES, speechesToAnswer, type SpeechId } from "./format";
import type { Draft, DraftSection } from "@/shared/draft-model";
import { allSections } from "@/shared/draft-model";

export interface CheckSection {
  id: string;
  title: string;
  relation: DraftTarget["relation"] | "none";
  targets: string[];
  role: string | null;
  crossApplyFrom: string | null;
  /** the section's own words (paragraphs), without cards */
  analytic: string;
  cardCites: string[];
  parentId: string | null;
  kind: string;
}

export interface SpeechCheck {
  code: string;
  severity: "critical" | "warning" | "info";
  message: string;
  sectionIds?: string[];
  argIds?: string[];
}

export interface SpeechCheckReport {
  coverage: CoverageReport;
  checks: SpeechCheck[];
  theirDrops: TheirDrop[];
}

const WARRANT = /\b(because|since|b\/c|so|therefore|means|that'?s why|which means|as a result|→|->|thus|proves|shows|given that)\b/i;
const IMPACT_CALC = /\b(outweigh|magnitude|probability|timeframe|time ?frame|reversib|turns (the )?case|root cause|scope|risk)\b/i;
const EVEN_IF = /\beven if\b/i;
const BALLOT = /\b(vote (neg|aff|negative|affirmative)|the ballot|reasons? to vote|you (should )?vote|judge (should|must)|decision rule)\b/i;

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Sections of a draft in the shape the checks use. */
export function checkSections(draft: Draft | null): CheckSection[] {
  if (!draft) return [];
  const parentOf = new Map<string, string>();
  const walk = (s: DraftSection) => {
    for (const it of s.items) if (it.type === "section") {
      parentOf.set(it.section.id, s.id);
      walk(it.section);
    }
  };
  for (const it of draft.items) if (it.type === "section") walk(it.section);
  return allSections(draft).map((s) => ({
    id: s.id,
    title: s.title,
    relation: s.relation,
    targets: s.targets,
    role: s.role,
    crossApplyFrom: s.crossApplyFrom,
    analytic: s.items
      .filter((i) => i.type === "paragraph")
      .map((i) => (i as { text: string }).text)
      .join(" "),
    cardCites: s.items.filter((i) => i.type === "card").map((i) => (i as { shortCite: string }).shortCite),
    parentId: parentOf.get(s.id) ?? null,
    kind: s.kind,
  }));
}

export function draftTargetsOf(sections: CheckSection[]): DraftTarget[] {
  return sections
    .filter((s) => s.relation !== "none" || s.targets.length > 0)
    .map((s) => ({ sectionId: s.id, title: s.title, relation: (s.relation === "none" ? "answers" : s.relation) as DraftTarget["relation"], targets: s.targets, turn: s.role === "link_turn" || s.role === "impact_turn" }));
}

export function checkSpeech(input: { graph: RoundGraph; speech: SpeechId; sections: CheckSection[]; recorded: Set<SpeechId> }): SpeechCheckReport {
  const { graph, speech, sections, recorded } = input;
  const checks: SpeechCheck[] = [];
  const side = SPEECHES[speech].side;
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const posById = new Map(graph.positions.map((p) => [p.id, p]));
  const canonical = (id: string) => argById.get(id)?.sameAs ?? id;
  const coverage = computeCoverage(graph, speech, draftTargetsOf(sections), recorded);
  const theirDrops = droppedByThem(graph, speech, recorded);
  const targetsOf = (s: CheckSection) => s.targets.map(canonical).map((t) => argById.get(t)).filter((a): a is ArgUnit => !!a);
  const answeredPositions = new Set(sections.flatMap((s) => targetsOf(s).map((a) => a.positionId)));
  const concededPositions = new Set(graph.decisions.filter((d) => d.speech === speech && (d.kind === "concede" || d.kind === "kick")).flatMap((d) => d.targets));
  const nameOf = (id: string) => posById.get(id)?.name ?? "a position";
  const offCase = (kind: string) => !["advantage", "harms", "inherency", "solvency", "plan", "case_other"].includes(kind);

  // --- COV-6 hard gates -------------------------------------------------------
  if (speech === "2AC") {
    const oneNC = graph.positions.filter((p) => p.side !== side && p.introducedIn === "1NC" && offCase(p.kind) && graph.args.some((a) => a.positionId === p.id && isLive(a)));
    for (const p of oneNC) if (!answeredPositions.has(p.id) && !concededPositions.has(p.id)) checks.push({ code: "cov6_2ac_unanswered_position", severity: "critical", message: `No answer to the 1NC's ${p.name}. The 2AC must answer every off-case position.` });
  }
  if (speech === "1AR") {
    const blockPositions = new Set(graph.args.filter((a) => a.side !== side && (a.speech === "2NC" || a.speech === "1NR") && isLive(a)).map((a) => a.positionId));
    for (const pid of blockPositions) if (!answeredPositions.has(pid) && !concededPositions.has(pid)) checks.push({ code: "cov6_1ar_unanswered_position", severity: "critical", message: `Nothing answers the block's ${nameOf(pid)}. The 1AR must respond on every position the block extended.` });
  }
  if (speech === "2NR" || speech === "2AR" || isRebuttal(speech)) {
    const chosen = new Set(sections.flatMap((s) => targetsOf(s).map((a) => a.positionId)));
    const answerSpeeches = speechesToAnswer(speech);
    const unanswered = coverage.items.filter((i) => i.status === "unanswered" && chosen.has(i.arg.positionId) && answerSpeeches.includes(i.arg.speech));
    for (const i of unanswered.slice(0, 12)) checks.push({ code: "unanswered_on_chosen_flow", severity: "critical", message: `Unanswered on ${i.position?.name ?? "this flow"}: "${i.arg.text.slice(0, 90)}"`, argIds: [i.arg.id] });
  }
  const excluded = blockExclusions(graph, speech);
  const others = coverage.items.filter((i) => i.status === "unanswered" && !excluded.has(i.arg.positionId));
  if (others.length && !checks.some((c) => c.code === "unanswered_on_chosen_flow")) checks.push({ code: "unanswered_items", severity: "warning", message: `${others.length} of their arguments ${others.length === 1 ? "has" : "have"} no answer yet (see the list above).`, argIds: others.map((i) => i.arg.id) });

  // --- Grouping, cross-applications, extensions (COV-2, COV-3, EXT-2/3/4) -------
  for (const s of sections) {
    const t = targetsOf(s);
    if (s.relation === "group" || t.length > 1) {
      const positions = new Set(t.map((a) => a.positionId));
      if (positions.size > 1) checks.push({ code: "cov2_group_across_positions", severity: "warning", message: `"${s.title || "A section"}" groups arguments from different positions; answer them where they are.`, sectionIds: [s.id] });
      if (t.some((a) => a.role === "link_turn" || a.role === "impact_turn")) checks.push({ code: "cov2_group_turn", severity: "warning", message: `"${s.title || "A section"}" groups a turn with other arguments; turns need their own answer.`, sectionIds: [s.id] });
      if (t.some((a) => posById.get(a.positionId)?.kind === "t" || posById.get(a.positionId)?.kind === "theory")) checks.push({ code: "cov2_group_t", severity: "warning", message: `"${s.title || "A section"}" groups topicality or theory arguments; T needs line-by-line.`, sectionIds: [s.id] });
    }
    if (s.relation === "cross_apply" && !s.crossApplyFrom) checks.push({ code: "cov3_cross_apply_source", severity: "warning", message: `"${s.title || "A section"}" cross-applies without saying which of our arguments it uses.`, sectionIds: [s.id] });
    if (s.relation === "extend") {
      for (const a of t) {
        if (a.side !== side) checks.push({ code: "ext2_not_ours", severity: "warning", message: `"${s.title}" extends an argument that isn't ours.`, sectionIds: [s.id] });
        else if (!isRebuttalSource(a.speech, speech)) checks.push({ code: "ext2_source", severity: "warning", message: `"${s.title}" extends our ${a.speech} argument; extensions come from our previous speech on this flow.`, sectionIds: [s.id] });
        if (a.role === "link_turn") {
          const nu = sections.some((o) => o.relation === "extend" && targetsOf(o).some((b) => b.positionId === a.positionId && b.role === "non_unique"));
          if (!nu) checks.push({ code: "ext3_link_turn_nonunique", severity: "warning", message: `Extending the link turn on ${nameOf(a.positionId)} without non-uniqueness: it may not be offense.`, sectionIds: [s.id] });
        }
        const cite = a.cites?.[0];
        if (cite) {
          const author = cite.split(/\s/)[0].toLowerCase();
          if (author && !`${s.title} ${s.analytic}`.toLowerCase().includes(author)) checks.push({ code: "ext4_cite", severity: "info", message: `"${s.title}" extends ${cite}; name the author and the warrant.`, sectionIds: [s.id] });
        }
        if (words(s.analytic) < 12) checks.push({ code: "ext1_thin", severity: "warning", message: `"${s.title}" extends by tag only; give the warrant and why it matters now.`, sectionIds: [s.id] });
      }
    }
  }

  // --- Contradictions and argument quality (research norms) -------------------
  const byPosition = new Map<string, CheckSection[]>();
  for (const s of sections) for (const a of targetsOf(s)) byPosition.set(a.positionId, [...(byPosition.get(a.positionId) ?? []), s]);
  for (const [pid, list] of byPosition) {
    const roles = new Set(list.map((s) => s.role));
    if (roles.has("link_turn") && roles.has("impact_turn")) checks.push({ code: "double_turn", severity: "critical", message: `Double turn on ${nameOf(pid)}: a link turn and an impact turn together concede their impact is good. Pick one.`, sectionIds: list.filter((s) => s.role === "link_turn" || s.role === "impact_turn").map((s) => s.id) });
    if (roles.has("link_turn") && !roles.has("non_unique") && !graph.args.some((a) => a.side === side && a.positionId === pid && a.role === "non_unique" && isLive(a))) checks.push({ code: "link_turn_needs_nonunique", severity: "warning", message: `The link turn on ${nameOf(pid)} needs a non-uniqueness argument to be offense.`, sectionIds: list.filter((s) => s.role === "link_turn").map((s) => s.id) });
  }
  for (const s of sections) {
    if (s.kind === "position" || s.kind === "overview") continue;
    const isPerm = s.role === "perm" || /\bperm(utation)?\b/i.test(s.title);
    const text = s.analytic.trim();
    if (isPerm && (words(text) < 12 || !/\b(net benefit|avoid|solve|shield|link|both|compet)/i.test(text))) checks.push({ code: "bare_perm", severity: "warning", message: `"${s.title}" is a bare perm: say what it does and why it avoids their net benefit.`, sectionIds: [s.id] });
    else if (text && !s.cardCites.length && (words(text) < 10 || !WARRANT.test(text)) && s.relation !== "extend") checks.push({ code: "analytic_no_warrant", severity: "info", message: `"${s.title || "An analytic"}" needs a reason ("because …") and what it means for the round.`, sectionIds: [s.id] });
  }

  // --- Final rebuttals ------------------------------------------------------------
  if (speech === "2NR" || speech === "2AR") {
    const all = sections.map((s) => `${s.title} ${s.analytic}`).join(" ");
    if (!IMPACT_CALC.test(all)) checks.push({ code: "no_impact_calc", severity: "warning", message: `No impact comparison (magnitude, probability, timeframe, turns the case).` });
    if (!EVEN_IF.test(all)) checks.push({ code: "no_even_if", severity: "warning", message: `No "even if" framing: say why you still win if you lose your weakest piece.` });
    if (!BALLOT.test(all)) checks.push({ code: "no_ballot_sentence", severity: "warning", message: `No sentence telling the judge how to vote.` });
  }
  if (speech === "2NR") {
    const offense = new Set(sections.flatMap((s) => targetsOf(s)).filter((a) => posById.get(a.positionId)?.side === side || a.side !== side).map((a) => a.positionId));
    const ourPositions = [...offense].filter((pid) => posById.get(pid)?.side === side && offCase(posById.get(pid)?.kind ?? ""));
    if (ourPositions.length > 2) checks.push({ code: "2nr_too_many", severity: "warning", message: `The 2NR goes for ${ourPositions.length} positions; collapse to one (two at most).` });
  }
  if (speech === "2AR") {
    for (const s of sections.filter((x) => x.relation === "extend")) for (const a of targetsOf(s)) if (a.side === side && a.speech !== "1AR") checks.push({ code: "2ar_no_1ar_ancestor", severity: "warning", message: `"${s.title}" extends our ${a.speech} argument; the 2AR can only go for what the 1AR extended.`, sectionIds: [s.id] });
  }
  const order: SpeechCheck["severity"][] = ["critical", "warning", "info"];
  checks.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { coverage, checks, theirDrops };
}

/** EXT-2: rebuttal extensions come from the same side's previous speech on that flow. */
function isRebuttalSource(from: SpeechId, speech: SpeechId): boolean {
  const prior: Record<string, SpeechId[]> = { "1AR": ["2AC", "1AC"], "2AR": ["1AR"], "2NR": ["2NC", "1NR"], "1NR": ["1NC"], "2NC": ["1NC"], "2AC": ["1AC"] };
  return (prior[speech] ?? [from]).includes(from);
}
