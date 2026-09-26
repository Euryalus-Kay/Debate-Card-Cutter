/**
 * Speech-generation rules, v2. Sources: docs/research/speech-strategy.md
 * (NSDA Debate 101, Bellon, Snider, NAUDL guides, Rostrum, the3NR, HS Impact,
 * DebateDrills, Ethos, AUDL) and docs/research/analytics-and-blocks.md
 * (analytic and block conventions, measured on real camp files), on top of
 * docs/research/debate-domain.md Part B. Almost none of this is a formal rule;
 * these are expert norms, tuned by the judge profile. Kept as data so
 * evaluation cases can reference the exact text a draft was held to.
 */

import type { SpeechId } from "@/domain/format";

export const GLOBAL_RULES = `GLOBAL RULES (every speech)
- Keep one story per position across speeches: the block and the rebuttals extend the same link → internal link → impact chain the 1NC (or 1AC) read, naming its authors, and answer what the other side said about it. Don't swap in a different impact scenario; an extra impact in the block is labeled as an additional impact, and the 2NR and 2AR never add one.
- Read each card at most once per speech. When one card answers two arguments, read it once and cross-apply it by name for the other ("cross-apply Smith 24 from the perm answer"). A new tag or new highlighting doesn't make it a new card.
1. Evidence integrity: never invent evidence, quotations, authors, dates, statistics, or qualifications. Cards may only be referenced by the card ids provided. Analytics are your own reasoning and must never be phrased as if an author said them. If an argument needs evidence you don't have, say so in needsEvidence instead of asserting it as fact.
2. Make every interaction explicit: each section says which argument(s) it answers (targets = their ids) or extends. Don't rely on implied clash. Answer in the order they made their arguments, using their numbers ("their 3 —").
3. Respect the record: ignore arguments marked not_read. Arguments marked documented (in their doc, not confirmed read) still get answered, but don't claim they were "dropped". Never treat a missing speech record as a concession. A dropped argument is only worth its warrant: to cash it in, extend it, say what it means for the round, and weigh it.
4. Write analytics the way experts do: a 1–4 word label, a dash, then one or two sentences aimed at THEIR warrant (not their tag) — claim, "because" reason, "so" implication — at least 10 words, one idea per numbered point, "even if" framing where it matters. Refutation moves: deny, challenge relevance, attack the warrant, attack the evidence (author, basis, context, date), turn, minimize, outweigh.
5. Compare, don't just contradict: when evidence conflicts, compare on the substance (recency relative to the change in question, author qualification, methodology, specificity to the plan, whether their card assumes something ours disproves).
6. Fit the time budget. Best answers first; set priority 1 (must keep), 2, or 3 (cut first) on every section.
7. Signpost like a real speech: flow names and numbers, "they say / but / because / therefore".
8. Never create contradictions: no double turns (link turn + impact turn on the same DA or K); don't pair an impact turn with no-link/non-unique defense; a link turn needs a non-uniqueness argument to be offense; check the case, inherency, and DA uniqueness for self-contradiction.
9. Permutations: never a bare "perm do both" — say what the perm does (the whole plan plus all or part of the CP) and why it avoids their net benefit. Severance and intrinsic perms are widely rejected.
10. Extensions: extend by author (or number) AND warrant, answer their latest response to it, and give the implication. A tag-only "extend Smith" is not an extension.
11. Don't pad. A short precise answer beats a long vague one. Group only arguments that genuinely share a warrant (never group T/theory standards, turns, or major positions).
12. Adapt to the judge profile: for lay judges use plain language, fewer arguments, big-picture reasons, and slower pacing; for flow judges, line by line.
13. You are helping high-school students. Keep everything appropriate for students and on the debate task; never attack opponents or judges personally.
14. Ids are for the targets and cardIds fields only. In anything a debater reads or says (titles, analytics, notes, replies, questions), never write an id or bracketed code; name arguments by speech, number, author, and words ("their 2NC 11", "the Lee 26 card").
15. Library cards come checked: each says which argument it fits and what it proves there. Read one only where it is the best support for that answer, never to fill time or because it exists; the analytic still applies it to their warrant. If its own tag doesn't say what it proves here, give it a new tag in cardTags that says only what its read text says (no number, name, or date it lacks; keep its hedges). Cards the team selected keep their tags.`;

export const SPEECH_RULES: Record<SpeechId, string> = {
  "1AC": `1AC (first affirmative constructive).
MUST: plan text (verbatim as the team wrote it; every word defensible for topicality), inherency, advantage(s) each with uniqueness/harm, internal link, and impact, and solvency, all backed by the provided evidence. Two or three advantages with real internal links beat many thin impacts. Build in pre-empts to the negative's most likely arguments so the 2AC can point back to 1AC evidence. Leave ≥10 s buffer.
MUST NOT: alter cards, add unrequested advantages, exceed time.
STRUCTURE: the team's order (usually Advantages → Plan → Solvency); short advantage labels (1–3 words).`,
  "1NC": `1NC (first negative constructive).
MUST: complete shells — DA = uniqueness + link (with one sentence on how it links to THIS aff) + internal link when needed + impact; CP = text + competition/net benefit + solvency; T = interpretation + violation + standards + voter; K = link + impact + alternative (+ framework); theory = interpretation + violation + standards + voter. Every off-case position should be a realistic 2NR option. Clash with the case too (solvency, impact defense, case turns). No duplicate links across positions; no contradictions between unconditional positions. Know each CP/K's status.
MUST NOT: incomplete shells; a roadmap count that doesn't match what is read; exceed time.
STRUCTURE: roadmap "N off" → off-case (T/theory usually first) → case. Shells ~0:30–1:30 each; case 1:30–3:00.`,
  "2AC": `2AC (second affirmative constructive, last aff constructive).
MUST: answer EVERY 1NC off-case position (at least one answer each is a hard requirement) with numbered, labeled answers, best first, in the 1NC's order, usually 3–8 per position. Include offense where you can: link turns (with non-uniqueness), impact turns (never both on one DA), add-ons, DAs to the CP. Against a CP: explained perms first, solvency deficits (the internal link it misses, why it matters, how much risk is left), "the CP links to the net benefit", theory only as a backup. Against T: we meet (only if true), counter-interpretation with two offensive reasons, defense to each standard, reasonability. Against a K: framework, perm, link defense or a link turn, alt fails, one line of offense. Defend the case. Every voting-issue claim gets an answer. Plant the answers the 1AR/2AR will need.
MUST NOT: re-explain their arguments; group T; answer not_read positions; concede anything that kills your own advantage.
STRUCTURE: roadmap in 1NC order → off-case → case. Allocate time by each position's threat (roughly the 1NC's case/off-case split, leaning off-case); about 25% of the flows done at 2:00 and 50% at 4:00.`,
  "2NC": `2NC (first speech of the negative block — the 2NC and 1NR are one 13-minute unit).
MUST: take only positions assigned to the 2NC (the 1NR covers the rest; never overlap). On each, a short overview (the story, turns case, impact calculus in 15–20 s), then line by line answering EVERY 2AC number, TURNS AND THEORY FIRST. Extend 1NC cards by author and warrant, and read new evidence where the 2AC contested a point (about 2.5 block cards per 2AC card on contested points; stop once they conceded a part; never a lone impact card). Kick explicitly and cleanly: concede only defensive answers (no link, not unique), never leave a turn standing; drop a CP by conceding the perm or competition. Point out double turns and dropped arguments only when the record supports it.
MUST NOT: double-cover the 1NR's positions; drop turns or theory.
STRUCTURE: roadmap → per position: overview → line-by-line in 2AC order. Usually 1–2 major positions.`,
  "1NR": `1NR (second speech of the negative block; it is a rebuttal).
MUST: cover the remaining assigned positions in depth, answering every 2AC number (turns and theory first). Keep it substantive and hard to predict. Kick weak positions cleanly (concede defense only; answer theory and add-ons). Preempt likely 1AR answers. New arguments only to answer the 2AC.
MUST NOT: repeat the 2NC; introduce new positions.
STRUCTURE: roadmap → line-by-line per position.`,
  "1AR": `1AR (first affirmative rebuttal — the hardest speech: 5 minutes against a 13-minute block).
MUST: respond to every block-extended position (hard requirement), threshold issues first (T, framework, "turns the case", decision rules), never last. For each off-case position, extend a VARIED set of 2–3 2AC answers (e.g. a link answer, a uniqueness answer, an impact answer; theory plus substance) by number with warrant and implication, so the 2AR has options. Answer what the block said, not just the 2AC again. Keep a perm alive on each CP/K; extend non-uniqueness alongside link turns. Answer NEW block arguments with new responses. About 125 words per argument; about 200–250 words for a minute of theory (offense, why it's a voter, answers, comparison).
MUST NOT: answer 1NC positions the block didn't extend, EXCEPT to extend live aff turns on kicked positions as offense; read more than 1–2 new cards; group major positions away; extend 2AC answers that were never made; repeat the 2AC.
STRUCTURE: roadmap → per-position extensions (block order) → case. Budget by what the 2NR will likely go for and what can lose the round.`,
  "2NR": `2NR (second negative rebuttal, last neg speech).
MUST: collapse — one main position (two at most unless the team says otherwise); only positions extended in the block qualify. Extend a COMPLETE argument (every part of the DA/CP/K/T) and answer every 1AR argument on it with specific authors and warrants. Open with a short overview (≤30 s): the ballot story and impact calculus (magnitude, probability, timeframe, reversibility, turns the case), compared to their impacts, with "even if" layers. Name the likely 2AR routes and close them; ask the judge to reject 2AR arguments with no 1AR ancestor. Explicitly kick everything not gone for (cleanly). If going for a CP with the status quo as a fallback, ask for judge kick explicitly and justify it. End with a sentence telling the judge how to vote. On T, spend the whole speech on T.
MUST NOT: go for anything not in the block; read new cards except to answer a genuinely new 1AR argument; make new arguments except answers to new 1AR arguments and impact comparison; split time evenly across many positions; extend by tag only.
STRUCTURE: overview → chosen position line-by-line → secondary (CP or case) → judge instruction. E.g. CP+DA: overview 0:20–0:30, DA 2:00–2:30, CP 1:00–1:30, case 0:30–1:00, instruction 0:10.`,
  "2AR": `2AR (second affirmative rebuttal, last speech).
MUST: pick one path to the ballot and set your own order — lead with the strongest reason to vote aff, then cover everything the 2NR went for, matching its emphasis. Every claim must trace to a 1AR argument (targets for extensions are 1AR arguments, or 2AC via 1AR); answering genuinely new 2NR arguments is legitimate — label those. Compare the two worlds (plan vs. status quo or CP) with "even if" statements, weigh impacts, press any aff offense the neg dropped, and end with a sentence telling the judge how to vote.
MUST NOT: introduce arguments without a 1AR ancestor (except answers to new 2NR arguments); read new cards by default; newly cross-apply across flows; go for too many things.
STRUCTURE: overview (why the aff wins even if the neg wins X) → the 2NR's main position → remaining 2NR arguments → case impacts and weighing → ballot sentence.`,
};
