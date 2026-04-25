"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import { JUDGE_PARADIGMS, type JudgeParadigm } from "@/lib/judge-paradigms";
import MarkdownView from "@/components/ui/MarkdownView";
import {
  GavelIcon,
  SparkleIcon,
  ZapIcon,
} from "@/components/ui/icons";

interface JudgeAdaptation {
  speechLayout: Array<{ speech: string; advice: string }>;
  arguments: { read: string[]; avoid: string[] };
  delivery: { speed: string; clarity: string; persona: string };
  riskTolerance: string;
  closeStrategy: string;
}

const SPEECH_ORDER = [
  "1AC",
  "1NC",
  "2AC",
  "2NC",
  "1NR",
  "1AR",
  "2NR",
  "2AR",
];

function GaugeBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
        <span>{label}</span>
        <span className="font-mono text-[var(--text-secondary)]">
          {value}/100
        </span>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function JudgeCard({
  judge,
  selected,
  onSelect,
}: {
  judge: JudgeParadigm;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`judge-card text-left ${selected ? "selected" : ""}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="text-[28px] leading-none">{judge.emoji}</div>
        <div>
          <h3 className="text-[14px] font-semibold text-white">
            {judge.name}
          </h3>
          <p className="text-[10.5px] text-[var(--text-tertiary)]">
            {judge.shortName} paradigm
          </p>
        </div>
      </div>
      <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-3">
        {judge.description}
      </p>
      <div className="space-y-1.5">
        <GaugeBar value={judge.tech} label="Tech > truth" />
        <GaugeBar value={judge.critical} label="K-friendly" />
        <GaugeBar value={judge.theoryFriendly} label="Theory-friendly" />
        <GaugeBar value={judge.speedTolerance} label="Speed tolerance" />
      </div>
    </button>
  );
}

export default function JudgePage() {
  const { selectedJudgeId, setSelectedJudgeId, resolution, userName } = useApp();
  const toast = useToast();
  const [side, setSide] = useState<"aff" | "neg">("aff");
  const [prepNotes, setPrepNotes] = useState("");
  const [advice, setAdvice] = useState<JudgeAdaptation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.context) setPrepNotes(data.context);
      })
      .catch(() => {});
  }, [userName]);

  const judge = selectedJudgeId
    ? JUDGE_PARADIGMS.find((j) => j.id === selectedJudgeId)
    : null;

  const generateAdvice = async () => {
    if (!selectedJudgeId) {
      toast.error("Pick a judge first");
      return;
    }
    setLoading(true);
    setAdvice(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeId: selectedJudgeId,
          side,
          topicContext: resolution,
          prepNotes,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Adaptation failed", data.error);
      } else {
        setAdvice(data);
        toast.success(
          "Adaptation generated",
          `${data?.speechLayout?.length || 0} speech-by-speech notes`
        );
      }
    } catch (err) {
      toast.error(
        "Adaptation failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
          <GavelIcon size={18} className="text-[var(--accent-amber)]" />
          Judge adaptation
        </h1>
        <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1 max-w-2xl">
          Pick a paradigm. Get speech-by-speech adaptation guidance, plus what
          to read and what to avoid for this exact judge type.
        </p>
      </div>

      {/* Paradigm picker */}
      <div className="mb-6">
        <h2 className="text-[12px] uppercase tracking-wider text-[var(--text-faint)] mb-3">
          Pick a paradigm
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {JUDGE_PARADIGMS.map((j) => (
            <JudgeCard
              key={j.id}
              judge={j}
              selected={selectedJudgeId === j.id}
              onSelect={() => setSelectedJudgeId(j.id)}
            />
          ))}
        </div>
      </div>

      {/* Generate adaptation */}
      {judge && (
        <div className="surface-elev p-5 mb-6 anim-slide-up">
          <h2 className="text-[14px] font-semibold mb-1 flex items-center gap-2">
            {judge.emoji} {judge.name}
          </h2>
          <p className="text-[11.5px] text-[var(--text-tertiary)] mb-3 italic">
            &ldquo;{judge.paradigmText}&rdquo;
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <h3 className="text-[10.5px] uppercase tracking-wider text-[var(--accent-green)] mb-2">
                Loves
              </h3>
              <ul className="space-y-1">
                {judge.loves.map((l, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-green)]">+</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[10.5px] uppercase tracking-wider text-[var(--accent-red)] mb-2">
                Hates
              </h3>
              <ul className="space-y-1">
                {judge.hates.map((l, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-red)]">−</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div>
              <label className="text-[10.5px] text-[var(--text-tertiary)] mb-1.5 block">
                Side
              </label>
              <div className="flex gap-1">
                {(["aff", "neg"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`px-3 py-1.5 text-[11.5px] rounded-md border transition-colors ${
                      side === s
                        ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                        : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10.5px] text-[var(--text-tertiary)] mb-1.5 block">
                Prep notes (current state, key cards)
              </label>
              <textarea
                value={prepNotes}
                onChange={(e) => setPrepNotes(e.target.value)}
                className="textarea"
                rows={2}
              />
            </div>
            <button
              onClick={generateAdvice}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <span className="spinner" /> Generating...
                </>
              ) : (
                <>
                  <SparkleIcon size={13} /> Generate plan
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Advice output */}
      {advice && (
        <div className="space-y-4 anim-fade-in">
          <div className="surface-elev p-4">
            <h3 className="text-[12.5px] font-semibold mb-2 flex items-center gap-2">
              <ZapIcon size={13} className="text-[var(--accent-amber)]" />
              Risk tolerance
            </h3>
            <MarkdownView text={advice.riskTolerance} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="surface-elev p-4">
              <h3 className="text-[12.5px] font-semibold mb-2 text-[var(--accent-green)]">
                Read these
              </h3>
              <ul className="space-y-1.5">
                {advice.arguments.read.map((a, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-green)]">✓</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="surface-elev p-4">
              <h3 className="text-[12.5px] font-semibold mb-2 text-[var(--accent-red)]">
                Avoid these
              </h3>
              <ul className="space-y-1.5">
                {advice.arguments.avoid.map((a, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-red)]">✕</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="surface-elev p-4">
            <h3 className="text-[12.5px] font-semibold mb-3">
              Speech-by-speech plan
            </h3>
            <div className="space-y-2">
              {SPEECH_ORDER.map((sp) => {
                const item = advice.speechLayout.find((x) => x.speech === sp);
                if (!item) return null;
                return (
                  <div
                    key={sp}
                    className="flex gap-3 p-2.5 rounded-md bg-[var(--bg-elev-2)] border border-[var(--border-subtle)]"
                  >
                    <span className="text-[10px] font-mono text-white bg-[var(--bg-elev-3)] px-2 py-1 rounded shrink-0 self-start">
                      {sp}
                    </span>
                    <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                      {item.advice}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="surface-elev p-4">
              <h3 className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
                Speed
              </h3>
              <p className="text-[12px] text-white">{advice.delivery.speed}</p>
            </div>
            <div className="surface-elev p-4">
              <h3 className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
                Clarity
              </h3>
              <p className="text-[12px] text-white">{advice.delivery.clarity}</p>
            </div>
            <div className="surface-elev p-4">
              <h3 className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
                Persona
              </h3>
              <p className="text-[12px] text-white">{advice.delivery.persona}</p>
            </div>
          </div>

          <div className="surface-elev p-4 border-l-2 border-[var(--accent-purple)]">
            <h3 className="text-[12.5px] font-semibold mb-2 text-[var(--accent-purple)]">
              Closing strategy
            </h3>
            <MarkdownView text={advice.closeStrategy} />
          </div>
        </div>
      )}
    </>
  );
}
