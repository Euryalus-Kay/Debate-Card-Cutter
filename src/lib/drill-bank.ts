/**
 * Pre-built drill bank — works without an AI call so users can practice the
 * fundamentals immediately.
 */

import type { DrillType } from "./anthropic-coach";

export interface DrillBankEntry {
  id: string;
  type: DrillType;
  title: string;
  blurb: string;
  setup: string;
  prompt: string;
  successCriteria: string[];
  timeSeconds: number;
  difficulty: "novice" | "jv" | "varsity" | "circuit";
  followUp?: string;
}

export const DRILL_BANK: DrillBankEntry[] = [
  /* ---------- Spreading drills ---------- */
  {
    id: "spread-tongue-twister",
    type: "spreading",
    title: "Tongue twisters at speed",
    blurb: "Foundation drill for clarity at speed. Done daily by every TOC qualifier.",
    setup: "Pick 3 tongue twisters. Have a partner or your phone time you.",
    prompt:
      "Read the following at MAX speed: 'She sells seashells by the seashore. The shells she sells are surely seashells. So if she sells shells on the seashore, I'm sure she sells seashore shells.' Then: 'Red leather, yellow leather, red leather, yellow leather' x10. Then: 'Unique New York' x10.",
    successCriteria: [
      "Every consonant is articulated — no swallowed endings",
      "Pace is consistent — no slow down on hard words",
      "You can repeat the sequence 5 times without pausing",
    ],
    timeSeconds: 180,
    difficulty: "novice",
    followUp: "Move to article reading at the same articulation level.",
  },
  {
    id: "spread-pencil-bite",
    type: "spreading",
    title: "Pencil between teeth",
    blurb: "Forces over-articulation. Removes mumbling at speed.",
    setup: "Place a pencil horizontally between your teeth, biting it lightly.",
    prompt:
      "Read your 1AC plan text 5 times, then your inherency contention twice. Articulate every syllable. Remove the pencil and read again — your normal speed will sound radically clearer.",
    successCriteria: [
      "Every word is intelligible despite the pencil",
      "After removing the pencil, words feel cleaner and fuller",
      "Pace doesn't drop while biting the pencil",
    ],
    timeSeconds: 240,
    difficulty: "novice",
  },
  {
    id: "spread-overspeed",
    type: "spreading",
    title: "Overspeed reps",
    blurb: "Read at 110% of competition speed to make competition speed feel slow.",
    setup: "Set a metronome or rhythm at 30 wpm above your target.",
    prompt:
      "Read a 4-paragraph card 3 times in a row at the metronome speed. Take 20 seconds between reads. The third rep should feel as smooth as the first.",
    successCriteria: [
      "Maintain articulation at the elevated speed",
      "No major stumbles in the third rep",
      "Heart rate elevates — this is cardio for your speech delivery",
    ],
    timeSeconds: 300,
    difficulty: "varsity",
  },
  /* ---------- CX drills ---------- */
  {
    id: "cx-yes-no",
    type: "cx-attack",
    title: "Force binary answers",
    blurb: "Practice pinning opponents to yes/no answers in CX.",
    setup: "You'll get an aff thesis. Generate 6 yes/no questions that progressively box them in.",
    prompt:
      "Aff: Federal investment in offshore wind generates millions of jobs and accelerates the energy transition. Your task: ask 6 questions, each requiring yes/no, that build toward a 7th question that traps them.",
    successCriteria: [
      "All 6 questions are binary (no escape clause)",
      "Question 7 generates a damaging concession or contradiction",
      "Total CX simulated: under 90 seconds",
    ],
    timeSeconds: 180,
    difficulty: "varsity",
  },
  {
    id: "cx-defense-pivot",
    type: "cx-defense",
    title: "Pivoting on a tough question",
    blurb: "Reframe questions you can't answer directly.",
    setup: "You'll get a hostile question about your aff. Practice pivoting without conceding.",
    prompt:
      "Question: 'You said the plan creates 500,000 jobs in your Stevens evidence — but your Hansen card says only 300,000. Which is it?' Don't say 'I don't know.' Pivot.",
    successCriteria: [
      "Reframe acknowledges the question without concession",
      "Redirects to the evidence's strongest claim",
      "Done in under 15 seconds",
    ],
    timeSeconds: 120,
    difficulty: "varsity",
  },
  /* ---------- Rebuttal drills ---------- */
  {
    id: "rebuttal-2nr-redo",
    type: "rebuttal-redo",
    title: "2NR collapse rep",
    blurb: "Practice the most strategic speech: the 2NR collapse.",
    setup:
      "Pick an old round (or a hypothetical). Pre-decide what you're going for. You have 5 minutes.",
    prompt:
      "Going for: Politics DA + case defense. Set up: aff is a federal copyright reform aff. Aff read perm do both, no link, link turn (plan helps Biden's bipartisan legacy), and impact defense (Biden won't lose midterms anyway). Your 2NR.",
    successCriteria: [
      "Open with 1-sentence judge instruction (the role of the ballot moment)",
      "Spend ~3 min on DA, ~1.5 min on case, ~30 sec impact calc",
      "Close with explicit 'vote neg because…' weighing",
    ],
    timeSeconds: 300,
    difficulty: "circuit",
  },
  {
    id: "rebuttal-1ar-coverage",
    type: "rebuttal-redo",
    title: "1AR coverage rep",
    blurb: "Practice the hardest speech in policy debate.",
    setup: "Pretend you got a 13-minute neg block. You have 5 minutes.",
    prompt:
      "Block went: 2NC = K (deep extension on framework + links + impacts + alt). 1NR = T-substantial (deep extension on standards) + case defense (3 cards). Your 1AR.",
    successCriteria: [
      "Group all K links into 1 grouped response with warrant",
      "Cover T in under 60 seconds with counter-interp + 1 standard",
      "Extend 1 advantage with comparison",
      "Don't drop anything — make every flow",
    ],
    timeSeconds: 300,
    difficulty: "circuit",
  },
  /* ---------- Impact calc drills ---------- */
  {
    id: "impact-extinction-vs-structural",
    type: "impact-calc",
    title: "Extinction vs. structural impacts",
    blurb: "The classic K-vs-policy impact debate.",
    setup: "1 minute. Compare these impacts as if speaking in 2NR/2AR.",
    prompt:
      "Aff: heg good — extinction via Russian/Chinese expansion. Neg: capitalism K — structural violence kills 18M annually, more than any war. Compare with explicit weighing.",
    successCriteria: [
      "Use at least 3 of the 5 axes",
      "Include 1 'even if' layer",
      "End with explicit judge instruction",
    ],
    timeSeconds: 60,
    difficulty: "varsity",
  },
  {
    id: "impact-da-vs-adv",
    type: "impact-calc",
    title: "Politics DA vs. heg advantage",
    blurb: "Most common 2NR weighing scenario.",
    setup: "1 minute. You're 2NR going for politics + case defense.",
    prompt:
      "DA: Biden midterm losses → GOP takes Congress → no Ukraine aid → Russia wins → nuclear escalation. Adv: aff prevents great-power war via deterrence boost. Weigh in 2NR style.",
    successCriteria: [
      "Address probability AND timeframe explicitly",
      "Include link strength comparison",
      "End with 'even if' that pre-empts 2AR",
    ],
    timeSeconds: 60,
    difficulty: "varsity",
  },
  /* ---------- Tag extension drills ---------- */
  {
    id: "tag-extension-15",
    type: "tag-extension",
    title: "15-second tag extension",
    blurb: "Compress a card extension to 15 seconds without losing the warrant.",
    setup: "Take any card you've cut. Time yourself.",
    prompt:
      "Read tag → say 'and' → state cite → 'this evidence indicates' → 1-sentence warrant → 'which means' → 1-sentence implication. 15 seconds total.",
    successCriteria: [
      "Tag is delivered cleanly, not rushed",
      "Warrant is in the debater's voice (not from the card)",
      "Implication links to the round (not generic)",
    ],
    timeSeconds: 60,
    difficulty: "jv",
  },
  /* ---------- Cross-app drills ---------- */
  {
    id: "cross-app-3-spots",
    type: "cross-app",
    title: "3 cross-applications in 90 seconds",
    blurb: "Train your eye for cross-applications that other teams miss.",
    setup: "Read the prompt's flow snapshot. Generate 3 cross-applications.",
    prompt:
      "Aff has: heg good ev (Walt 22 — US presence prevents great-power war). Neg has: politics DA (link: any aff costs PC). Find 3 cross-applications between aff and neg arguments.",
    successCriteria: [
      "All 3 cross-apps have a clear warrant for why they apply",
      "At least 1 is non-obvious",
      "Done in under 90 seconds",
    ],
    timeSeconds: 90,
    difficulty: "varsity",
  },
  /* ---------- Block extempore ---------- */
  {
    id: "block-extempore-condo",
    type: "blocks-extempore",
    title: "Condo bad in 60 seconds",
    blurb: "Build a clean theory shell on the fly.",
    setup: "60 seconds. Construct a complete condo bad shell.",
    prompt:
      "Argue: condo bad. Standard format: interp / violation / standards / voters. Make it actually winnable, not blippy.",
    successCriteria: [
      "Interp is precise (e.g., 'one conditional advocacy')",
      "At least 2 standards with warrants",
      "Voter language ('reject the team') with reason",
    ],
    timeSeconds: 60,
    difficulty: "varsity",
  },
];

export function findDrills(filter: {
  type?: DrillType;
  difficulty?: DrillBankEntry["difficulty"];
  maxSeconds?: number;
}): DrillBankEntry[] {
  return DRILL_BANK.filter((d) => {
    if (filter.type && d.type !== filter.type) return false;
    if (filter.difficulty && d.difficulty !== filter.difficulty) return false;
    if (filter.maxSeconds && d.timeSeconds > filter.maxSeconds) return false;
    return true;
  });
}
