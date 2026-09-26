/**
 * Speech checks (A2/A5): the "drop nothing" gates and the expert norms from
 * docs/research/speech-strategy.md and analytics-and-blocks.md, run on the
 * speech as it stands (every section, human-written or AI). Pure: the same
 * code runs in the browser (obligations panel) and on the server (validating
 * AI drafts and patches). Criticals mean something the next speech needs is
 * missing; warnings are expert norms worth a look.
 */

import { blockExclusions, computeCoverage, droppedByThem, isLive, type ArgUnit, type CoverageReport, type DraftTarget, type RoundGraph, type TheirDrop } from "./flow";
import { isBefore, isRebuttal, SPEECHES, speechesToAnswer, type NewArgumentPolicy, type SpeechId } from "./format";
import { matchPosition } from "./positions";
import type { Draft, DraftSection } from "@/shared/draft-model";
import { allSections } from "@/shared/draft-model";
import { analyticChecks } from "./analytic-checks";

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
  positionIds?: string[];
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

export function checkSpeech(input: { graph: RoundGraph; speech: SpeechId; sections: CheckSection[]; recorded: Set<SpeechId>; judgeLay?: boolean; newArgumentPolicy?: NewArgumentPolicy }): SpeechCheckReport {
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
      // An extension may also link the arguments of theirs it answers; the extension checks look at ours.
      const ours = t.filter((a) => a.side === side);
      if (t.length && !ours.length) checks.push({ code: "ext2_not_ours", severity: "info", message: `"${s.title}" is an extension, but isn't linked to which of our arguments it extends.`, sectionIds: [s.id] });
      for (const a of ours) {
        if (!isRebuttalSource(a.speech, speech)) checks.push({ code: "ext2_source", severity: "warning", message: `"${s.title}" extends our ${a.speech} argument; extensions come from our previous speech on this flow.`, sectionIds: [s.id] });
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
    // Defending the perm against their answers ("perm fails", "perm severs") isn't making one.
    const defendsPerm = targetsOf(s).some((a) => a.side !== side && /\bperm/i.test(a.text));
    const text = s.analytic.trim();
    if (isPerm && !defendsPerm && (words(text) < 12 || !/\b(net benefit|avoid|solve|shield|link|both|compet)/i.test(text))) checks.push({ code: "bare_perm", severity: "warning", message: `"${s.title}" is a bare perm: say what it does and why it avoids their net benefit.`, sectionIds: [s.id] });
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
  // Carry our own arguments forward (EXT): what isn't extended is gone for the rest of the round.
  const kicked = new Set(graph.decisions.filter((d) => d.kind === "kick" || d.kind === "concede").flatMap((d) => d.targets));
  const ourLive = (pid: string, speeches: SpeechId[]) => graph.args.some((a) => a.positionId === pid && a.side === side && speeches.includes(a.speech) && isLive(a));
  const touches = (pid: string) => sections.some((x) => targetsOf(x).some((a) => a.positionId === pid)) || sections.some((x) => !x.parentId && matchPosition(x.title, [posById.get(pid)!].filter(Boolean))?.id === pid);
  if (speech === "1NR") {
    // The block as a unit extends every 1NC position or kicks it; the 1NR is the last chance.
    for (const p of graph.positions.filter((q) => q.side === side && q.introducedIn === "1NC" && offCase(q.kind) && !kicked.has(q.id))) {
      if (!ourLive(p.id, ["1NC"]) || ourLive(p.id, ["2NC"]) || touches(p.id)) continue;
      checks.push({ code: "block_dropped_position", severity: "critical", message: `Neither the 2NC nor this 1NR extends the 1NC's ${p.name}: extend it (so the 2NR can go for it) or kick it on purpose.`, positionIds: [p.id] });
    }
  }
  if (speech === "1AR") {
    const advantages = graph.positions.filter((q) => q.side === side && q.kind === "advantage" && !kicked.has(q.id) && ourLive(q.id, ["1AC", "2AC"]));
    const extended = advantages.filter((q) => touches(q.id));
    if (advantages.length && !extended.length) checks.push({ code: "no_advantage_extended", severity: "critical", message: `No advantage is extended: the 2AR can only win on an impact the 1AR carried forward.` });
    for (const q of advantages.filter((x) => !extended.includes(x))) checks.push({ code: "advantage_dropped", severity: "warning", message: `The ${q.name} advantage isn't extended; after the 1AR it's gone. Extend its impact or drop it on purpose.`, positionIds: [q.id] });
  }
  if (speech === "2NR" || speech === "2AR") {
    // A position the speech goes for needs its terminal impact extended, not just a link or an internal link.
    const goingFor = graph.positions.filter((q) => q.side === side && !kicked.has(q.id) && sections.some((x) => targetsOf(x).some((a) => a.positionId === q.id && a.side === side)));
    for (const q of goingFor) {
      const impacts = graph.args.filter((a) => a.positionId === q.id && a.side === side && a.role === "impact" && isBefore(a.speech, speech) && isLive(a));
      if (!impacts.length) continue;
      const extendsImpact = sections.some((x) => targetsOf(x).some((a) => impacts.some((i) => i.id === a.id)) || (x.role === "impact" && targetsOf(x).some((a) => a.positionId === q.id)));
      if (!extendsImpact) checks.push({ code: "no_terminal_impact", severity: "critical", message: `Going for ${q.name} without extending its terminal impact (${[...new Set(impacts.flatMap((i) => i.cites ?? []))].slice(0, 2).join(", ") || impacts[0].text.slice(0, 60)}): extend it and weigh it.`, positionIds: [q.id] });
    }
  }
  // One story per position: a block or rebuttal that reads an impact on our position extends the impact already
  // read (same scenario, same authors), rather than swapping in a new one.
  if (speech !== "1AC" && speech !== "1NC" && speech !== "2AC") {
    const earlierImpacts = new Map<string, ArgUnit[]>();
    for (const a of graph.args) if (a.side === side && a.role === "impact" && isBefore(a.speech, speech)) earlierImpacts.set(a.positionId, [...(earlierImpacts.get(a.positionId) ?? []), a]);
    const byId = new Map(sections.map((x) => [x.id, x]));
    const positionOfSection = (x: CheckSection): string | null => {
      const own = targetsOf(x).find((a) => posById.get(a.positionId)?.side === side)?.positionId;
      if (own) return own;
      const parent = x.parentId ? byId.get(x.parentId) : null;
      return parent ? positionOfSection(parent) ?? (matchPosition(parent.title, graph.positions.filter((p) => p.side === side))?.id ?? null) : null;
    };
    for (const x of sections.filter((y) => y.role === "impact")) {
      const pid = positionOfSection(x);
      const before = pid ? earlierImpacts.get(pid) : undefined;
      if (!pid || !before?.length || targetsOf(x).some((a) => before.some((b) => b.id === a.id))) continue;
      const cites = [...new Set(before.flatMap((b) => b.cites ?? []))].slice(0, 3).join(", ");
      checks.push({ code: "story_shift", severity: speech === "2NR" || speech === "2AR" ? "critical" : "warning", message: `"${x.title || "An impact"}" on ${nameOf(pid)} isn't the impact already read${cites ? ` (${cites})` : ""}: extend that story, or label this as an additional impact${speech === "2NR" || speech === "2AR" ? " (too late for a new one now)" : ""}.`, sectionIds: [x.id] });
    }
  }
  // The format's new-argument rule: no new arguments in rebuttals (new evidence extending an old one is fine,
  // except under "strict" in the final rebuttals). "permissive" leagues allow them.
  const policy = input.newArgumentPolicy ?? "conventional";
  if (isRebuttal(speech) && policy !== "permissive") {
    for (const s of sections.filter((x) => x.relation === "new" && x.kind !== "overview" && x.kind !== "position")) checks.push({ code: "new_in_rebuttal", severity: "warning", message: `"${s.title || "A section"}" is a new argument in a rebuttal; this format doesn't allow them (answering their new arguments is fine).`, sectionIds: [s.id] });
    if (policy === "strict" && (speech === "2NR" || speech === "2AR")) {
      const earlier = new Set(graph.args.filter((a) => a.side === side && isBefore(a.speech, speech)).flatMap((a) => a.cites ?? []).map((c) => c.toLowerCase()));
      for (const s of sections) for (const c of s.cardCites) if (c && !earlier.has(c.toLowerCase())) checks.push({ code: "new_evidence_final", severity: "warning", message: `"${s.title || "A section"}" reads ${c}, which wasn't read earlier; this format bars new evidence in the final rebuttals.`, sectionIds: [s.id] });
    }
  }
  // Expert norms for each analytic and block (docs/research/analytics-and-blocks.md §7).
  checks.push(...analyticChecks({ graph, speech, sections, judgeLay: input.judgeLay }));
  const order: SpeechCheck["severity"][] = ["critical", "warning", "info"];
  checks.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { coverage, checks, theirDrops };
}

/** EXT-2: rebuttal extensions come from the same side's previous speech on that flow. */
function isRebuttalSource(from: SpeechId, speech: SpeechId): boolean {
  const prior: Record<string, SpeechId[]> = { "1AR": ["2AC", "1AC"], "2AR": ["1AR"], "2NR": ["2NC", "1NR"], "1NR": ["1NC"], "2NC": ["1NC"], "2AC": ["1AC"] };
  return (prior[speech] ?? [from]).includes(from);
}
