"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import {
  DRILL_BANK,
  type DrillBankEntry,
} from "@/lib/drill-bank";
import {
  ToolboxIcon,
  PlayIcon,
  PauseIcon,
  ResetIcon,
  SparkleIcon,
  MicIcon,
} from "@/components/ui/icons";
import { CountdownTimer, formatTime, clarityScore, estimateWPM } from "@/lib/timing";
import type { DrillType } from "@/lib/anthropic-coach";

const TYPES: { id: DrillType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "spreading", label: "Spreading" },
  { id: "rebuttal-redo", label: "Rebuttal redo" },
  { id: "impact-calc", label: "Impact calc" },
  { id: "cx-attack", label: "CX attack" },
  { id: "cx-defense", label: "CX defense" },
  { id: "tag-extension", label: "Tag extension" },
  { id: "cross-app", label: "Cross-app" },
  { id: "blocks-extempore", label: "Blocks extempore" },
];

const DIFFICULTIES = ["all", "novice", "jv", "varsity", "circuit"] as const;
type DifficultyOption = (typeof DIFFICULTIES)[number];

interface ActiveDrill {
  drill: DrillBankEntry;
  remaining: number;
  running: boolean;
}

export default function DrillsPage() {
  const { resolution } = useApp();
  const toast = useToast();
  const [type, setType] = useState<DrillType | "all">("all");
  const [diff, setDiff] = useState<DifficultyOption>("all");
  const [active, setActive] = useState<ActiveDrill | null>(null);
  const [transcript, setTranscript] = useState("");
  const [drillStartTime, setDrillStartTime] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [score, setScore] = useState<{ score: number; notes: string[] } | null>(
    null
  );
  const timerRef = useRef<CountdownTimer | null>(null);

  const filtered = DRILL_BANK.filter((d) => {
    if (type !== "all" && d.type !== type) return false;
    if (diff !== "all" && d.difficulty !== diff) return false;
    return true;
  });

  const startDrill = (drill: DrillBankEntry) => {
    timerRef.current?.pause();
    timerRef.current = new CountdownTimer(drill.timeSeconds);
    setActive({ drill, remaining: drill.timeSeconds, running: false });
    setTranscript("");
    setScore(null);
    setDrillStartTime(null);
  };

  useEffect(() => {
    if (!active) return;
    if (!timerRef.current) {
      timerRef.current = new CountdownTimer(active.drill.timeSeconds);
    }
    const off = timerRef.current.on((evt) => {
      setActive((prev) =>
        prev ? { ...prev, remaining: evt.remaining } : prev
      );
      if (evt.type === "warn" || evt.type === "end") {
        toast.info(evt.message || "Time check");
      }
    });
    return () => {
      off();
    };
  }, [active, toast]);

  const startTimer = () => {
    if (!active) return;
    timerRef.current?.start();
    setDrillStartTime((s) => s ?? Date.now());
    setActive((prev) => (prev ? { ...prev, running: true } : prev));
  };
  const pauseTimer = () => {
    timerRef.current?.pause();
    setActive((prev) => (prev ? { ...prev, running: false } : prev));
  };
  const resetTimer = () => {
    if (!active) return;
    timerRef.current?.reset(active.drill.timeSeconds);
    setActive((prev) =>
      prev ? { ...prev, remaining: prev.drill.timeSeconds, running: false } : prev
    );
    setDrillStartTime(null);
  };

  const evaluate = () => {
    if (!active) return;
    const elapsed = drillStartTime
      ? (Date.now() - drillStartTime) / 1000
      : active.drill.timeSeconds - active.remaining;
    const wpm = estimateWPM(transcript, Math.max(1, elapsed));
    const result = clarityScore(transcript, wpm);
    setScore({ ...result, notes: [`Estimated pace: ${wpm} wpm`, ...result.notes] });
    toast.info(`Drill scored ${result.score}/100`);
  };

  const generateNew = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type === "all" ? "rebuttal-redo" : type,
          difficulty: diff === "all" ? "varsity" : diff,
          context: resolution || "Current HS policy debate topic",
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Generation failed", data.error);
        return;
      }
      const synthetic: DrillBankEntry = {
        id: `gen-${Date.now()}`,
        type: data.type,
        title: data.title,
        blurb: data.description,
        setup: data.setup,
        prompt: data.prompt,
        successCriteria: data.successCriteria,
        timeSeconds: data.timeSeconds,
        difficulty: data.difficulty,
        followUp: data.followUp,
      };
      startDrill(synthetic);
      toast.success("Drill generated", data.title);
    } catch (err) {
      toast.error(
        "Generation failed",
        err instanceof Error ? err.message : "Unknown"
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
          <ToolboxIcon size={18} className="text-[var(--accent-cyan)]" />
          Drill Lab
        </h1>
        <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1">
          Build the fundamentals — spreading, rebuttal redos, CX, impact calc.
          Every drill is timed; transcripts are scored for pace & clarity.
        </p>
      </div>

      {/* Active drill */}
      {active && (
        <div className="surface-elev p-5 mb-6 anim-scale-in">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge badge-cyan">{active.drill.type}</span>
                <span
                  className={`badge ${
                    active.drill.difficulty === "circuit"
                      ? "badge-red"
                      : active.drill.difficulty === "varsity"
                      ? "badge-amber"
                      : active.drill.difficulty === "jv"
                      ? "badge-blue"
                      : "badge-green"
                  }`}
                >
                  {active.drill.difficulty}
                </span>
              </div>
              <h2 className="text-[15px] font-semibold text-white">
                {active.drill.title}
              </h2>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                {active.drill.blurb}
              </p>
            </div>
            <div
              className="timer-display timer-display-md"
              style={{
                color:
                  active.remaining < 10
                    ? "var(--accent-red)"
                    : active.remaining < 30
                    ? "var(--accent-amber)"
                    : "var(--accent-green)",
              }}
            >
              {formatTime(active.remaining)}
            </div>
          </div>

          <div className="surface p-3 mb-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1">
              Setup
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] mb-3">
              {active.drill.setup}
            </p>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1">
              Prompt
            </div>
            <p className="text-[13px] text-white leading-relaxed">
              {active.drill.prompt}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
                Success criteria
              </div>
              <ul className="space-y-1">
                {active.drill.successCriteria.map((s, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-green)]">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1.5 flex items-center gap-1.5">
                <MicIcon size={11} />
                Transcript / notes (paste what you said)
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="textarea"
                rows={5}
                placeholder="Paste a transcript of your delivery here. We'll estimate pace and clarity."
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {active.running ? (
              <button onClick={pauseTimer} className="btn-secondary">
                <PauseIcon size={12} /> Pause
              </button>
            ) : (
              <button onClick={startTimer} className="btn-primary">
                <PlayIcon size={12} /> Start
              </button>
            )}
            <button onClick={resetTimer} className="btn-ghost">
              <ResetIcon size={12} /> Reset
            </button>
            <button
              onClick={evaluate}
              disabled={!transcript}
              className="btn-secondary"
            >
              Score this drill
            </button>
            <button onClick={() => setActive(null)} className="btn-ghost">
              Exit
            </button>
          </div>

          {score && (
            <div className="mt-4 surface p-4 anim-slide-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] uppercase tracking-wider text-[var(--text-faint)]">
                  Score
                </span>
                <span
                  className="text-[24px] font-bold"
                  style={{
                    color:
                      score.score >= 80
                        ? "var(--accent-green)"
                        : score.score >= 60
                        ? "var(--accent-amber)"
                        : "var(--accent-red)",
                  }}
                >
                  {score.score}/100
                </span>
              </div>
              <ul className="space-y-1">
                {score.notes.map((n, i) => (
                  <li key={i} className="text-[11.5px] text-[var(--text-secondary)]">
                    · {n}
                  </li>
                ))}
              </ul>
              {active.drill.followUp && (
                <p className="text-[11px] text-[var(--text-tertiary)] mt-3 italic">
                  Next up: {active.drill.followUp}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                type === t.id
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                  : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[var(--border-default)]">|</span>
        <div className="flex flex-wrap gap-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDiff(d)}
              className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                diff === d
                  ? "border-[var(--accent-purple)] bg-[var(--accent-purple-glow)] text-white"
                  : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={generateNew}
          disabled={generating}
          className="btn-primary ml-auto"
        >
          {generating ? (
            <>
              <span className="spinner" /> Generating...
            </>
          ) : (
            <>
              <SparkleIcon size={12} /> Generate custom drill
            </>
          )}
        </button>
      </div>

      {/* Drill grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((drill) => (
          <button
            key={drill.id}
            onClick={() => startDrill(drill)}
            className="surface surface-hover p-4 text-left flex flex-col gap-2 anim-fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="badge badge-cyan">{drill.type}</span>
              <span className="text-[10px] text-[var(--text-faint)]">
                {drill.timeSeconds}s
              </span>
            </div>
            <h3 className="text-[13px] font-semibold text-white">
              {drill.title}
            </h3>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed line-clamp-2">
              {drill.blurb}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`badge ${
                  drill.difficulty === "circuit"
                    ? "badge-red"
                    : drill.difficulty === "varsity"
                    ? "badge-amber"
                    : drill.difficulty === "jv"
                    ? "badge-blue"
                    : "badge-green"
                }`}
              >
                {drill.difficulty}
              </span>
              <span className="text-[10px] text-[var(--text-faint)]">
                {drill.successCriteria.length} criteria
              </span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-[12.5px] text-[var(--text-tertiary)]">
            No drills match your filters.
          </div>
        )}
      </div>
    </>
  );
}
