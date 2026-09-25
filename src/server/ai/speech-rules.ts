/**
 * Speech-specific generation rules, from docs/research/debate-domain.md
 * Part B (sources: Snider, The Code of the Debater; NAUDL/Bellon manuals;
 * NSDA Unified Manual §7; Batterman 2021). Kept as data so evaluation cases
 * can reference the exact rule text a draft was held to.
 */

import type { SpeechId } from "@/domain/format";

export const GLOBAL_RULES = `GLOBAL RULES (every speech)
1. Evidence integrity: never invent evidence, quotations, authors, dates, statistics, or qualifications. Cards may only be referenced by the card ids provided. Analytics are your own reasoning and must never be phrased as if an author said them. If an argument needs evidence you don't have, say so in needsEvidence instead of asserting it as fact.
2. Make every interaction explicit: each section says which argument(s) it answers (targets = their ids) or extends. Don't rely on implied clash.
3. Respect the record: ignore arguments marked not_read. Arguments marked documented (in their doc, not confirmed read) still get answered, but don't claim they were "dropped". Never treat a missing speech record as a concession.
4. Answers must engage the actual warrant: identify their claim and reasoning, take the strongest reasonable version of it, then explain why it is wrong or outweighed, with the specific warrant (from a provided card or explicit reasoning), and the consequence for the debate ("that means…", "so even if they win X…").
5. Compare, don't just contradict: when evidence conflicts, compare on the substance (recency relative to the change in question, author qualification, methodology, specificity to the plan, whether their card assumes something ours disproves).
6. Fit the time budget. Put the most important material first within each position; set priority 1 (must keep), 2, or 3 (cut first) on every section.
7. Signpost like a real speech: flow names, numbers, "they say / but / because / therefore".
8. Never create contradictions: no double turns (link turn + impact turn on the same chain); don't pair an impact turn with no-link/non-unique defense; a link turn needs non-uniqueness to be offense.
9. Don't pad. A short precise answer beats a long vague one. Group only arguments that genuinely share a warrant (never group T/theory standards or turns).`;

export const SPEECH_RULES: Record<SpeechId, string> = {
  "1AC": `1AC (first affirmative constructive).
MUST: plan text (verbatim as the team wrote it), inherency, one or more advantages (each: uniqueness/harm, internal link, impact), solvency. Order per the team's instructions. Leave ≥10 s buffer.
MUST NOT: alter cards, add unrequested advantages, exceed time.
STRUCTURE: Advantage(s) → Plan → Solvency (or the team's order).`,
  "1NC": `1NC (first negative constructive).
MUST: complete shells — DA = uniqueness + link + impact; CP = text + solvency + named net benefit; T = interpretation + violation + standards + voter; K = link + impact + alternative (+ framework). Attack the case (solvency, impact defense, case turns). No two unconditional positions may contradict.
MUST NOT: incomplete shells; exceed time.
STRUCTURE: roadmap "N off" → off-case (T/theory usually first) → case. Shells ~0:30–1:30 each; case 1:30–3:00.`,
  "2AC": `2AC (second affirmative constructive, last aff constructive).
MUST: answer EVERY 1NC off-case position with numbered answers (at least one answer each is a hard requirement). Prioritize offense: turns (never double turns), add-ons, DAs to the CP. Against a CP: permutations (explain each), solvency deficit, theory if set up. Against T: we meet, counter-interpretation, standards, reasonability. Against a K: framework, perm, link/impact answers, alternative answers, case outweighs. Extend 1AC evidence by author. Spend roughly as much time on case as the 1NC did. Put the best evidence here — the 1AR shouldn't read new cards.
MUST NOT: re-explain their arguments; group T; answer not_read positions.
STRUCTURE: roadmap in 1NC order → off-case → case. Allocate time in proportion to each position's threat.`,
  "2NC": `2NC (first speech of the negative block).
MUST: take only positions assigned to the 2NC (the 1NR covers the rest; don't overlap). Answer every 2AC number on those positions, TURNS FIRST. Extend with evidence and add impact calculus and "turns the case". Point out double turns and dropped arguments (only when the record supports it). Kick explicitly with a concession that actually neutralizes their turns (conceding non-uniqueness does NOT take out a link turn).
MUST NOT: double-cover the 1NR's positions; drop turns.
STRUCTURE: roadmap → overview (impact calculus) → line-by-line in 2AC order. Usually 1–2 major positions.`,
  "1NR": `1NR (second speech of the negative block).
MUST: cover the remaining assigned positions in depth (every 2AC number). Kick weak arguments explicitly. Preempt likely 1AR answers.
MUST NOT: repeat the 2NC; introduce new positions.
STRUCTURE: roadmap → line-by-line per position.`,
  "1AR": `1AR (first affirmative rebuttal — the hardest speech: 5 minutes against a 13-minute block).
MUST: respond to every block-extended position (hard requirement). Answer "turns the case" and a-priori issues (T, K framework) first. For each off-case position extend the best 1–2 2AC answers by number with warrant and implication; keep a perm alive on each CP/K; extend non-uniqueness alongside link turns. Group similar block arguments (not T, not turns). Answer NEW block arguments with new responses and label them. Extend 1AC warrants against case arguments. Decide the time allocation before writing.
MUST NOT: answer 1NC positions the block didn't extend, EXCEPT to extend live aff turns on kicked positions as offense; read more than 1–2 new cards; overexplain; extend 2AC answers that were never made.
STRUCTURE: roadmap → per-position extensions (block order) → case. Budget by what the 2NR will likely go for and what can lose the round.`,
  "2NR": `2NR (second negative rebuttal, last neg speech).
MUST: choose a strategy — one position by default (2–3 only if the team says so); only positions extended in the block qualify. Open with an overview: the ballot story and impact calculus (magnitude, probability, timeframe, reversibility, turns the case, "even if"). Line-by-line on the chosen position(s) against every 1AR argument, with specific authors and warrants. Explicitly kick everything else (with a concession that neutralizes any aff turns). Enough case defense to make the DA outweigh. Judge instruction: presumption, judge kick if appropriate, "no new 2AR arguments; if it isn't in the 1AR, ignore it".
MUST NOT: go for anything not in the block; make new arguments except answers to new 1AR arguments; split time evenly across many positions; extend by tag only.
STRUCTURE: overview → chosen position line-by-line → secondary (CP or case) → judge instruction. E.g. CP+DA: overview 0:20–0:40, DA 2:00–2:30, CP 1:00–1:30, case 0:30–1:00, instruction 0:10.`,
  "2AR": `2AR (second affirmative rebuttal, last speech).
MUST: pick one path to the ballot. Answer the 2NR's biggest argument first, then the rest in priority order. Every claim must trace to a 1AR argument (the "seed") — targets for extensions must be 1AR (or 2AC via 1AR) arguments. "Even if" statements, impact comparison, closing story. Answering genuinely new 2NR arguments is legitimate — label those.
MUST NOT: introduce arguments without a 1AR ancestor (except answers to new 2NR arguments); read new cards by default; newly cross-apply across flows.
STRUCTURE: overview (why the aff wins even if the neg wins X) → the 2NR's main position → remaining 2NR arguments → case impacts and weighing. Allocate roughly in proportion to the 2NR's time.`,
};
