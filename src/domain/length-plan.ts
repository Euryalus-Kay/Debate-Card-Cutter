/**
 * Exact word targets for bringing a speech to time. Models budget words
 * loosely; the timing model is exact, so code decides how many analytic words
 * each section should have and the model only rewrites to those counts.
 */

export interface LengthItem {
  id: string;
  /** current analytic words */
  words: number;
  /** 1 = must keep, 2 = important, 3 = cut first */
  priority: number;
}

export interface LengthOptions {
  /** a trimmed section keeps at least this many words … */
  minWords?: number;
  /** … and at least this share of its current words */
  minShare?: number;
  /** a grown section at most multiplies its words by this */
  maxGrowth?: number;
  /** changes smaller than this aren't worth a rewrite */
  minChange?: number;
}

const TRIM_WEIGHT: Record<number, number> = { 1: 0.6, 2: 1, 3: 1.6 };
const GROW_WEIGHT: Record<number, number> = { 1: 1.4, 2: 1, 3: 0.6 };

/**
 * Spread a change of `deltaWords` (negative = cut, positive = add) across
 * sections in proportion to their length and priority: lower-priority sections
 * give up more, higher-priority ones gain more. Each section's change is capped
 * (a floor when trimming, a growth cap when filling); what a capped section
 * can't take moves to the others. Returns id → new word target, only for
 * sections that change by at least `minChange` words.
 */
export function allocateWordChange(items: LengthItem[], deltaWords: number, opts: LengthOptions = {}): Map<string, number> {
  const { minWords = 20, minShare = 0.45, maxGrowth = 2, minChange = 12 } = opts;
  const trim = deltaWords < 0;
  const weights = trim ? TRIM_WEIGHT : GROW_WEIGHT;
  const weight = (i: LengthItem) => i.words * (weights[i.priority] ?? 1);
  const roomOf = (i: LengthItem) => Math.max(0, trim ? i.words - Math.max(minWords, Math.ceil(i.words * minShare)) : Math.floor(i.words * (maxGrowth - 1)));
  // Water-fill: hand out the change in proportion to weight until it's gone or nobody has room.
  const fill = (active: LengthItem[]) => {
    const change = new Map(active.map((i) => [i.id, 0]));
    let left = Math.abs(deltaWords);
    for (let round = 0; round < 20 && left > 0.5; round++) {
      const open = active.filter((i) => roomOf(i) - change.get(i.id)! > 0.5);
      if (!open.length) break;
      const total = open.reduce((a, i) => a + weight(i), 0);
      let given = 0;
      for (const i of open) {
        const take = Math.min((left * weight(i)) / total, roomOf(i) - change.get(i.id)!);
        change.set(i.id, change.get(i.id)! + take);
        given += take;
      }
      left -= given;
    }
    return change;
  };
  // A change too small to be worth a rewrite goes to the other sections instead: drop the
  // lightest such section and spread again, until every remaining change is big enough.
  let active = items.filter((i) => i.words > 0 && roomOf(i) > 0);
  let change = fill(active);
  while (active.length > 1) {
    const tiny = active.filter((i) => change.get(i.id)! < minChange);
    if (!tiny.length) break;
    const lightest = tiny.reduce((a, b) => (weight(b) < weight(a) ? b : a));
    active = active.filter((i) => i !== lightest);
    change = fill(active);
  }
  const out = new Map<string, number>();
  for (const i of active) {
    const c = Math.round(change.get(i.id)!);
    if (c >= minChange) out.set(i.id, trim ? i.words - c : i.words + c);
  }
  return out;
}

export interface Rewrite {
  id: string;
  /** words before the rewrite */
  have: number;
  /** words in the rewrite */
  got: number;
  /** words asked for */
  want: number;
  priority: number;
}

/**
 * Which rewrites to keep. Trims are kept when they got shorter without
 * cutting below half the target. Fills overshoot their word targets, so they
 * are kept most-important first, and only while the speech stays under
 * `capSeconds`: a filled draft never runs over.
 */
export function acceptRewrites(mode: "trim" | "grow", rewrites: Rewrite[], currentSeconds: number, capSeconds: number, secondsPerWord: number): Set<string> {
  const keep = new Set<string>();
  if (mode === "trim") {
    for (const r of rewrites) if (r.got < r.have && r.got >= r.want * 0.5) keep.add(r.id);
    return keep;
  }
  let total = currentSeconds;
  const candidates = rewrites.filter((r) => r.got > r.have && r.got <= r.want * 1.4).sort((a, b) => a.priority - b.priority);
  for (const r of candidates) {
    const added = (r.got - r.have) * secondsPerWord;
    if (total + added > capSeconds) continue;
    total += added;
    keep.add(r.id);
  }
  return keep;
}
