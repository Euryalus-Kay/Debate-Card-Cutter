/**
 * Speech time estimation.
 *
 * Estimates are estimates: each speaker reads card text, tags, and analytics at
 * different rates, and delivery varies. We model seconds-per-word for each
 * content kind plus fixed per-item overheads, start from configurable style
 * presets, and refine with the speaker's own calibration observations
 * (ridge regression toward the preset, so a few observations do not overfit).
 */

export type ContentKind = "card" | "tag" | "analytic";

export interface SpeakingRates {
  /** words per minute for highlighted card text */
  cardWpm: number;
  /** words per minute for tags and short cites */
  tagWpm: number;
  /** words per minute for analytics, overviews, and transitions */
  analyticWpm: number;
  /** seconds of overhead per card (pause, "and", reading the short cite) */
  perCardSeconds: number;
  /** seconds of overhead per signposted transition ("next off", "on the perm") */
  perTransitionSeconds: number;
}

export type RatePresetId = "conversational" | "moderate" | "fast" | "very-fast";

/**
 * Starting presets. Card text is typically read fastest and analytics slowest.
 * These are deliberately conservative starting points; calibration replaces them.
 */
export const RATE_PRESETS: Record<RatePresetId, SpeakingRates & { label: string; description: string }> = {
  // Starting points only (docs/research/debate-domain.md §10.3). The one real
  // measurement (Batterman 2021, elite college 1ACs) found a blended median of
  // 276 wpm (10th–90th: 237–318). Per-content-type ratios are unmeasured priors.
  conversational: {
    label: "Conversational",
    description: "Lay judges (~140–170 wpm blended)",
    cardWpm: 160,
    tagWpm: 150,
    analyticWpm: 145,
    perCardSeconds: 2.5,
    perTransitionSeconds: 1.5,
  },
  moderate: {
    label: "Moderate",
    description: "Flow judges who prefer clarity (~190–230 wpm)",
    cardWpm: 230,
    tagWpm: 190,
    analyticWpm: 180,
    perCardSeconds: 2,
    perTransitionSeconds: 1.2,
  },
  fast: {
    label: "Circuit fast",
    description: "HS national-circuit varsity (~250–290 wpm)",
    cardWpm: 300,
    tagWpm: 220,
    analyticWpm: 210,
    perCardSeconds: 1.5,
    perTransitionSeconds: 1,
  },
  "very-fast": {
    label: "Very fast (elite)",
    description: "Top of measured range (~290–320 wpm)",
    cardWpm: 340,
    tagWpm: 240,
    analyticWpm: 230,
    perCardSeconds: 1.2,
    perTransitionSeconds: 0.8,
  },
};

export const DEFAULT_RATE_PRESET: RatePresetId = "fast";

/** Relative uncertainty applied to uncalibrated estimates (±). */
export const UNCALIBRATED_UNCERTAINTY = 0.2;

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // Count tokens containing at least one letter or digit; ignore stray punctuation.
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Word counts for a unit of speech content. */
export interface WordLoad {
  cardWords: number;
  tagWords: number;
  analyticWords: number;
  cards: number;
  transitions: number;
}

export const EMPTY_LOAD: WordLoad = { cardWords: 0, tagWords: 0, analyticWords: 0, cards: 0, transitions: 0 };

export function addLoads(...loads: WordLoad[]): WordLoad {
  return loads.reduce(
    (acc, l) => ({
      cardWords: acc.cardWords + l.cardWords,
      tagWords: acc.tagWords + l.tagWords,
      analyticWords: acc.analyticWords + l.analyticWords,
      cards: acc.cards + l.cards,
      transitions: acc.transitions + l.transitions,
    }),
    { ...EMPTY_LOAD },
  );
}

export function estimateSeconds(load: WordLoad, rates: SpeakingRates): number {
  return (
    (load.cardWords * 60) / rates.cardWpm +
    (load.tagWords * 60) / rates.tagWpm +
    (load.analyticWords * 60) / rates.analyticWpm +
    load.cards * rates.perCardSeconds +
    load.transitions * rates.perTransitionSeconds
  );
}

export interface Estimate {
  seconds: number;
  low: number;
  high: number;
  calibrated: boolean;
}

export function estimate(load: WordLoad, profile: RateProfile): Estimate {
  const seconds = estimateSeconds(load, profile.rates);
  const u = profile.uncertainty;
  return { seconds, low: seconds * (1 - u), high: seconds * (1 + u), calibrated: profile.observations.length > 0 };
}

/** Inverse: how many words of a kind fit in a number of seconds. */
export function wordsForSeconds(seconds: number, kind: ContentKind, rates: SpeakingRates): number {
  const wpm = kind === "card" ? rates.cardWpm : kind === "tag" ? rates.tagWpm : rates.analyticWpm;
  return Math.max(0, Math.floor((seconds * wpm) / 60));
}

export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.round(Math.abs(totalSeconds));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/** One measured delivery: what was read and how long it took. */
export interface CalibrationObservation {
  load: WordLoad;
  seconds: number;
  source: "timed_reading" | "delivered_speech" | "manual";
  at: string; // ISO timestamp
}

export interface RateProfile {
  preset: RatePresetId;
  rates: SpeakingRates;
  observations: CalibrationObservation[];
  /** relative uncertainty (fraction) for display ranges */
  uncertainty: number;
}

export function presetProfile(preset: RatePresetId = DEFAULT_RATE_PRESET): RateProfile {
  const { label: _l, description: _d, ...rates } = RATE_PRESETS[preset];
  return { preset, rates, observations: [], uncertainty: UNCALIBRATED_UNCERTAINTY };
}

/**
 * Fit seconds-per-word for card/tag/analytic by ridge regression toward the
 * preset (prior). Overheads stay at preset values (too collinear to fit from
 * few observations). Returns a profile with updated rates and an empirical
 * uncertainty (bounded to [5%, 25%]).
 */
export function calibrate(preset: RatePresetId, observations: CalibrationObservation[], priorWeight = 60): RateProfile {
  const base = presetProfile(preset);
  const valid = observations.filter((o) => o.seconds > 0 && o.load.cardWords + o.load.tagWords + o.load.analyticWords > 0);
  if (valid.length === 0) return base;

  const r = base.rates;
  const prior = [60 / r.cardWpm, 60 / r.tagWpm, 60 / r.analyticWpm];
  // Normal equations: (XᵀX + λI) β = Xᵀy + λ β0, where y excludes fixed overheads.
  const A = [
    [priorWeight, 0, 0],
    [0, priorWeight, 0],
    [0, 0, priorWeight],
  ];
  const b = prior.map((p) => p * priorWeight);
  for (const o of valid) {
    const x = [o.load.cardWords, o.load.tagWords, o.load.analyticWords];
    const y = o.seconds - o.load.cards * r.perCardSeconds - o.load.transitions * r.perTransitionSeconds;
    // Scale each observation so long readings do not dominate; weight ~ 1 per observation.
    const scale = 1 / Math.max(1, Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) / 50);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j] * scale * scale;
      b[i] += x[i] * y * scale * scale;
    }
  }
  const beta = solve3(A, b) ?? prior;
  // Clamp to plausible human ranges: 90–500 wpm.
  const clampSpw = (spw: number, fallback: number) => (Number.isFinite(spw) && spw > 60 / 500 && spw < 60 / 90 ? spw : fallback);
  const spw = beta.map((v, i) => clampSpw(v, prior[i]));
  const rates: SpeakingRates = {
    ...r,
    cardWpm: Math.round(60 / spw[0]),
    tagWpm: Math.round(60 / spw[1]),
    analyticWpm: Math.round(60 / spw[2]),
  };

  // Empirical relative error of the fitted model.
  const relErrors = valid.map((o) => {
    const pred = estimateSeconds(o.load, rates);
    return Math.abs(pred - o.seconds) / o.seconds;
  });
  const meanErr = relErrors.reduce((a, e) => a + e, 0) / relErrors.length;
  // Few observations → keep a wider band.
  const shrink = valid.length >= 5 ? 1 : 1 + (5 - valid.length) * 0.15;
  const uncertainty = Math.min(0.25, Math.max(0.05, meanErr * 1.5 * shrink));
  return { preset, rates, observations: valid, uncertainty };
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface BudgetLine {
  id: string;
  label: string;
  seconds: number;
  budgetSeconds?: number;
}

export interface BudgetReport {
  totalSeconds: number;
  limitSeconds: number;
  overBySeconds: number;
  lines: Array<BudgetLine & { overBudget: boolean; share: number }>;
}

export function budgetReport(lines: BudgetLine[], limitSeconds: number): BudgetReport {
  const total = lines.reduce((a, l) => a + l.seconds, 0);
  return {
    totalSeconds: total,
    limitSeconds,
    overBySeconds: Math.max(0, total - limitSeconds),
    lines: lines.map((l) => ({
      ...l,
      overBudget: l.budgetSeconds !== undefined && l.seconds > l.budgetSeconds * 1.05,
      share: total > 0 ? l.seconds / total : 0,
    })),
  };
}
