/**
 * Progress of an AI job (A4): which stage it is in, how many of its parts are
 * done, and about how long is left. Shared by the server (which computes it
 * from the streamed output and measured run times) and the browser (which
 * shows it and counts the time down between updates).
 */

export interface Progress {
  /** what it is doing now, in plain words ("Writing section 4 of 9: Politics DA") */
  stage: string;
  /** parts finished (sections written, lines read, answers planned) */
  done: number;
  /** parts planned, when known */
  total: number | null;
  /** about how long until the whole job is done (ms), when it can be estimated */
  etaMs: number | null;
  /** 0–1, for a bar */
  fraction: number;
  /** when the browser received it (ms since epoch), so time left can count down between updates */
  at?: number;
}

/** Median of the numbers, or null for none. */
export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** "about 25 s left", "about 1 min left", "almost done" */
export function formatEta(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 4000) return "almost done";
  const s = Math.round(ms / 1000);
  if (s < 60) return `about ${Math.max(5, Math.round(s / 5) * 5)} s left`;
  const m = Math.round(s / 30) / 2;
  return `about ${m % 1 ? m.toFixed(1) : m} min left`;
}

/**
 * Time left for a job with `total` parts once `done` are finished: the measured
 * time per part so far, else the typical run time scaled by what is left.
 */
export function remainingMs(input: { done: number; total: number; since: number; now: number; typicalWritingMs: number | null; tailMs?: number }): number | null {
  const { done, total, since, now, typicalWritingMs } = input;
  const left = Math.max(0, total - done);
  const tail = input.tailMs ?? 0;
  if (done >= 1) return ((now - since) / done) * left + tail;
  if (typicalWritingMs !== null) return Math.max(0, typicalWritingMs - (now - since)) + tail;
  return null;
}
