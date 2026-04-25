/**
 * Judge paradigm preset library. Used by the Judge Adaptation feature to give
 * Claude precise context about how to slant a speech / strategy choice for a
 * specific judge archetype.
 *
 * Each preset bundles: identity, what they reward, what they punish, common
 * 2NR/2AR collapses they prefer, and a calibrated `tech` score (0 = pure lay,
 * 100 = pure tech-over-truth circuit veteran).
 */

export interface JudgeParadigm {
  id: string;
  name: string;
  shortName: string;
  emoji: string;
  /** 0-100, higher = more circuit/tech */
  tech: number;
  /** 0-100, higher = more receptive to K/critical args */
  critical: number;
  /** 0-100, higher = more receptive to theory */
  theoryFriendly: number;
  /** 0-100, higher = expects faster speed */
  speedTolerance: number;
  description: string;
  loves: string[];
  hates: string[];
  collapseAdvice: string;
  affAdvice: string;
  negAdvice: string;
  paradigmText: string;
}

export const JUDGE_PARADIGMS: JudgeParadigm[] = [
  {
    id: "circuit-policy",
    name: "Circuit Policymaker",
    shortName: "Policy",
    emoji: "⚖️",
    tech: 80,
    critical: 35,
    theoryFriendly: 55,
    speedTolerance: 95,
    description:
      "Career-coached judge who treats debate as policy simulation. Default circuit go-to. Loves clean impact calc, link debate, and crisp execution.",
    loves: [
      "Crisp impact calculus with magnitude/probability/timeframe",
      "Clear link debate — specific, not generic",
      "Evidence quality and qualifications",
      "Strategic 2NR collapse with judge instruction",
      "Line-by-line organization in rebuttals",
    ],
    hates: [
      "K affs that reject the resolution",
      "Theory blips with no standards",
      "Tag-line extensions without warrants",
      "Vague 'we outweigh on magnitude' without comparison",
      "Reading 5 off-case and going for all of them",
    ],
    collapseAdvice:
      "CP + DA is gold. DA + case (status quo) works when their solvency is shaky. Avoid going for theory unless aff seriously abused.",
    affAdvice:
      "Big-stick advantages with extinction-level impacts perform best. Have specific link defense to politics DAs. Read perm do both AND solvency deficits against every CP.",
    negAdvice:
      "1NC: 4 off-case + case attacks. Block: split DA + CP, kick weakest. 2NR: CP + DA + case turn. Always close with impact comparison.",
    paradigmText:
      "I'm a former 2N who coached at the circuit level. I evaluate the round as if I'm deciding whether the federal government should adopt the plan. Tech > truth, but truth wins close debates. Speed is fine; clarity is critical for the 2NR. I'll vote on theory if it's executed (interp + violation + standards + voters), but I default to reject the argument unless told otherwise. Condo: I think 2 conditional positions is fine, 3+ is contestable. I prefer specific links to generics. I'll vote for K on neg if it's executed; I'm skeptical of K affs.",
  },
  {
    id: "tab",
    name: "Tabula Rasa",
    shortName: "Tab",
    emoji: "📋",
    tech: 90,
    critical: 50,
    theoryFriendly: 70,
    speedTolerance: 95,
    description:
      "Will evaluate whatever framework you tell them to. Demands judge instruction. Pure tech-over-truth flow execution.",
    loves: [
      "Explicit judge instruction — 'if X then vote Y'",
      "Technical concessions exploited fully",
      "Framing arguments and order of operations",
      "Clear weighing claims at top of speech",
    ],
    hates: [
      "Assertions without warrants",
      "'ROTB is X' without justifying why",
      "Implicit framework — make it explicit",
      "Failing to flag concessions",
    ],
    collapseAdvice:
      "Make the 2NR a flowchart for the judge. 'Step 1: framework — vote on X. Step 2: under X, we win because Y.' Tab judges want explicit decision rules.",
    affAdvice:
      "Tell the judge how to vote. 'The role of the ballot in this round is to evaluate whether the plan is a good idea. Under that ROTB, we win on advantage 1.'",
    negAdvice:
      "Pre-empt the 2AR's framing. 'They will say X — but our argument is prior because Y.' Tab judges reward winning the framing battle.",
    paradigmText:
      "I evaluate the round however you tell me to. Tabula rasa means I have no defaults — if you don't tell me how to weigh, I'll do my best to flow it but you may not like the result. Tech > truth absolutely. I'll vote for any argument with a warrant; I won't vote for assertions. Speed is fine. Theory is fine. K is fine. K affs are fine. Just tell me what to do with each layer.",
  },
  {
    id: "k-leaning",
    name: "K-Leaning Critical",
    shortName: "K",
    emoji: "📚",
    tech: 75,
    critical: 95,
    theoryFriendly: 60,
    speedTolerance: 85,
    description:
      "Critical literature scholar. Loves K affs, deep K extensions, structural impact framing. Skeptical of framework that excludes Ks.",
    loves: [
      "Deep engagement with critical literature",
      "Specific links rather than 'K of cap = link to plan'",
      "Alt solvency mechanisms and historical examples",
      "K affs and performance debate",
      "Structural and ontological impact framing",
    ],
    hates: [
      "Framework that says 'K is illegitimate'",
      "Tag-line K answers without engagement",
      "'Util good' as a complete framework defense",
      "Cap good cards from Ayn Rand-tier sources",
    ],
    collapseAdvice:
      "K alone is viable. Spend equal time on framework, links, alt, and impact framing. Don't kick the alt — it's the offensive component.",
    affAdvice:
      "Don't try to win on framework alone. Engage the K's literature. Perm do both with detailed solvency. Have impact turn options.",
    negAdvice:
      "K is your best weapon. Specific links to the plan beat generics. Read alt evidence — most teams forget the alt has solvency cards.",
    paradigmText:
      "I read critical theory in graduate school. I'm comfortable with most K literature bases (cap, set col, afro-pess, fem, queer, decolonial). I prefer specific links over generic 'K of [topic area]' links. I'll vote on framework if it's executed, but I won't vote for 'K is illegitimate as a category of argument.' I think K affs are legitimate — I'll vote for both T-USFG and the K aff depending on execution. I default to evaluating the K's epistemological/ontological prior question framing.",
  },
  {
    id: "lay",
    name: "Lay / Parent Judge",
    shortName: "Lay",
    emoji: "👤",
    tech: 15,
    critical: 5,
    theoryFriendly: 5,
    speedTolerance: 25,
    description:
      "Parent judge or untrained community judge. Wants persuasive speaking, common-sense impacts, no jargon.",
    loves: [
      "Slow, clear delivery",
      "Eye contact and persuasive tone",
      "Concrete real-world impacts (jobs, lives)",
      "Narrative framing — tell a story",
      "Big-picture comparisons in plain English",
    ],
    hates: [
      "Spreading at any speed above conversational",
      "Theory of any kind",
      "K arguments — will refuse to evaluate",
      "Debate jargon (perm, fiat, link turn, etc.)",
      "Multiple off-case positions in 1NC",
    ],
    collapseAdvice:
      "One advantage vs. one disadvantage. Make it a clean policy debate. The 2NR/2AR should be 5 minutes of crystallization, not extensions.",
    affAdvice:
      "READ AT 200WPM MAX. Translate every term. 'Plan helps the economy by adding 500,000 jobs.' Don't say 'fiat,' don't say 'topical.' If the neg reads K, dismiss it as 'word games' and re-emphasize substance.",
    negAdvice:
      "Don't read K. Don't read theory. Pick ONE DA and ONE CP. Spend the 2NR comparing impacts in plain language. 'Their plan helps people, but ours helps more people. Vote neg.'",
    paradigmText:
      "I'm a parent who hasn't done debate. Speak clearly and slowly. Tell me why your side is right in plain English. Don't use specialized terminology — assume I don't know it. I'll vote for whoever convinces me the round comes out in their favor based on real-world impact.",
  },
  {
    id: "tech-flow",
    name: "Tech-Over-Truth Flow",
    shortName: "Tech",
    emoji: "🤖",
    tech: 100,
    critical: 60,
    theoryFriendly: 85,
    speedTolerance: 100,
    description:
      "Pure flow judge. Implausible arguments win if conceded. Drops are death sentences. Will vote for tricks if technically conceded.",
    loves: [
      "Concessions exploited ruthlessly",
      "Technical line-by-line execution",
      "Implications drawn from drops",
      "Tricks and procedural offense",
    ],
    hates: [
      "Hand-waving 'this argument is absurd'",
      "Failing to extend warrants",
      "Sloppy 1AR that drops args",
      "Embedded clash without flowing it",
    ],
    collapseAdvice:
      "Whatever you flowed best. Don't pivot to a 'better' argument if you have technical concessions on a worse one — exploit the drop.",
    affAdvice:
      "Don't drop anything. Even silly args need 1-line answers. Tech judges punish 1AR coverage gaps brutally.",
    negAdvice:
      "Read everything. Force the 1AR to make hard choices. Kick what gets answered, extend what doesn't.",
    paradigmText:
      "Tech > truth always. I will vote for any argument that has a warrant and is conceded. Spread is fine. Theory is fine. Tricks are fine if you justify them. I do not intervene against arguments based on plausibility. If you drop it, you lose it. If you concede a warrant, you concede the impact.",
  },
  {
    id: "novice-friendly",
    name: "Novice-Friendly",
    shortName: "Novice",
    emoji: "🌱",
    tech: 45,
    critical: 25,
    theoryFriendly: 30,
    speedTolerance: 55,
    description:
      "Coaches novices, knows debate structure but values pedagogy. Penalizes obscure tech.",
    loves: [
      "Clear case construction",
      "Substantive engagement over tricks",
      "Learning-friendly speaking pace",
      "Effort to teach the round (e.g., explaining cards)",
    ],
    hates: [
      "Spread above 250wpm",
      "Theory blips designed to confuse",
      "K abuse against teams that don't have answers",
      "Speed kills (especially in rebuttals)",
    ],
    collapseAdvice:
      "Substantive 2NR. CP + DA, both well-extended, with clear impact calc.",
    affAdvice:
      "Read a normal aff with two advantages. Speed up the body, slow the rebuttals. Be respectful in CX.",
    negAdvice:
      "1NC: T (only if violation is real) + CP + DA + case. Avoid K if novices likely. 2NR: CP + DA, clear and clean.",
    paradigmText:
      "I coach novices. I know how debate works but I want rounds to be pedagogically valuable. Slow down for tags and rebuttals. Don't read 8 off-case. Be respectful in CX. I'll vote on T and theory if executed but I'm skeptical of using them as bludgeons against less-experienced teams.",
  },
  {
    id: "trad-traditional",
    name: "Traditional / Stock-Issues",
    shortName: "Trad",
    emoji: "📜",
    tech: 30,
    critical: 10,
    theoryFriendly: 25,
    speedTolerance: 50,
    description:
      "Old-school debate judge who weighs the round on traditional stock issues: Topicality, Inherency, Significance, Solvency, Disadvantages.",
    loves: [
      "Classic stock-issues framework",
      "Traditional case structure",
      "Clear evidence with named authors",
      "Disad with clear link/impact chain",
    ],
    hates: [
      "K arguments and K affs",
      "Performance debate",
      "Excessive theory",
      "Spreading without articulation",
    ],
    collapseAdvice:
      "Win one stock issue. Either prove the aff is non-topical, lacks inherency, lacks significance, or has insufficient solvency, OR win the DA outweighs.",
    affAdvice:
      "Solid case with strong inherency, significance, and solvency. Make the plan text precise. Be clear about the harm in the status quo.",
    negAdvice:
      "Stock-issues: T, inherency, harms, solvency, DA. The 2NR should crystallize on whichever stock issue is most won.",
    paradigmText:
      "I'm a traditional policy judge. I evaluate the round on the stock issues: topicality, inherency, significance, solvency, and disadvantages. I don't vote on the K. I want clear cases with clear evidence. Speak intelligibly — if I can't understand you, you can't be persuasive.",
  },
];

export function getJudgeById(id: string): JudgeParadigm | undefined {
  return JUDGE_PARADIGMS.find((p) => p.id === id);
}

export function describeJudgeForPrompt(judge: JudgeParadigm): string {
  return `JUDGE PROFILE: ${judge.name}

Tech-over-truth: ${judge.tech}/100. Critical receptivity: ${judge.critical}/100. Theory friendliness: ${judge.theoryFriendly}/100. Speed tolerance: ${judge.speedTolerance}/100.

DESCRIPTION: ${judge.description}

PARADIGM TEXT: ${judge.paradigmText}

WHAT THEY REWARD:
${judge.loves.map((l) => `- ${l}`).join("\n")}

WHAT THEY PUNISH:
${judge.hates.map((h) => `- ${h}`).join("\n")}

COLLAPSE STRATEGY: ${judge.collapseAdvice}

AFF NOTES: ${judge.affAdvice}
NEG NOTES: ${judge.negAdvice}

Your job is to advise as if speaking before this exact judge. Calibrate every recommendation to their preferences.`;
}

export function recommendCollapse(
  judgeId: string,
  side: "aff" | "neg",
  hasOffCase: { da?: boolean; cp?: boolean; k?: boolean; t?: boolean; theory?: boolean }
): string {
  const judge = getJudgeById(judgeId);
  if (!judge) return "Unable to load judge paradigm.";

  if (side === "neg") {
    if (judge.id === "lay" || judge.id === "trad-traditional") {
      return hasOffCase.da && hasOffCase.cp
        ? "CP + DA, kept clean and substantive."
        : "Status quo + DA, narrate the harm.";
    }
    if (judge.id === "k-leaning" && hasOffCase.k) {
      return "Go for the K. Spend equal time on framework, links, alt, and impacts.";
    }
    if (judge.id === "tech-flow") {
      return "Whatever has the most concessions on the flow. Don't switch off technical leverage.";
    }
    if (hasOffCase.cp && hasOffCase.da) return "CP + DA — gold standard collapse.";
    if (hasOffCase.k) return "K alone — invest the full 5 minutes.";
    if (hasOffCase.da) return "DA + case turns / case defense.";
    if (hasOffCase.t) return "T — only if standards are extended.";
    return "Status quo + case defense.";
  }

  // aff
  if (judge.id === "lay" || judge.id === "trad-traditional") {
    return "Extend the strongest advantage with clear impact framing. Answer the DA cleanly. Avoid theory.";
  }
  if (judge.id === "k-leaning") {
    return "If they go K: framework + perm + link defense + case outweighs. If they go policy: standard 2AR collapse.";
  }
  return "Pre-empt the 2NR's collapse based on the block. If CP + DA: solvency deficit + perm + DA defense.";
}
