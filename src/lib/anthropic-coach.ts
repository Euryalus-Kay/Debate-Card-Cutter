/**
 * Specialized Anthropic-backed coaching helpers — used by the Coach, Block
 * Builder, Cross-X Simulator, Impact Calc, and Judge Adaptation features.
 *
 * Kept in a separate file from the original anthropic.ts so these new helpers
 * can be evolved without risk of breaking existing card-cutting flows.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  ARGUMENT_ARCHETYPES,
  CARD_CUTTING_FUNDAMENTALS,
  COLLAPSING_AND_KICKING,
  CROSS_EX_FUNDAMENTALS,
  FLOW_CONVENTIONS,
  IMPACT_CALCULUS,
  SPEECH_FUNDAMENTALS,
  STRATEGIC_PRINCIPLES,
} from "./debate-knowledge";
import { describeJudgeForPrompt, getJudgeById } from "./judge-paradigms";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const FOUNDATION_SYSTEM = `You are an elite high school policy debate coach. You have coached at Michigan 7-Week, Northwestern, Harvard, and the DDI. Your students have gone deep at TOC, NDCA, NSDA Nationals, and major bid tournaments.

You speak directly, with the precision of a coach in lab. You don't hedge. You don't pad responses. You give the strategic reason behind every recommendation.

${SPEECH_FUNDAMENTALS}

${ARGUMENT_ARCHETYPES}

${IMPACT_CALCULUS}

${CARD_CUTTING_FUNDAMENTALS}

${CROSS_EX_FUNDAMENTALS}

${FLOW_CONVENTIONS}

${COLLAPSING_AND_KICKING}

${STRATEGIC_PRINCIPLES}`;

async function streamText(params: {
  model?: string;
  max_tokens?: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const stream = client.messages.stream({
    model: params.model || "claude-opus-4-20250514",
    max_tokens: params.max_tokens || 8000,
    system: params.system,
    messages: params.messages,
  });
  const final = await stream.finalMessage();
  const block = final.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

function extractJson<T>(text: string): T {
  const match = text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error("Failed to extract JSON from response");
  return JSON.parse(match[0]) as T;
}

/* ---------------- Block / Frontline Builder ---------------- */

export interface FrontlineBlock {
  title: string;
  argType: "da" | "cp" | "k" | "t" | "theory" | "case";
  context: string;
  responses: Array<{
    label: string;
    type: "card_query" | "analytic";
    content: string;
    purpose: string;
    timeSeconds: number;
    evenIfLayer?: string;
  }>;
  cascadeOrder: string[];
  judgeNotes: string;
}

export async function buildFrontline(
  side: "aff" | "neg",
  argumentDescription: string,
  argType: "da" | "cp" | "k" | "t" | "theory" | "case",
  judgeId: string | null,
  context: string
): Promise<FrontlineBlock> {
  const judge = judgeId ? getJudgeById(judgeId) : null;
  const judgeContext = judge ? describeJudgeForPrompt(judge) : "Default circuit policymaker.";

  const text = await streamText({
    model: "claude-opus-4-20250514",
    max_tokens: 12000,
    system: `${FOUNDATION_SYSTEM}

You are designing a FRONTLINE BLOCK — a pre-prepared set of responses to a specific argument. Frontlines are the workhorse of competitive prep.

${judgeContext}

A great frontline:
- Has 6-12 distinct responses
- Mixes evidence (cards) and analytics (debater-written warrants)
- Is layered: defense, offense, perms, theory, even-if's
- Is ordered by strategic importance (most-likely-to-win first)
- Includes "even if" layering to pre-empt opponent answers
- Is calibrated to the judge above

NEVER write blippy one-liners. Every analytic should be 3-6 sentences with claim → warrant → application.`,
    messages: [
      {
        role: "user",
        content: `Build a frontline for the ${side === "aff" ? "AFFIRMATIVE" : "NEGATIVE"} answering this argument:

${argumentDescription}

Argument type: ${argType.toUpperCase()}
${context ? `Round context: ${context}\n` : ""}

Return ONLY a JSON object:
{
  "title": "frontline name (e.g., 'AT: Spending DA' or 'A2: States CP')",
  "argType": "${argType}",
  "context": "1-2 sentence strategic framing",
  "responses": [
    {
      "label": "1 — short label",
      "type": "card_query" | "analytic",
      "content": "search query (if card) OR full analytic text (if analytic)",
      "purpose": "why this response — one sentence",
      "timeSeconds": estimated read time in seconds,
      "evenIfLayer": "optional — 'even if they win X, this still wins because Y'"
    }
  ],
  "cascadeOrder": ["ordered list of response labels — the order you'd read them in a 2AC/2NR"],
  "judgeNotes": "1-2 sentences on how to deliver this for this judge"
}`,
      },
    ],
  });

  return extractJson<FrontlineBlock>(text);
}

/* ---------------- Cross-X Simulator ---------------- */

export interface CXSimulationTurn {
  questioner: string;
  answerer: string;
  followUp?: string;
}

export interface CXSimulation {
  turns: CXSimulationTurn[];
  takeaways: string[];
  trapsTriggered: string[];
}

export async function simulateCrossX(
  yourSide: "aff" | "neg",
  argumentText: string,
  judgeId: string | null,
  rounds = 4
): Promise<CXSimulation> {
  const judge = judgeId ? getJudgeById(judgeId) : null;
  const text = await streamText({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `${FOUNDATION_SYSTEM}

You are simulating a cross-examination period. You will play BOTH sides — generating a realistic exchange where a top circuit debater (acting as the questioner) cross-examines the argument provided.

${judge ? describeJudgeForPrompt(judge) : ""}

Each turn:
- Question must be PURPOSEFUL (clarify, concede, contradict, or set up).
- Answer must be REALISTIC — what an experienced debater would actually say.
- Mark "trapsTriggered" when a question successfully extracts a damaging concession.

Generate ${rounds} question/answer pairs.`,
    messages: [
      {
        role: "user",
        content: `Simulate a cross-examination. The user is on the ${yourSide.toUpperCase()} side and will receive the simulation as practice for handling the opposing CX.

Argument under cross-examination:
${argumentText}

Return ONLY JSON:
{
  "turns": [
    {"questioner": "the question", "answerer": "the answer", "followUp": "optional follow-up"}
  ],
  "takeaways": ["lesson 1", "lesson 2"],
  "trapsTriggered": ["concession 1 obtained: [text]"]
}`,
      },
    ],
  });
  return extractJson<CXSimulation>(text);
}

/* ---------------- Impact Calculus Generator ---------------- */

export interface ImpactCalcOutput {
  overview: string;
  comparisons: Array<{
    axis: "magnitude" | "probability" | "timeframe" | "reversibility" | "scope";
    winner: "aff" | "neg";
    explanation: string;
    judgeInstruction: string;
  }>;
  evenIfLayers: string[];
  twoNRClose: string;
  twoARClose: string;
}

export async function generateImpactCalc(
  affImpact: string,
  negImpact: string,
  perspective: "aff" | "neg",
  judgeId: string | null
): Promise<ImpactCalcOutput> {
  const judge = judgeId ? getJudgeById(judgeId) : null;
  const text = await streamText({
    model: "claude-opus-4-20250514",
    max_tokens: 6000,
    system: `${FOUNDATION_SYSTEM}

You are writing the IMPACT CALCULUS section that closes the 2NR or 2AR. This is the most important paragraph in the round — judges decide based on this.

${judge ? describeJudgeForPrompt(judge) : ""}

Rules:
- Every comparison must be COMPARATIVE (not descriptive).
- Use the 5 axes: magnitude, probability, timeframe, reversibility, scope.
- Always include 2-3 "even if" layers.
- End with a CLOSE — the judge instruction sentence that wraps up the round.`,
    messages: [
      {
        role: "user",
        content: `Generate impact calculus for the ${perspective.toUpperCase()}.

Affirmative impact: ${affImpact}
Negative impact: ${negImpact}

Return ONLY JSON:
{
  "overview": "2-sentence framing of the impact debate",
  "comparisons": [
    {
      "axis": "magnitude",
      "winner": "${perspective}",
      "explanation": "3-5 sentences with warrants",
      "judgeInstruction": "1 sentence: tell the judge what to do with this"
    }
  ],
  "evenIfLayers": ["even if X, we still win Y because Z", "..."],
  "twoNRClose": "2NR closing paragraph (2-4 sentences)",
  "twoARClose": "2AR closing paragraph (2-4 sentences)"
}`,
      },
    ],
  });
  return extractJson<ImpactCalcOutput>(text);
}

/* ---------------- Judge Adaptation Advice ---------------- */

export interface JudgeAdaptation {
  speechLayout: Array<{ speech: string; advice: string }>;
  arguments: { read: string[]; avoid: string[] };
  delivery: { speed: string; clarity: string; persona: string };
  riskTolerance: string;
  closeStrategy: string;
}

export async function adaptToJudge(
  judgeId: string,
  side: "aff" | "neg",
  topicContext: string,
  prepNotes: string
): Promise<JudgeAdaptation> {
  const judge = getJudgeById(judgeId);
  if (!judge) throw new Error(`Unknown judge id: ${judgeId}`);

  const text = await streamText({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `${FOUNDATION_SYSTEM}

${describeJudgeForPrompt(judge)}

You're advising a ${side.toUpperCase()} team on how to adapt their prep for this exact judge.`,
    messages: [
      {
        role: "user",
        content: `Topic context: ${topicContext}
Existing prep notes: ${prepNotes}

Return ONLY JSON:
{
  "speechLayout": [
    {"speech": "1AC", "advice": "..."},
    {"speech": "1NC", "advice": "..."},
    {"speech": "2AC", "advice": "..."},
    {"speech": "2NC", "advice": "..."},
    {"speech": "1NR", "advice": "..."},
    {"speech": "1AR", "advice": "..."},
    {"speech": "2NR", "advice": "..."},
    {"speech": "2AR", "advice": "..."}
  ],
  "arguments": {
    "read": ["arg type 1", "arg type 2"],
    "avoid": ["arg type to skip", "another"]
  },
  "delivery": {
    "speed": "specific wpm or descriptor",
    "clarity": "guidance",
    "persona": "guidance"
  },
  "riskTolerance": "how aggressively to play",
  "closeStrategy": "how to crystallize the round"
}`,
      },
    ],
  });
  return extractJson<JudgeAdaptation>(text);
}

/* ---------------- Drill Generator ---------------- */

export type DrillType =
  | "spreading"
  | "cx-attack"
  | "cx-defense"
  | "rebuttal-redo"
  | "impact-calc"
  | "tag-extension"
  | "cross-app"
  | "blocks-extempore";

export interface Drill {
  type: DrillType;
  title: string;
  description: string;
  setup: string;
  prompt: string;
  successCriteria: string[];
  timeSeconds: number;
  difficulty: "novice" | "jv" | "varsity" | "circuit";
  followUp?: string;
}

export async function generateDrill(
  type: DrillType,
  difficulty: Drill["difficulty"],
  context: string
): Promise<Drill> {
  const text = await streamText({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: `${FOUNDATION_SYSTEM}

You design DEBATE DRILLS — short focused practice exercises that build a specific skill. A great drill is:
- 60-300 seconds long
- Has a clear constraint (one minute, no notes, etc.)
- Has measurable success criteria
- Targets ONE skill, not many`,
    messages: [
      {
        role: "user",
        content: `Generate a ${difficulty} ${type} drill.

Context (topic, what the user is working on): ${context}

Return ONLY JSON:
{
  "type": "${type}",
  "title": "short drill name",
  "description": "1 sentence: what the drill teaches",
  "setup": "what the debater does before starting",
  "prompt": "the actual exercise / argument / scenario",
  "successCriteria": ["criterion 1", "criterion 2", "criterion 3"],
  "timeSeconds": number,
  "difficulty": "${difficulty}",
  "followUp": "what to practice next"
}`,
      },
    ],
  });
  return extractJson<Drill>(text);
}

/* ---------------- Live Coach Streaming ---------------- */

export async function* streamCoach(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  resolution: string,
  side: "aff" | "neg" | "either",
  judgeId: string | null,
  prep: string
): AsyncGenerator<string> {
  const judge = judgeId ? getJudgeById(judgeId) : null;
  const sys = `${FOUNDATION_SYSTEM}

${resolution ? `CURRENT TOPIC: ${resolution}` : ""}
SIDE: ${side === "either" ? "User can be aff or neg — clarify before strategy advice." : side.toUpperCase()}
${judge ? describeJudgeForPrompt(judge) : "No judge specified."}
${prep ? `USER'S PREP NOTES: ${prep}` : ""}

You're providing live coaching. Respond like a head coach in lab — concise, direct, technically deep. When asked for strategy, give the SPECIFIC recommendation, not a survey of options. Use debate jargon naturally. Reference specific authors, arguments, and strategic concepts when relevant.

Format with markdown — headings, lists, bold for emphasis. Never produce walls of text without structure.`;

  const stream = client.messages.stream({
    model: "claude-opus-4-20250514",
    max_tokens: 16000,
    system: sys,
    messages: history,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

/* ---------------- Cross-Application Generator ---------------- */

export interface CrossAppSuggestion {
  fromArgument: string;
  toArgument: string;
  warrant: string;
  delivery: string;
  riskNotes: string;
}

export async function suggestCrossApplications(
  ourArguments: string[],
  theirArguments: string[],
  speech: string
): Promise<CrossAppSuggestion[]> {
  const text = await streamText({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    system: `${FOUNDATION_SYSTEM}

You identify CROSS-APPLICATIONS — places where an argument from one part of the flow can be applied to another. Top debaters use these constantly to save time and create unexpected offense.

Examples:
- A solvency card on the case can be cross-applied to answer a CP solvency claim.
- A no-link argument on a DA can be cross-applied to answer a K link.
- An uniqueness card can be cross-applied as impact defense.

Generate 3-6 high-leverage cross-applications.`,
    messages: [
      {
        role: "user",
        content: `Speech: ${speech}

Our arguments:
${ourArguments.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Their arguments to answer:
${theirArguments.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Return ONLY JSON array:
[{
  "fromArgument": "label of our argument",
  "toArgument": "label of their argument",
  "warrant": "1-2 sentences explaining why the cross-app works",
  "delivery": "what the debater says (e.g., 'Cross-apply our 2AC #3 — they didn't answer it and it controls the link debate')",
  "riskNotes": "what to watch out for"
}]`,
      },
    ],
  });
  return extractJson<CrossAppSuggestion[]>(text);
}

/* ---------------- Refutation Generator ---------------- */

export interface Refutation {
  responses: Array<{
    response: string;
    type: "defense" | "offense" | "perm" | "theory" | "framework";
    quality: number;
  }>;
  bestPath: string;
  trapsToAvoid: string[];
}

export async function generateRefutations(
  argumentToAnswer: string,
  side: "aff" | "neg",
  context: string,
  count = 6
): Promise<Refutation> {
  const text = await streamText({
    model: "claude-opus-4-20250514",
    max_tokens: 4000,
    system: `${FOUNDATION_SYSTEM}

You generate ${count} distinct refutations to an argument. Mix:
- Defense (no link, no impact, defense)
- Offense (link turn, impact turn, case turn)
- Perms (against CPs/Ks)
- Theory (when applicable)
- Framework (against Ks)

Rate each from 1-100 on quality. Identify the BEST PATH (which combination wins the round).`,
    messages: [
      {
        role: "user",
        content: `Argument to answer: ${argumentToAnswer}

Side: ${side.toUpperCase()}
Context: ${context}

Return ONLY JSON:
{
  "responses": [
    {"response": "the response in 2-3 sentences with warrant", "type": "defense", "quality": 85}
  ],
  "bestPath": "1-2 sentence strategy: which combination of these to go for",
  "trapsToAvoid": ["trap 1", "trap 2"]
}`,
      },
    ],
  });
  return extractJson<Refutation>(text);
}

/* ---------------- Source Quality Assessor ---------------- */

export interface SourceAssessment {
  authorScore: number;
  recencyScore: number;
  specificityScore: number;
  warrantDepthScore: number;
  overall: number;
  notes: string[];
  comparedToTop: string;
}

export async function assessEvidence(
  citation: string,
  evidence: string,
  query: string
): Promise<SourceAssessment> {
  const text = await streamText({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: `${FOUNDATION_SYSTEM}

You assess evidence quality on the 5 standard policy debate criteria:
- Author qualifications (Are they an expert? Tenured? Published?)
- Recency (Within 3 years? 5? 10?)
- Specificity (Direct claim about the topic vs. general background?)
- Warrant depth (Does it explain WHY?)

Be brutally honest — coaches at top camps reject 80% of cards as "weak."`,
    messages: [
      {
        role: "user",
        content: `Citation: ${citation}

Evidence (first 1500 chars): ${evidence.slice(0, 1500)}

Query the evidence supports: ${query}

Return ONLY JSON:
{
  "authorScore": 0-100,
  "recencyScore": 0-100,
  "specificityScore": 0-100,
  "warrantDepthScore": 0-100,
  "overall": 0-100,
  "notes": ["specific note 1", "specific note 2"],
  "comparedToTop": "1-2 sentences comparing this to top circuit ev on the same topic"
}`,
      },
    ],
  });
  return extractJson<SourceAssessment>(text);
}
