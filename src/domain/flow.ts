/**
 * Round state: positions, argument units, relations, decisions, and the
 * coverage computation that tells a speaker what still needs an answer.
 *
 * Provenance is explicit on every unit and relation so the UI can always
 * distinguish document text, user-confirmed delivery, AI interpretation,
 * and planned (draft) content.
 */

import { opposite, SPEECHES, speechesToAnswer, speechesToExtend, isBefore, type Side, type SpeechId } from "./format";

export type PositionKind =
  | "advantage"
  | "harms"
  | "inherency"
  | "solvency"
  | "plan"
  | "case_other"
  | "da"
  | "cp"
  | "k"
  | "t"
  | "theory"
  | "framework"
  | "other";

export const POSITION_KIND_LABEL: Record<PositionKind, string> = {
  advantage: "Advantage",
  harms: "Harms",
  inherency: "Inherency",
  solvency: "Solvency",
  plan: "Plan",
  case_other: "Case",
  da: "Disadvantage",
  cp: "Counterplan",
  k: "Kritik",
  t: "Topicality",
  theory: "Theory",
  framework: "Framework",
  other: "Other",
};

export function isCasePosition(kind: PositionKind): boolean {
  return kind === "advantage" || kind === "harms" || kind === "inherency" || kind === "solvency" || kind === "plan" || kind === "case_other";
}

export interface Position {
  id: string;
  kind: PositionKind;
  name: string;
  /** side that introduced the position */
  side: Side;
  introducedIn: SpeechId;
  order: number;
}

export type ArgRole =
  | "claim"
  | "uniqueness"
  | "link"
  | "internal_link"
  | "impact"
  | "solvency"
  | "plan_text"
  | "cp_text"
  | "net_benefit"
  | "perm"
  | "interpretation"
  | "violation"
  | "standard"
  | "voter"
  | "alternative"
  | "framework"
  | "theory"
  | "defense"
  | "link_turn"
  | "impact_turn"
  | "impact_calc"
  | "overview"
  | "other";

export type Provenance =
  /** text found in a supplied document */
  | { type: "document"; documentId: string; blockId?: string; excerpt?: string }
  /** entered by a user from what they heard or know */
  | { type: "user_note"; by: string }
  /** an AI interpretation; must be reviewable */
  | { type: "ai_inferred"; opId?: string; confidence: number }
  /** planned content from one of our drafts */
  | { type: "draft"; draftId: string; sectionId: string };

/**
 * Whether the argument was actually delivered. A document alone never proves
 * delivery; "documented" means "in the doc, not confirmed".
 */
export type DeliveryStatus = "documented" | "confirmed" | "not_read" | "uncertain" | "planned";

export interface ArgUnit {
  id: string;
  positionId: string;
  speech: SpeechId;
  side: Side;
  parentId?: string;
  order: number;
  /** "1", "2", "A", "Uniqueness" */
  label?: string;
  /** short flow text of the claim */
  text: string;
  /** reasoning summary (interpretation unless provenance says otherwise) */
  warrant?: string;
  role: ArgRole;
  /** true when the argument is offense (a reason to vote), not only defense */
  offensive?: boolean;
  /** card ids used as evidence */
  cardIds: string[];
  /** display snapshot of evidence cites, e.g. ["Smith 23"] */
  cites?: string[];
  provenance: Provenance;
  delivery: DeliveryStatus;
  /** when the user corrected this unit, AI refreshes must not overwrite it */
  humanEdited?: boolean;
}

export type RelationType = "answers" | "extends" | "cross_applies" | "turns";

export interface Relation {
  id: string;
  type: RelationType;
  /** the responding / extending argument */
  from: string;
  /** the argument(s) it relates to; >1 for grouped answers */
  to: string[];
  /** true when the speaker explicitly grouped these targets */
  grouped?: boolean;
  provenance: Provenance;
  status: "confirmed" | "suggested" | "rejected";
}

export type DecisionKind = "concede" | "deprioritize" | "kick" | "go_for" | "note";

export interface Decision {
  id: string;
  speech: SpeechId;
  kind: DecisionKind;
  /** argument or position ids */
  targets: string[];
  reason: string;
  by?: string;
}

export interface RoundGraph {
  ourSide: Side;
  positions: Position[];
  args: ArgUnit[];
  relations: Relation[];
  decisions: Decision[];
}

/** A section of our draft and the arguments it targets. */
export interface DraftTarget {
  sectionId: string;
  title: string;
  relation: "answers" | "group" | "cross_apply" | "extend" | "new";
  targets: string[];
  /** e.g. "turn" when the section turns the target */
  turn?: boolean;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export type CoverageStatus = "answered" | "grouped" | "cross_applied" | "conceded" | "deprioritized" | "unanswered" | "uncertain";

export interface CoverageItem {
  arg: ArgUnit;
  position?: Position;
  status: CoverageStatus;
  /** draft sections responsible */
  sections: string[];
  /** explanation shown to the user */
  note?: string;
  /** the opponent arg is itself answering one of our args (context for extensions) */
  answersOurs?: string[];
}

export interface ExtensionNeed {
  ours: ArgUnit;
  position?: Position;
  /** opponent arguments against it, from the speech(es) we are answering */
  against: ArgUnit[];
  extendedBy: string[];
}

export interface CoverageReport {
  speech: SpeechId;
  items: CoverageItem[];
  counts: Record<CoverageStatus, number>;
  extensions: ExtensionNeed[];
  /** notes about incomplete records, never treated as concessions */
  recordWarnings: string[];
}

const LOW_CONFIDENCE = 0.55;

export function isLive(a: ArgUnit): boolean {
  return a.delivery !== "not_read";
}

/**
 * Compute coverage for the speech we are preparing.
 *
 * Opponent arguments to answer come from `speechesToAnswer(target)`. Their
 * status is derived only from actual links: draft sections that target them,
 * or explicit decisions. A model's claim that "everything is answered" has no
 * input here.
 */
export function computeCoverage(graph: RoundGraph, target: SpeechId, draft: DraftTarget[], recordedSpeeches: Set<SpeechId>): CoverageReport {
  const posById = new Map(graph.positions.map((p) => [p.id, p]));
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const answerSpeeches = speechesToAnswer(target);
  const recordWarnings: string[] = [];
  for (const s of answerSpeeches) {
    if (!recordedSpeeches.has(s)) {
      recordWarnings.push(`No record of the ${s}. Anything said in it is missing from this list; missing records are not treated as concessions.`);
    }
  }

  const decided = new Map<string, Decision>();
  for (const d of graph.decisions.filter((d) => d.speech === target)) {
    for (const t of d.targets) decided.set(t, d);
  }

  const bySection = new Map<string, { status: CoverageStatus; sections: string[] }>();
  const mark = (argId: string, status: CoverageStatus, sectionId: string) => {
    const cur = bySection.get(argId);
    const rank: Record<CoverageStatus, number> = { answered: 5, grouped: 4, cross_applied: 3, conceded: 2, deprioritized: 1, uncertain: 0, unanswered: 0 };
    if (!cur) bySection.set(argId, { status, sections: [sectionId] });
    else {
      cur.sections.push(sectionId);
      if (rank[status] > rank[cur.status]) cur.status = status;
    }
  };
  for (const s of draft) {
    if (s.relation === "extend" || s.relation === "new") continue;
    const status: CoverageStatus = s.relation === "cross_apply" ? "cross_applied" : s.relation === "group" || s.targets.length > 1 ? "grouped" : "answered";
    for (const t of s.targets) mark(t, status, s.sectionId);
  }

  const theirs = graph.args
    .filter((a) => a.side !== SPEECHES[target].side && answerSpeeches.includes(a.speech) && isLive(a))
    .sort((a, b) => (posById.get(a.positionId)?.order ?? 0) - (posById.get(b.positionId)?.order ?? 0) || a.order - b.order);

  const items: CoverageItem[] = theirs.map((arg) => {
    const position = posById.get(arg.positionId);
    const answersOurs = graph.relations
      .filter((r) => r.status !== "rejected" && r.from === arg.id && (r.type === "answers" || r.type === "turns"))
      .flatMap((r) => r.to)
      .filter((id) => argById.get(id)?.side === SPEECHES[target].side);
    const fromDraft = bySection.get(arg.id);
    const decision = decided.get(arg.id) ?? decided.get(arg.positionId);
    let status: CoverageStatus;
    let note: string | undefined;
    if (fromDraft) {
      status = fromDraft.status;
    } else if (decision && (decision.kind === "concede" || decision.kind === "kick")) {
      status = "conceded";
      note = decision.reason || undefined;
    } else if (decision && decision.kind === "deprioritize") {
      status = "deprioritized";
      note = decision.reason || undefined;
    } else if (arg.delivery === "uncertain" || (arg.provenance.type === "ai_inferred" && arg.provenance.confidence < LOW_CONFIDENCE)) {
      status = "uncertain";
      note = arg.delivery === "uncertain" ? "Not sure this was read." : "The system's reading of this argument is low-confidence; confirm it.";
    } else {
      status = "unanswered";
    }
    if (!note && arg.delivery === "documented") note = "In their document; not confirmed as read.";
    return { arg, position, status, sections: fromDraft?.sections ?? [], note, answersOurs };
  });

  const counts: Record<CoverageStatus, number> = { answered: 0, grouped: 0, cross_applied: 0, conceded: 0, deprioritized: 0, unanswered: 0, uncertain: 0 };
  for (const it of items) counts[it.status]++;

  // Our earlier arguments that the opponent answered in the speeches we are responding to.
  const extendable = new Set(speechesToExtend(target));
  const extensionsMap = new Map<string, ExtensionNeed>();
  for (const it of items) {
    for (const oursId of it.answersOurs ?? []) {
      const ours = argById.get(oursId);
      if (!ours || !extendable.has(ours.speech)) continue;
      const need = extensionsMap.get(oursId) ?? { ours, position: posById.get(ours.positionId), against: [], extendedBy: [] };
      need.against.push(it.arg);
      extensionsMap.set(oursId, need);
    }
  }
  for (const s of draft.filter((d) => d.relation === "extend")) {
    for (const t of s.targets) {
      const ours = argById.get(t);
      if (!ours) continue;
      const need = extensionsMap.get(t) ?? { ours, position: posById.get(ours.positionId), against: [], extendedBy: [] };
      need.extendedBy.push(s.sectionId);
      extensionsMap.set(t, need);
    }
  }

  return { speech: target, items, counts, extensions: [...extensionsMap.values()], recordWarnings };
}

/**
 * Positions the opponent introduced earlier but did not carry into the speeches
 * we are answering. Only reported as "possibly kicked" when those speeches
 * have a record; otherwise we cannot tell.
 */
export function possiblyKickedPositions(graph: RoundGraph, target: SpeechId, recordedSpeeches: Set<SpeechId>): { position: Position; certain: boolean }[] {
  const theirSide = opposite(SPEECHES[target].side);
  const answer = speechesToAnswer(target);
  const allRecorded = answer.every((s) => recordedSpeeches.has(s));
  const liveIn = new Set(graph.args.filter((a) => answer.includes(a.speech) && isLive(a)).map((a) => a.positionId));
  return graph.positions
    .filter((p) => p.side === theirSide && isBefore(p.introducedIn, target) && !answer.includes(p.introducedIn))
    .filter((p) => !liveIn.has(p.id))
    .map((position) => ({ position, certain: allRecorded }));
}

/**
 * Opponent arguments that our side never answered in any later speech of ours.
 * Candidates for "they dropped/conceded X" claims — but only claims about
 * arguments that were confirmed delivered and whose answering speech is recorded.
 */
export function unansweredByUs(graph: RoundGraph, uptoExclusive: SpeechId, recordedSpeeches: Set<SpeechId>): { arg: ArgUnit; safeToClaimDropped: boolean }[] {
  const ours = graph.ourSide;
  const answered = new Set(
    graph.relations
      .filter((r) => r.status !== "rejected")
      .filter((r) => {
        const from = graph.args.find((a) => a.id === r.from);
        return from?.side === ours && (r.type === "answers" || r.type === "turns" || r.type === "cross_applies");
      })
      .flatMap((r) => r.to),
  );
  return graph.args
    .filter((a) => a.side !== ours && isLive(a) && isBefore(a.speech, uptoExclusive) && !answered.has(a.id))
    .map((arg) => {
      // The first speech of ours after the argument that could have answered it.
      const responder = (["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"] as SpeechId[]).find(
        (s) => SPEECHES[s].side === ours && isBefore(arg.speech, s) && isBefore(s, uptoExclusive),
      );
      const safe = arg.delivery === "confirmed" && !!responder && recordedSpeeches.has(responder);
      return { arg, safeToClaimDropped: safe };
    });
}

// ---------------------------------------------------------------------------
// Contradiction detection (deterministic layer; AI analysis sits on top)
// ---------------------------------------------------------------------------

export interface Conflict {
  code: "double_turn" | "nonunique_undercuts_link_turn" | "impact_defense_vs_impact_turn" | "turn_and_concede";
  positionId: string;
  argIds: string[];
  message: string;
}

/**
 * Checks one side's planned or delivered arguments for known incompatible
 * combinations on the same position.
 */
export function detectConflicts(graph: RoundGraph, side: Side, args: ArgUnit[] = graph.args): Conflict[] {
  const conflicts: Conflict[] = [];
  const posName = new Map(graph.positions.map((p) => [p.id, p.name]));
  const bySideByPos = new Map<string, ArgUnit[]>();
  for (const a of args.filter((a) => a.side === side && isLive(a))) {
    const list = bySideByPos.get(a.positionId) ?? [];
    list.push(a);
    bySideByPos.set(a.positionId, list);
  }
  for (const [positionId, list] of bySideByPos) {
    const name = posName.get(positionId) ?? "this position";
    const linkTurns = list.filter((a) => a.role === "link_turn");
    const impactTurns = list.filter((a) => a.role === "impact_turn");
    const nonUnique = list.filter((a) => a.role === "uniqueness" && !a.offensive);
    const impactDefense = list.filter((a) => a.role === "defense" && /impact|no war|no escalation|empirically/i.test(a.text));
    if (linkTurns.length && impactTurns.length) {
      conflicts.push({
        code: "double_turn",
        positionId,
        argIds: [...linkTurns, ...impactTurns].map((a) => a.id),
        message: `Double turn on ${name}: a link turn says the plan prevents the impact, and an impact turn says the impact is good. Together they say the plan prevents something good, which is offense for the other side. Pick one.`,
      });
    }
    if (linkTurns.length && nonUnique.length) {
      conflicts.push({
        code: "nonunique_undercuts_link_turn",
        positionId,
        argIds: [...linkTurns, ...nonUnique].map((a) => a.id),
        message: `On ${name}, non-uniqueness arguments weaken your link turn: if the impact happens anyway, preventing it is not unique offense. Decide whether the turn or the defense is your priority.`,
      });
    }
    if (impactTurns.length && impactDefense.length) {
      conflicts.push({
        code: "impact_defense_vs_impact_turn",
        positionId,
        argIds: [...impactTurns, ...impactDefense].map((a) => a.id),
        message: `On ${name}, impact defense (the impact won't happen) cuts against your impact turn (the impact is good). If you go for the turn, avoid relying on the defense.`,
      });
    }
  }
  return conflicts;
}
