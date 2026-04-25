/**
 * Strategy engine — local heuristics that bridge AI calls. Every function here
 * runs synchronously (no API) so the UI can give immediate feedback.
 */

import { SPEECH_TIME_BUDGETS } from "./debate-knowledge";

export type SpeechName =
  | "1AC"
  | "1NC"
  | "2AC"
  | "2NC"
  | "1NR"
  | "1AR"
  | "2NR"
  | "2AR";

export interface ImpactClaim {
  label: string;
  magnitude: number; // 0-100
  probability: number; // 0-100
  timeframe: number; // years to impact
  reversibility: number; // 0-100, higher = harder to reverse
  scope: "individual" | "regional" | "national" | "global" | "structural";
}

export interface ImpactComparison {
  winner: "aff" | "neg" | "toss-up";
  margin: number; // 0-100
  reasoning: string[];
  weakestAxis: string;
}

/**
 * Crude but useful: weighs two impact claims using the standard policy debate
 * heuristic (probability-weighted magnitude with timeframe and reversibility
 * adjustments). Used by ImpactCalc to give a fast preview before AI weighs in.
 */
export function compareImpacts(
  aff: ImpactClaim,
  neg: ImpactClaim
): ImpactComparison {
  const score = (i: ImpactClaim): number => {
    const probWeight = i.probability / 100;
    const reversibilityBoost = 1 + (i.reversibility / 100) * 0.4;
    const timeframePenalty = Math.max(0.4, 1 - i.timeframe / 30);
    const scopeBoost =
      i.scope === "structural"
        ? 1.25
        : i.scope === "global"
        ? 1.15
        : i.scope === "national"
        ? 1
        : i.scope === "regional"
        ? 0.85
        : 0.65;
    return (
      i.magnitude * probWeight * reversibilityBoost * timeframePenalty * scopeBoost
    );
  };

  const affScore = score(aff);
  const negScore = score(neg);
  const total = affScore + negScore;
  const reasoning: string[] = [];

  if (aff.magnitude > neg.magnitude + 10) {
    reasoning.push(
      `Aff magnitude (${aff.magnitude}) outweighs neg (${neg.magnitude}) — bigger impact.`
    );
  } else if (neg.magnitude > aff.magnitude + 10) {
    reasoning.push(
      `Neg magnitude (${neg.magnitude}) outweighs aff (${aff.magnitude}).`
    );
  }

  if (aff.probability > neg.probability + 15) {
    reasoning.push(
      `Aff has clearer probability (${aff.probability}% vs ${neg.probability}%).`
    );
  } else if (neg.probability > aff.probability + 15) {
    reasoning.push(
      `Neg probability is more credible (${neg.probability}% vs ${aff.probability}%).`
    );
  }

  if (aff.timeframe < neg.timeframe - 1) {
    reasoning.push(
      `Aff impact triggers first (${aff.timeframe} vs ${neg.timeframe} years).`
    );
  } else if (neg.timeframe < aff.timeframe - 1) {
    reasoning.push(
      `Neg DA triggers first — preempts aff impact (${neg.timeframe} vs ${aff.timeframe} years).`
    );
  }

  if (aff.reversibility > neg.reversibility + 15) {
    reasoning.push(`Aff impact is more irreversible — structural advantage.`);
  } else if (neg.reversibility > aff.reversibility + 15) {
    reasoning.push(`Neg impact is more irreversible — structural advantage.`);
  }

  let winner: "aff" | "neg" | "toss-up";
  let margin = 0;
  if (total === 0) {
    winner = "toss-up";
  } else {
    margin = Math.abs(((affScore - negScore) / total) * 100);
    if (margin < 8) winner = "toss-up";
    else winner = affScore > negScore ? "aff" : "neg";
  }

  const weakestAxis =
    aff.probability < 30 || neg.probability < 30
      ? "probability"
      : aff.timeframe > 20 || neg.timeframe > 20
      ? "timeframe"
      : aff.reversibility < 30 || neg.reversibility < 30
      ? "reversibility"
      : "magnitude";

  return { winner, margin: Math.round(margin), reasoning, weakestAxis };
}

/**
 * Estimate how many cards + analytics will fit in a given speech, given the
 * speed of the speaker (in words per minute).
 */
export function estimateSpeechCapacity(
  speech: SpeechName,
  wpm: number,
  cardSecondsHighlighted: number,
  analyticSeconds: number
): {
  totalSeconds: number;
  cardCapacity: number;
  analyticCapacity: number;
  recommendation: string;
} {
  const budget = SPEECH_TIME_BUDGETS[speech] || SPEECH_TIME_BUDGETS["1NC"];
  const totalSeconds = budget.totalMin * 60;
  // Reserve 20% of time for transitions, signposting, breathing.
  const usable = totalSeconds * 0.8;

  const cardCapacity = Math.floor(usable / cardSecondsHighlighted);
  const analyticCapacity = Math.floor(usable / analyticSeconds);

  let recommendation = "";
  if (wpm < 200)
    recommendation =
      "Conversational speed: aim for fewer, deeper arguments. Quality > coverage.";
  else if (wpm < 280)
    recommendation = "Moderate speed: standard circuit-light pace.";
  else if (wpm < 330)
    recommendation = "Fast circuit: full coverage feasible.";
  else
    recommendation =
      "Top speed: maximum coverage. Make sure the judge can flow you.";

  return { totalSeconds, cardCapacity, analyticCapacity, recommendation };
}

/**
 * Given a list of off-case positions, suggest which to kick in the block
 * based on aff response strength and judge tendencies.
 */
export interface OffCaseAssessment {
  name: string;
  type: "da" | "cp" | "k" | "t" | "theory";
  strengthOnFlow: number; // 0-100, higher = doing well
  affAnswerQuality: number; // 0-100, higher = aff answered it well
}

export function suggestKicks(
  positions: OffCaseAssessment[]
): {
  keep: OffCaseAssessment[];
  kick: OffCaseAssessment[];
  rationale: string[];
} {
  const scored = positions.map((p) => ({
    ...p,
    score: p.strengthOnFlow - p.affAnswerQuality * 0.7,
  }));
  scored.sort((a, b) => b.score - a.score);

  const keep: OffCaseAssessment[] = [];
  const kick: OffCaseAssessment[] = [];
  const rationale: string[] = [];

  for (let i = 0; i < scored.length; i++) {
    const p = scored[i];
    if (i < 2 && p.score > 0) {
      keep.push(p);
      rationale.push(
        `Keep ${p.name} (${p.type.toUpperCase()}): strong on flow (${p.strengthOnFlow}), weak aff answers (${p.affAnswerQuality}).`
      );
    } else if (p.score < -20) {
      kick.push(p);
      rationale.push(
        `Kick ${p.name} (${p.type.toUpperCase()}): aff handled it well — invest time elsewhere.`
      );
    } else {
      // Marginal — kick if more than 2 already kept
      if (keep.length >= 2) {
        kick.push(p);
        rationale.push(
          `Kick ${p.name}: marginal value, would dilute the 2NR.`
        );
      } else {
        keep.push(p);
        rationale.push(
          `Keep ${p.name}: viable backup if main collapse falters.`
        );
      }
    }
  }

  return { keep, kick, rationale };
}

/**
 * Evaluate a tag for technical quality. Returns a score 0-100 and notes.
 */
export function evaluateTagQuality(tag: string): {
  score: number;
  notes: string[];
} {
  const notes: string[] = [];
  let score = 60;

  if (tag.length < 30) {
    notes.push("Tag is too short — unlikely to communicate the warrant.");
    score -= 20;
  } else if (tag.length > 220) {
    notes.push("Tag is over 220 characters — debaters won't read it cleanly.");
    score -= 10;
  } else if (tag.length > 80 && tag.length < 180) {
    notes.push("Tag length is in the sweet spot.");
    score += 10;
  }

  if (/—|--/.test(tag)) {
    notes.push("Em-dash structure is good for layered tags.");
    score += 5;
  }

  if (/[a-z][A-Z]/.test(tag)) {
    notes.push("Possible run-on without punctuation. Check.");
    score -= 5;
  }

  const lowerTag = tag.toLowerCase();
  if (/(claim|argument|warrant|shows that|argues)/.test(lowerTag)) {
    notes.push("Tag uses meta-language — should make the claim itself, not describe one.");
    score -= 10;
  }

  if (/(causes|fails|solves|prevents|triggers|generates|creates|results in|leads to)/.test(lowerTag)) {
    notes.push("Causal verb is strong — direct claim.");
    score += 8;
  }

  if (/(empirically|historically|specifically)/.test(lowerTag)) {
    notes.push("Includes empirical / specificity hook.");
    score += 5;
  }

  return { score: Math.max(0, Math.min(100, score)), notes };
}

/**
 * Estimate read time in seconds for highlighted evidence.
 * Average competitive read speed for highlighted-only sections is ~310 wpm.
 */
export function estimateReadTime(
  evidenceHtml: string,
  wpm = 310
): { seconds: number; highlightedWords: number; totalWords: number } {
  const stripped = evidenceHtml.replace(/<[^>]+>/g, " ");
  const totalWords = stripped.split(/\s+/).filter(Boolean).length;

  const highlightMatches = evidenceHtml.match(/<mark>[\s\S]*?<\/mark>/g) || [];
  const highlightedWords = highlightMatches.reduce((sum, m) => {
    const text = m.replace(/<[^>]+>/g, " ").trim();
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  const seconds = Math.round((highlightedWords / wpm) * 60);
  return { seconds, highlightedWords, totalWords };
}

/**
 * Given a flow with cells, identify which arguments were dropped (no response
 * from the team that needed to respond).
 */
export interface FlowRow {
  category: string;
  label: string;
  cells: Array<{
    speech: SpeechName;
    side: "aff" | "neg";
    text: string;
    status: "new" | "answered" | "dropped" | "turned" | "extended";
  }>;
}

export function identifyDrops(
  rows: FlowRow[],
  perspective: "aff" | "neg"
): Array<{ row: FlowRow; lastSpeech: SpeechName; severity: "fatal" | "high" | "medium" | "low" }> {
  const drops: Array<{ row: FlowRow; lastSpeech: SpeechName; severity: "fatal" | "high" | "medium" | "low" }> = [];

  for (const row of rows) {
    for (let i = 0; i < row.cells.length - 1; i++) {
      const cell = row.cells[i];
      const next = row.cells[i + 1];
      if (cell.side !== perspective && next?.side === perspective && next.status === "dropped") {
        const severity =
          row.category.startsWith("k") || row.category.startsWith("da")
            ? "fatal"
            : row.category.startsWith("cp")
            ? "high"
            : row.category.startsWith("t")
            ? "high"
            : "medium";
        drops.push({ row, lastSpeech: cell.speech, severity });
      }
    }
  }

  return drops;
}

/**
 * Generate a strategic priority list for the next speech given the current state.
 */
export function prioritizeForNextSpeech(
  rows: FlowRow[],
  nextSpeech: SpeechName
): Array<{ priority: number; argument: string; rationale: string }> {
  const isRebuttal = ["1AR", "2NR", "2AR", "1NR"].includes(nextSpeech);
  const isFinal = ["2NR", "2AR"].includes(nextSpeech);
  const items: Array<{ priority: number; argument: string; rationale: string }> = [];

  for (const row of rows) {
    let priority = 50;
    const last = row.cells[row.cells.length - 1];
    if (!last) continue;

    if (last.status === "new") priority += 20;
    if (last.status === "turned") priority += 30;
    if (last.status === "extended") priority += 10;
    if (row.category.startsWith("k")) priority += 15;
    if (row.category.startsWith("da")) priority += 12;
    if (row.category.startsWith("cp")) priority += 10;
    if (row.category.startsWith("case")) priority += 8;
    if (row.category.startsWith("t")) priority += 5;

    if (isFinal && !["k", "da", "cp", "case"].some((c) => row.category.startsWith(c))) {
      priority -= 25;
    }

    items.push({
      priority,
      argument: row.label,
      rationale: `${row.category} — last status: ${last.status}, last speech: ${last.speech}`,
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  return isRebuttal ? items.slice(0, 8) : items.slice(0, 15);
}

/**
 * Generate "even-if" layering recommendations — a top-debater technique that
 * pre-empts opponent answers by saying "even if you win [X], we still win
 * because [Y]."
 */
export function generateEvenIfLayers(
  ourArgument: string,
  theirAnticipatedAnswers: string[]
): string[] {
  return theirAnticipatedAnswers.map(
    (answer) =>
      `Even if you grant their argument that ${answer.toLowerCase().replace(/\.$/, "")}, ${ourArgument.toLowerCase().replace(/^./, (c) => c)} still wins because [warrant + impact].`
  );
}
