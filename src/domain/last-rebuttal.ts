/**
 * What to go for in the last rebuttal (2NR or 2AR): for each position, what is still ours (live arguments,
 * cards, arguments they dropped) and what of theirs we haven't answered (their turns first). Deterministic,
 * from the flow; the debaters decide. Positions the 2NR can't go for (not extended in the block, REB-4) are
 * marked unavailable.
 */

import { droppedByThem, isLive, positionsAvailableFor2NR, unansweredByUs, type ArgUnit, type Position, type RoundGraph, type TheirDrop } from "./flow";
import { isBefore, SPEECHES, type SpeechId } from "./format";

export interface PositionScore {
  position: Position;
  /** the 2NR may only go for what the block extended; the 2AR for what the 1AR extended */
  available: boolean;
  /** our live arguments on it */
  ours: ArgUnit[];
  /** our arguments on it with evidence */
  cards: number;
  /** our arguments on it they never answered */
  dropped: TheirDrop[];
  /** their arguments on it we haven't answered */
  theirOpen: ArgUnit[];
  /** of those, their turns (offense against us) */
  theirTurns: ArgUnit[];
  score: number;
  reasons: string[];
}

const TURNS = new Set(["link_turn", "impact_turn"]);

export function lastRebuttalScores(graph: RoundGraph, speech: "2NR" | "2AR", recorded: Set<SpeechId>): PositionScore[] {
  const side = SPEECHES[speech].side;
  const drops = droppedByThem(graph, speech, recorded);
  const open = graph.ourSide === side ? unansweredByUs(graph, speech, recorded).map((u) => u.arg) : [];
  const blockExtended = speech === "2NR" ? new Set(positionsAvailableFor2NR(graph).map((p) => p.id)) : new Set(graph.args.filter((a) => a.side === "aff" && a.speech === "1AR" && isLive(a)).map((a) => a.positionId));
  const out: PositionScore[] = [];
  for (const position of graph.positions) {
    const ours = graph.args.filter((a) => a.positionId === position.id && a.side === side && isLive(a) && isBefore(a.speech, speech));
    if (!ours.length) continue;
    const dropped = drops.filter((d) => d.arg.positionId === position.id);
    const theirOpen = open.filter((a) => a.positionId === position.id);
    const theirTurns = theirOpen.filter((a) => TURNS.has(a.role));
    const cards = ours.filter((a) => a.cardIds.length > 0 || !!a.cites?.length || a.evidence === "card").length;
    const available = blockExtended.has(position.id);
    const safeDrops = dropped.filter((d) => d.safeToClaim).length;
    const score = 3 * safeDrops + (dropped.length - safeDrops) + Math.min(ours.length, 8) * 0.5 + cards * 0.5 - 3 * theirTurns.length - (theirOpen.length - theirTurns.length) - (available ? 0 : 100);
    const reasons: string[] = [];
    if (!available) reasons.push(speech === "2NR" ? "Not extended in the block, so the 2NR can't go for it." : "Not extended in the 1AR, so the 2AR can't go for it.");
    if (safeDrops) reasons.push(`${safeDrops} of your arguments went unanswered (record confirmed).`);
    else if (dropped.length) reasons.push(`${dropped.length} of your arguments may have gone unanswered (record incomplete).`);
    if (theirTurns.length) reasons.push(`Their ${theirTurns.length === 1 ? "turn is" : `${theirTurns.length} turns are`} still unanswered: that's offense against you.`);
    const defense = theirOpen.length - theirTurns.length;
    if (defense) reasons.push(`${defense} of their other answers still need a response.`);
    if (!theirOpen.length && available) reasons.push("Everything they said on it has an answer.");
    out.push({ position, available, ours, cards, dropped, theirOpen, theirTurns, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}
