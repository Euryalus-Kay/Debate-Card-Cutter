/**
 * Debate formats, speech sequence, and speaker responsibilities.
 *
 * Pure data + functions. Every rule that varies by circuit/tournament is a
 * field on FormatDef so rounds can override it; nothing downstream should
 * hard-code times or order.
 */

export type Side = "aff" | "neg";
export type SpeakerRole = "1A" | "2A" | "1N" | "2N";
export type SpeechId = "1AC" | "1NC" | "2AC" | "2NC" | "1NR" | "1AR" | "2NR" | "2AR";
export type CxId = "CX1" | "CX2" | "CX3" | "CX4";
export type SlotId = SpeechId | CxId;

export const SPEECH_IDS: readonly SpeechId[] = ["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"] as const;

export interface SpeechDef {
  id: SpeechId;
  kind: "constructive" | "rebuttal";
  side: Side;
  speaker: SpeakerRole;
  /** true for 2NC and 1NR: the negative block (back-to-back negative speeches) */
  negBlock: boolean;
  name: string;
}

export interface CxDef {
  id: CxId;
  /** the speech whose speaker is questioned */
  after: SpeechId;
  asker: SpeakerRole;
  answerer: SpeakerRole;
}

/** Fixed structure of policy debate. Times live in FormatDef. */
export const SPEECHES: Record<SpeechId, SpeechDef> = {
  "1AC": { id: "1AC", kind: "constructive", side: "aff", speaker: "1A", negBlock: false, name: "First Affirmative Constructive" },
  "1NC": { id: "1NC", kind: "constructive", side: "neg", speaker: "1N", negBlock: false, name: "First Negative Constructive" },
  "2AC": { id: "2AC", kind: "constructive", side: "aff", speaker: "2A", negBlock: false, name: "Second Affirmative Constructive" },
  "2NC": { id: "2NC", kind: "constructive", side: "neg", speaker: "2N", negBlock: true, name: "Second Negative Constructive" },
  "1NR": { id: "1NR", kind: "rebuttal", side: "neg", speaker: "1N", negBlock: true, name: "First Negative Rebuttal" },
  "1AR": { id: "1AR", kind: "rebuttal", side: "aff", speaker: "1A", negBlock: false, name: "First Affirmative Rebuttal" },
  "2NR": { id: "2NR", kind: "rebuttal", side: "neg", speaker: "2N", negBlock: false, name: "Second Negative Rebuttal" },
  "2AR": { id: "2AR", kind: "rebuttal", side: "aff", speaker: "2A", negBlock: false, name: "Second Affirmative Rebuttal" },
};

/**
 * Default cross-examination assignments. Convention: the debater who does not
 * speak next asks the questions, so their partner can prep. Overridable per
 * round because teams deviate.
 */
export const DEFAULT_CX: readonly CxDef[] = [
  { id: "CX1", after: "1AC", asker: "2N", answerer: "1A" },
  { id: "CX2", after: "1NC", asker: "1A", answerer: "1N" },
  { id: "CX3", after: "2AC", asker: "1N", answerer: "2A" },
  { id: "CX4", after: "2NC", asker: "2A", answerer: "2N" },
] as const;

export type NewArgumentPolicy =
  /** conventional: no new arguments in rebuttals; new evidence extending prior arguments is fine */
  | "conventional"
  /** stricter: flag new evidence in the 2NR/2AR too */
  | "strict"
  /** judge/league allows new arguments in rebuttals */
  | "permissive";

export type CxMode = "standard" | "open" | "either_speaker";

export interface FormatDef {
  id: string;
  name: string;
  description: string;
  /** standard: assigned asker/answerer; open: partners may help; either_speaker: NDT-style */
  cxMode?: CxMode;
  constructiveSeconds: number;
  rebuttalSeconds: number;
  cxSeconds: number;
  /** prep time per team for the whole round */
  prepSecondsPerTeam: number;
  newArgumentPolicy: NewArgumentPolicy;
  cx: readonly CxDef[];
}

export const FORMATS: Record<string, FormatDef> = {
  "hs-standard": {
    id: "hs-standard",
    name: "High school (8-3-5)",
    description: "NSDA and most high-school tournaments: 8-minute constructives, 3-minute cross-examinations, 5-minute rebuttals, 8 minutes of prep.",
    constructiveSeconds: 8 * 60,
    rebuttalSeconds: 5 * 60,
    cxSeconds: 3 * 60,
    prepSecondsPerTeam: 8 * 60,
    newArgumentPolicy: "conventional",
    cx: DEFAULT_CX,
  },
  "hs-10-prep": {
    id: "hs-10-prep",
    name: "High school, 10 min prep",
    description: "8-3-5 with 10 minutes of prep per team (e.g. Glenbrooks 2026). Prep time is tournament-specific; check the invitation.",
    constructiveSeconds: 8 * 60,
    rebuttalSeconds: 5 * 60,
    cxSeconds: 3 * 60,
    prepSecondsPerTeam: 10 * 60,
    newArgumentPolicy: "conventional",
    cx: DEFAULT_CX,
  },
  "hs-5-prep": {
    id: "hs-5-prep",
    name: "High school, 5 min prep",
    description: "8-3-5 with 5 minutes of prep per team (some state and league tournaments).",
    constructiveSeconds: 8 * 60,
    rebuttalSeconds: 5 * 60,
    cxSeconds: 3 * 60,
    prepSecondsPerTeam: 5 * 60,
    newArgumentPolicy: "conventional",
    cx: DEFAULT_CX,
  },
  "college-9-3-6": {
    id: "college-9-3-6",
    name: "College (9-3-6)",
    description: "NDT/CEDA: 9-minute constructives, 3-minute cross-examinations, 6-minute rebuttals, 10 minutes prep.",
    constructiveSeconds: 9 * 60,
    rebuttalSeconds: 6 * 60,
    cxSeconds: 3 * 60,
    prepSecondsPerTeam: 10 * 60,
    newArgumentPolicy: "conventional",
    cx: DEFAULT_CX,
  },
};

export const DEFAULT_FORMAT_ID = "hs-standard";

export function getFormat(id: string | undefined | null, overrides?: Partial<FormatDef>): FormatDef {
  const base = FORMATS[id ?? DEFAULT_FORMAT_ID] ?? FORMATS[DEFAULT_FORMAT_ID];
  return { ...base, ...(overrides ?? {}) };
}

export function speechSeconds(format: FormatDef, speech: SpeechId): number {
  return SPEECHES[speech].kind === "constructive" ? format.constructiveSeconds : format.rebuttalSeconds;
}

export interface SequenceSlot {
  slot: SlotId;
  index: number;
  type: "speech" | "cx";
  side: Side;
  seconds: number;
  speech?: SpeechDef;
  cx?: CxDef;
}

/** Full round sequence: 1AC, CX1, 1NC, CX2, 2AC, CX3, 2NC, CX4, 1NR, 1AR, 2NR, 2AR. */
export function roundSequence(format: FormatDef): SequenceSlot[] {
  const out: SequenceSlot[] = [];
  const cxAfter = new Map(format.cx.map((c) => [c.after, c]));
  for (const id of SPEECH_IDS) {
    const speech = SPEECHES[id];
    out.push({ slot: id, index: out.length, type: "speech", side: speech.side, seconds: speechSeconds(format, id), speech });
    const cx = cxAfter.get(id);
    if (cx) {
      // Side recorded is the questioning side.
      out.push({ slot: cx.id, index: out.length, type: "cx", side: speech.side === "aff" ? "neg" : "aff", seconds: format.cxSeconds, cx });
    }
  }
  return out;
}

export function speechIndex(id: SpeechId): number {
  return SPEECH_IDS.indexOf(id);
}

export function isBefore(a: SpeechId, b: SpeechId): boolean {
  return speechIndex(a) < speechIndex(b);
}

export function opposite(side: Side): Side {
  return side === "aff" ? "neg" : "aff";
}

export function speechesForSide(side: Side): SpeechId[] {
  return SPEECH_IDS.filter((s) => SPEECHES[s].side === side);
}

/**
 * The opponent speeches whose arguments this speech is primarily responsible
 * for answering. (Earlier opponent speeches still matter through the flow,
 * but these are the ones that introduced or extended what must be answered now.)
 */
export function speechesToAnswer(id: SpeechId): SpeechId[] {
  switch (id) {
    case "1AC":
      return [];
    case "1NC":
      return ["1AC"];
    case "2AC":
      return ["1NC"];
    case "2NC":
    case "1NR":
      return ["2AC"];
    case "1AR":
      return ["2NC", "1NR"];
    case "2NR":
      return ["1AR"];
    case "2AR":
      return ["2NR"];
  }
}

/** Our own earlier speeches this speech may extend (same side, earlier). */
export function speechesToExtend(id: SpeechId): SpeechId[] {
  const side = SPEECHES[id].side;
  return SPEECH_IDS.filter((s) => SPEECHES[s].side === side && isBefore(s, id));
}

/** The speech that directly precedes a given speech in the sequence (ignores CX). */
export function previousSpeech(id: SpeechId): SpeechId | null {
  const i = speechIndex(id);
  return i > 0 ? SPEECH_IDS[i - 1] : null;
}

export function isRebuttal(id: SpeechId): boolean {
  return SPEECHES[id].kind === "rebuttal";
}

/** Last speech for each side: nothing after it can answer, so no new arguments. */
export function isFinalRebuttal(id: SpeechId): boolean {
  return id === "2NR" || id === "2AR";
}

export type SpeechStatus = "not_started" | "documented" | "delivered" | "skipped_unknown";

export interface SlotState {
  speech: SpeechId;
  status: SpeechStatus;
  /** at least one document is attached for this speech */
  hasDocument: boolean;
  /** user notes or confirmed flow entries exist */
  hasNotes: boolean;
}

export interface ContextIssue {
  severity: "error" | "warning" | "info";
  code:
    | "wrong_side"
    | "missing_prior_speech"
    | "later_speech_present"
    | "document_side_mismatch"
    | "speech_already_delivered"
    | "no_record_for_prior_speech";
  message: string;
  speech?: SpeechId;
}

/**
 * Check whether preparing `target` for `ourSide` makes sense given the round
 * record. Never guesses: it reports mismatches so the user can correct the context.
 */
export function validatePrepContext(target: SpeechId, ourSide: Side, slots: SlotState[]): ContextIssue[] {
  const issues: ContextIssue[] = [];
  const def = SPEECHES[target];
  const byId = new Map(slots.map((s) => [s.speech, s]));

  if (def.side !== ourSide) {
    issues.push({
      severity: "error",
      code: "wrong_side",
      speech: target,
      message: `The ${target} is a ${def.side === "aff" ? "affirmative" : "negative"} speech, but this round has your team on the ${ourSide === "aff" ? "affirmative" : "negative"}.`,
    });
  }

  const own = byId.get(target);
  if (own?.status === "delivered") {
    issues.push({
      severity: "warning",
      code: "speech_already_delivered",
      speech: target,
      message: `The ${target} is already marked delivered. Edits to its draft will not change the delivered record unless you re-mark it.`,
    });
  }

  for (const prior of SPEECH_IDS.filter((s) => isBefore(s, target))) {
    const st = byId.get(prior);
    const opponentSpeech = SPEECHES[prior].side !== def.side;
    if (!st || st.status === "not_started") {
      // The opponent's immediately relevant speeches are the ones that matter most.
      const mustAnswer = speechesToAnswer(target).includes(prior);
      issues.push({
        severity: mustAnswer ? "warning" : "info",
        code: mustAnswer ? "missing_prior_speech" : "no_record_for_prior_speech",
        speech: prior,
        message: mustAnswer
          ? `No record of the ${prior} yet. The ${target} answers the ${prior}, so upload its document or add notes about what was said. Missing records are never treated as concessions.`
          : `No record of the ${prior}${opponentSpeech ? " (opponent)" : ""}. The flow will be incomplete for that speech.`,
      });
    } else if (st.status === "documented" && opponentSpeech && speechesToAnswer(target).includes(prior)) {
      issues.push({
        severity: "info",
        code: "no_record_for_prior_speech",
        speech: prior,
        message: `The ${prior} has a document but no confirmation of what was actually read. Items stay "documented, not confirmed" until you confirm or mark cards as not read.`,
      });
    }
  }

  for (const later of SPEECH_IDS.filter((s) => isBefore(target, s))) {
    const st = byId.get(later);
    if (st && (st.status === "delivered" || st.status === "documented")) {
      issues.push({
        severity: "warning",
        code: "later_speech_present",
        speech: later,
        message: `The ${later} (which comes after the ${target}) already has a record. Check that the speech you selected is correct.`,
      });
    }
  }
  return issues;
}

/** The next speech our side gives, given which speeches have happened. */
export function nextSpeechFor(side: Side, slots: SlotState[]): SpeechId | null {
  const done = new Set(slots.filter((s) => s.status === "delivered").map((s) => s.speech));
  // The next speech after the last delivered speech in sequence order.
  let lastIdx = -1;
  for (const s of SPEECH_IDS) if (done.has(s)) lastIdx = Math.max(lastIdx, speechIndex(s));
  for (const s of SPEECH_IDS.slice(lastIdx + 1)) if (SPEECHES[s].side === side) return s;
  return null;
}

/**
 * Who gives a speech. Defaults follow the conventional 1A/2A/1N/2N roles, but
 * some leagues swap rebuttal order or use other assignments, so a round can
 * override the speaker per speech.
 */
export function speakerFor(speech: SpeechId, roster: Partial<Record<SpeakerRole, string>>, overrides: Partial<Record<SpeechId, string>> = {}): string | undefined {
  return overrides[speech] ?? roster[SPEECHES[speech].speaker];
}
