/**
 * Round timer + spreading utilities. Local-first — no AI needed.
 */

export interface SpeechTimer {
  speech: string;
  durationSeconds: number;
  prepTimeSeconds: number;
}

export const STANDARD_TIMING: SpeechTimer[] = [
  { speech: "1AC", durationSeconds: 8 * 60, prepTimeSeconds: 0 },
  { speech: "CX of 1AC", durationSeconds: 3 * 60, prepTimeSeconds: 0 },
  { speech: "1NC", durationSeconds: 8 * 60, prepTimeSeconds: 8 * 60 },
  { speech: "CX of 1NC", durationSeconds: 3 * 60, prepTimeSeconds: 0 },
  { speech: "2AC", durationSeconds: 8 * 60, prepTimeSeconds: 8 * 60 },
  { speech: "CX of 2AC", durationSeconds: 3 * 60, prepTimeSeconds: 0 },
  { speech: "2NC", durationSeconds: 8 * 60, prepTimeSeconds: 8 * 60 },
  { speech: "CX of 2NC", durationSeconds: 3 * 60, prepTimeSeconds: 0 },
  { speech: "1NR", durationSeconds: 5 * 60, prepTimeSeconds: 8 * 60 },
  { speech: "1AR", durationSeconds: 5 * 60, prepTimeSeconds: 8 * 60 },
  { speech: "2NR", durationSeconds: 5 * 60, prepTimeSeconds: 8 * 60 },
  { speech: "2AR", durationSeconds: 5 * 60, prepTimeSeconds: 8 * 60 },
];

export function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.floor(seconds));
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  return `${sign}${mins}:${secs.toString().padStart(2, "0")}`;
}

export function timerColor(seconds: number, totalSeconds: number): string {
  if (seconds <= 0) return "#ef4444"; // red — over time
  const ratio = seconds / totalSeconds;
  if (ratio < 0.05) return "#ef4444"; // last 5%
  if (ratio < 0.15) return "#f59e0b"; // last 15%
  if (ratio < 0.4) return "#eab308"; // last 40%
  return "#22c55e";
}

/**
 * Estimate speech words-per-minute given a text and elapsed seconds.
 */
export function estimateWPM(text: string, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round((words / elapsedSeconds) * 60);
}

/**
 * Score clarity given a transcript and a target wpm. Heuristic only — used to
 * give immediate feedback during drilling. Real clarity needs human ears.
 */
export function clarityScore(text: string, wpm: number): {
  score: number;
  notes: string[];
} {
  const notes: string[] = [];
  let score = 75;

  // Penalize excessive repetition (sign of stuttering / re-reading).
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const repetitions = words.filter((w, i) => i > 0 && words[i - 1] === w).length;
  if (repetitions > 5) {
    score -= Math.min(20, repetitions * 2);
    notes.push(`${repetitions} immediate-word repetitions detected — slow down at those moments.`);
  }

  // Penalize ultra-short "ums" and filler.
  const fillers = (text.match(/\b(um|uh|like|you know)\b/gi) || []).length;
  if (fillers > 4) {
    score -= Math.min(15, fillers);
    notes.push(`${fillers} filler words — practice tag transitions to eliminate.`);
  }

  // Pace check.
  if (wpm > 360) {
    score -= 8;
    notes.push("Pace exceeds 360 wpm — clarity at risk for most judges.");
  } else if (wpm > 280 && wpm <= 360) {
    notes.push("Circuit pace. Make sure tags are slowed.");
  } else if (wpm < 180) {
    notes.push("Conversational pace — efficient use of time becomes critical.");
  }

  return { score: Math.max(0, Math.min(100, score)), notes };
}

export interface TimerEvent {
  type: "tick" | "warn" | "end";
  remaining: number;
  message?: string;
}

export class CountdownTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private remaining: number;
  private listeners: Array<(e: TimerEvent) => void> = [];
  private warnings = new Set<number>();

  constructor(public initialSeconds: number) {
    this.remaining = initialSeconds;
  }

  on(listener: (e: TimerEvent) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(e: TimerEvent) {
    for (const l of this.listeners) l(e);
  }

  start() {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => {
      this.remaining = Math.max(-300, this.remaining - 1);
      this.emit({ type: "tick", remaining: this.remaining });

      const warnAt = [60, 30, 10, 5, 0];
      for (const w of warnAt) {
        if (
          !this.warnings.has(w) &&
          this.remaining <= w &&
          this.remaining > w - 1
        ) {
          this.warnings.add(w);
          this.emit({
            type: w === 0 ? "end" : "warn",
            remaining: this.remaining,
            message:
              w === 0
                ? "Time."
                : w === 5
                ? "5 seconds."
                : w === 10
                ? "10 seconds."
                : w === 30
                ? "30 seconds remaining."
                : "1 minute remaining.",
          });
        }
      }
    }, 1000);
  }

  pause() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(seconds: number = this.initialSeconds) {
    this.pause();
    this.remaining = seconds;
    this.warnings.clear();
    this.emit({ type: "tick", remaining: this.remaining });
  }

  getRemaining() {
    return this.remaining;
  }

  isRunning() {
    return this.intervalId !== null;
  }
}
