/**
 * What a camp file of each kind contains (Phase E), for planning a file the way a lab leader would: every
 * speech's material, not just the 1NC or 1AC. Ported from v1's builder (CAMP_FILE_KNOWLEDGE) and corrected
 * with the conventions measured on real camp files (docs/research/analytics-and-blocks.md §3, §6).
 */

export const FILE_KINDS = ["aff", "da", "cp", "k", "t", "theory", "case_neg", "answers"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  aff: "Affirmative",
  da: "Disadvantage",
  cp: "Counterplan",
  k: "Kritik",
  t: "Topicality",
  theory: "Theory",
  case_neg: "Case negative",
  answers: "Answers",
};

/** Whose file it is: an answers file says; the rest follow from their kind. */
export function sideOf(input: { kind: FileKind; side?: "aff" | "neg" }): "aff" | "neg" {
  if (input.kind === "answers") return input.side ?? "aff";
  return input.kind === "aff" ? "aff" : "neg";
}

/** Sections per kind, in reading order. Each is one H2 heading ("[speech] — [what]") holding H3 blocks. */
export const FILE_KNOWLEDGE: Record<FileKind, string> = {
  aff: `AFFIRMATIVE FILE (the whole aff, every speech):
- 1AC: plan text (text item), inherency, then each advantage as uniqueness → link/internal link → impact, then solvency (mechanism and sufficiency). Two advantages at most unless asked.
- 2AC — AT: [each likely neg position] (the DA, CP, K, T, and theory the neg will read against this aff): blocks of 3–8 numbered answers, offense first (link turns paired with non-unique; never a link turn and an impact turn on the same DA), perms first against CPs and Ks, "we meet" and a counter-interpretation first against T. 78% of real 2AC blocks start with an analytic; about 3 of 5 items are analytics.
- 2AC — add-ons and extensions: extra impact or solvency cards the 2AC can add.
- 1AR — AT: [the block's likely answers]: short blocks (an analytic or two plus at most one card each), right after the 2AC block they extend.
- 2AR: an overview analytic (story, impact comparison, "even if" framing), no new cards.`,
  da: `DISADVANTAGE FILE:
- 1NC — [DA]: the shell: uniqueness, link, internal link, impact (one card each; a second link for a specific aff if useful).
- 2NC — [DA]: an overview analytic (story + impact comparison), then extension blocks: uniqueness (incl. brink), links (by aff or mechanism), internal link, impact (magnitude, probability, timeframe; outweighs the aff).
- 2NC — AT: [each likely 2AC answer]: non-unique, no link, link turn, impact turn, no internal link, case outweighs, and theory against the DA if relevant. Answer the turns first.
- 2NR: a short overview analytic and "even if" comparison against the aff's best case impact.`,
  cp: `COUNTERPLAN FILE:
- 1NC — [CP]: the CP text (text item), solvency (the CP solves the aff's advantages), and the net benefit named (a DA it avoids).
- 2NC — [CP]: an overview analytic, extended solvency (mechanism, precedent), competition (why the aff can't do both).
- 2NC — AT: Permutation (perm do both, perm do the CP, and others; lead with the perm answers), AT: solvency deficits, AT: theory (conditionality, the CP's specific type), AT: links to the net benefit.
- 2NR: how the CP plus net benefit outweighs any solvency deficit; judge-kick instruction if the status quo is a fallback.`,
  k: `KRITIK FILE:
- 1NC — [K]: link (specific to the topic or aff), impact, alternative text (text item), alt solvency, and framework or role of the ballot.
- 2NC — [K]: an overview analytic (story, impact, framework), then link blocks by aff or mechanism (split finely, not one generic link block), impact, alt, framework.
- 2NC — AT: Permutation, AT: framework (they must weigh the plan), AT: cede the political, AT: alt fails, AT: impact turns, AT: no link. K analytics run longer (median 20 words) and refer to the opponent's arguments directly.
- 2NR: overview and "even if" framing; how the alt or framework wins without the perm.`,
  t: `TOPICALITY FILE:
- 1NC — T [word]: interpretation (a definition card), violation (text item), standards (limits, ground, predictability; analytics), voters (analytic).
- 2NC — T [word]: an overview analytic, then extension blocks for each standard (limits and ground cards), and case lists (what their interpretation allows).
- 2NC — AT: We meet, AT: Counter-interpretation, AT: Reasonability, AT: Overlimiting. T analytics are longer (median 20 words) and use numbered labels.
- 2NR: all-in on T when going for it: overview, standards, voter, "even if" against reasonability.`,
  theory: `THEORY FILE:
- 2AC / 1NC — [violation] shell: interpretation (text item), violation, 4–7 numbered standards (each a bold label, a dash and one sentence), and the voter. About 30 seconds as a short shell.
- Extensions: each standard developed, with cards only where real evidence exists (e.g. on education or research burdens).
- AT: [their counter-interpretation, reasonability, "no abuse"] blocks.
- Rebuttal: the voter and why it outweighs.`,
  answers: `ANSWERS FILE (our blocks against one argument the other side reads, for every speech we answer it in):
- When we are the aff answering a neg position: 2AC — AT: [position] (3–8 numbered answers; offense first — a link turn or an impact turn, never both; perms first against a CP or K; "we meet" and a counter-interpretation first against T; then defense), 1AR — AT: [what their block will extend] (2–4 items, at most one card each), and a 2AR framing analytic.
- When we are the neg answering an aff argument (an advantage, the plan's solvency, or their likely 2AC answers): 1NC — [argument] case answers (non-unique, no internal link, impact defense, alt causes, turns), 2NC/1NR extensions of the best ones, AT: [their likely answers], and a 2NR framing analytic.
- Tailor every answer to the specific argument named; generic answers only where nothing specific exists.`,
  case_neg: `CASE NEGATIVE FILE (against one affirmative):
- 1NC — Case: answers to each advantage (non-unique, no internal link, impact defense, alt causes, case turns), and solvency deficits. Best answers first.
- 2NC/1NR — Case: extensions of the strongest answers, and turns developed with impacts.
- AT: [the aff's likely 2AC answers to those case arguments].
- 2NR: the case arguments to go for and how they decide the round.`,
};

export const FILE_RULES = `PLANNING RULES
1. One-sided: plan only our side's material. "AT:" blocks are our answers to what the other side will say.
2. Layout like real camp files: H2 section headings name the speech and the position ("1NC — Capital Flight DA", "2AC — AT: States CP"); H3 blocks inside them ("Uniqueness", "AT: Link Turn"). Within a position, the 1NC shell comes before its 2NC/1NR blocks, and a 2AC block before its 1AR block. "AT:" is the prefix for answer blocks.
3. Items: a card item is a claim that real evidence must make, one sentence, as its tag would read. Never write evidence, quotes, authors, statistics, or dates: the card is found and cut from a real source later, or reported missing. In "search", say what kind of source would make it (experts, institutions, key terms, how recent).
4. Analytics are the debater's own reasoning (never attributed to an author): a 1–4 word label, a dash, one or two sentences aimed at the other side's warrant — claim, "because", "so". 8–45 words. Number answers in a block ("1.", "2."). Put perms first, offense before defense, T first.
5. Text items (plan, CP, alt, interpretation) are one precise sentence each.
6. Blocks are short: answer blocks hold 2–4 items; 2AC blocks 3–8; 1AR blocks 2–4 with at most one card. Every block should have at least one card or analytic.
7. Card budget: plan no more cards than asked; prefer analytics where a card likely doesn't exist (theory, perms, "no link" logic).
8. Keep everything appropriate for high-school students.`;
