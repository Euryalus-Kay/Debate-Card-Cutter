"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ToolboxIcon, SparkleIcon, ZapIcon, MicIcon } from "@/components/ui/icons";
import MarkdownView from "@/components/ui/MarkdownView";
import { evaluateTagQuality, estimateReadTime } from "@/lib/strategy-engine";

type Tab = "refute" | "cx" | "audit" | "evaluate" | "rebuttal" | "explain";

interface RefutationResult {
  responses: Array<{ response: string; type: string; quality: number }>;
  bestPath: string;
  trapsToAvoid: string[];
}

interface CXResult {
  turns: Array<{ questioner: string; answerer: string; followUp?: string }>;
  takeaways: string[];
  trapsTriggered: string[];
}

interface AuditResult {
  archetype: string;
  strengths: string[];
  weaknesses: string[];
  missingPieces: string[];
  affAnswers: string[];
  redLines: string[];
  overall: number;
}

interface RebuttalResult {
  score: number;
  whatWorked: string[];
  whatToFix: string[];
  ideal: string;
  drillRecommendations: string[];
}

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "refute", label: "Refutation", desc: "Generate 6 distinct refutations" },
  { id: "cx", label: "CX simulator", desc: "Practice cross-examination" },
  { id: "audit", label: "Argument audit", desc: "Brutal honest review" },
  { id: "evaluate", label: "Card eval", desc: "Score a card 0-100" },
  { id: "rebuttal", label: "Rebuttal redo", desc: "Score & coach a rebuttal" },
  { id: "explain", label: "ELI5 card", desc: "Simple-language explanation" },
];

export default function ToolkitPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("refute");

  // Shared state
  const [argumentText, setArgumentText] = useState("");
  const [side, setSide] = useState<"aff" | "neg">("aff");
  const [busy, setBusy] = useState(false);

  // Per-tool state
  const [refute, setRefute] = useState<RefutationResult | null>(null);
  const [cx, setCx] = useState<CXResult | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [evaluation, setEvaluation] = useState<{
    tag: { score: number; notes: string[] };
    readTime: { seconds: number; highlightedWords: number; totalWords: number };
    deepEvaluation: {
      overall: number;
      authorScore: number;
      recencyScore: number;
      specificityScore: number;
      warrantDepthScore: number;
      notes: string[];
      comparedToTop: string;
    } | null;
  } | null>(null);
  const [rebuttal, setRebuttal] = useState<RebuttalResult | null>(null);
  const [explanation, setExplanation] = useState("");

  // Card-specific
  const [tag, setTag] = useState("");
  const [cite, setCite] = useState("");
  const [evidence, setEvidence] = useState("");

  // Rebuttal-specific
  const [rebuttalSpeech, setRebuttalSpeech] = useState("2NR");
  const [rebuttalScenario, setRebuttalScenario] = useState("");
  const [rebuttalTranscript, setRebuttalTranscript] = useState("");

  const handleRefute = async () => {
    if (!argumentText.trim()) {
      toast.error("Paste an argument to answer");
      return;
    }
    setBusy(true);
    setRefute(null);
    try {
      const res = await fetch("/api/refute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ argument: argumentText, side, count: 6 }),
      });
      const data = await res.json();
      if (data.error) toast.error("Refute failed", data.error);
      else setRefute(data);
    } catch (err) {
      toast.error("Refute failed", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const handleCX = async () => {
    if (!argumentText.trim()) {
      toast.error("Paste an argument first");
      return;
    }
    setBusy(true);
    setCx(null);
    try {
      const res = await fetch("/api/cx-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, argument: argumentText }),
      });
      const data = await res.json();
      if (data.error) toast.error("CX failed", data.error);
      else setCx(data);
    } catch (err) {
      toast.error("CX failed", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const handleAudit = async () => {
    if (!argumentText.trim()) {
      toast.error("Paste an argument first");
      return;
    }
    setBusy(true);
    setAudit(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ argumentText }),
      });
      const data = await res.json();
      if (data.error) toast.error("Audit failed", data.error);
      else setAudit(data);
    } catch (err) {
      toast.error("Audit failed", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const handleEvaluate = async () => {
    if (!tag || !evidence) {
      toast.error("Tag and evidence required");
      return;
    }
    setBusy(true);
    setEvaluation(null);
    try {
      const tagEval = evaluateTagQuality(tag);
      const readTime = estimateReadTime(evidence);
      const res = await fetch("/api/eval-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, citation: cite, evidence, query: tag }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Eval failed", data.error);
      } else {
        setEvaluation({
          tag: tagEval,
          readTime,
          deepEvaluation: data?.deepEvaluation,
        });
      }
    } catch (err) {
      toast.error("Eval failed", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const handleRebuttal = async () => {
    if (!rebuttalTranscript.trim()) {
      toast.error("Transcript required");
      return;
    }
    setBusy(true);
    setRebuttal(null);
    try {
      const res = await fetch("/api/rebuttal-redo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speechType: rebuttalSpeech,
          side,
          scenario: rebuttalScenario,
          transcript: rebuttalTranscript,
        }),
      });
      const data = await res.json();
      if (data.error) toast.error("Rebuttal review failed", data.error);
      else setRebuttal(data);
    } catch (err) {
      toast.error("Failed", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const handleExplain = async () => {
    if (!tag || !evidence) {
      toast.error("Tag and evidence required");
      return;
    }
    setBusy(true);
    setExplanation("");
    try {
      const res = await fetch("/api/explain-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, citation: cite, evidence }),
      });
      const data = await res.json();
      if (data.error) toast.error("Explain failed", data.error);
      else setExplanation(data.explanation);
    } catch (err) {
      toast.error("Failed", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
          <ToolboxIcon size={18} className="text-[var(--accent-cyan)]" />
          Debate toolkit
        </h1>
        <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1 max-w-2xl">
          One-shot tools for refutation, CX simulation, argument audit, card
          evaluation, rebuttal review, and ELI5 explanations.
        </p>
      </div>

      <div className="tab-strip mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-[11.5px] text-[var(--text-tertiary)] mb-4">
        {TABS.find((t) => t.id === tab)?.desc}
      </p>

      {/* Refute */}
      {tab === "refute" && (
        <div className="space-y-4">
          <div className="flex gap-1 mb-2">
            {(["aff", "neg"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-3 py-1.5 text-[11px] rounded-md border ${
                  side === s
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                    : "border-[var(--border-default)] text-[var(--text-tertiary)]"
                }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          <textarea
            value={argumentText}
            onChange={(e) => setArgumentText(e.target.value)}
            className="textarea"
            rows={6}
            placeholder="Paste the argument you need to refute..."
          />
          <button
            onClick={handleRefute}
            disabled={busy || !argumentText.trim()}
            className="btn-primary"
          >
            {busy ? (
              <>
                <span className="spinner" /> Generating...
              </>
            ) : (
              <>
                <ZapIcon size={12} /> Generate refutations
              </>
            )}
          </button>

          {refute && (
            <div className="space-y-3 anim-fade-in">
              <div className="surface-elev p-4 border-l-2 border-[var(--accent-green)]">
                <h3 className="text-[12px] font-semibold mb-1.5 text-[var(--accent-green)]">
                  Best path
                </h3>
                <p className="text-[12px] text-white leading-relaxed">
                  {refute.bestPath}
                </p>
              </div>
              <div className="space-y-2">
                {refute.responses.map((r, i) => (
                  <div key={i} className="surface p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="badge badge-blue">{r.type}</span>
                      <span
                        className="text-[11px] font-mono"
                        style={{
                          color:
                            r.quality > 80
                              ? "var(--accent-green)"
                              : r.quality > 60
                              ? "var(--accent-amber)"
                              : "var(--text-tertiary)",
                        }}
                      >
                        {r.quality}/100
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                      {r.response}
                    </p>
                  </div>
                ))}
              </div>
              {refute.trapsToAvoid.length > 0 && (
                <div className="surface p-3 border-l-2 border-[var(--accent-red)]">
                  <h3 className="text-[11px] font-semibold mb-1.5 text-[var(--accent-red)]">
                    Traps to avoid
                  </h3>
                  <ul className="space-y-1">
                    {refute.trapsToAvoid.map((t, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        · {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CX */}
      {tab === "cx" && (
        <div className="space-y-4">
          <div className="flex gap-1 mb-2">
            {(["aff", "neg"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-3 py-1.5 text-[11px] rounded-md border ${
                  side === s
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                    : "border-[var(--border-default)] text-[var(--text-tertiary)]"
                }`}
              >
                You are {s.toUpperCase()}
              </button>
            ))}
          </div>
          <textarea
            value={argumentText}
            onChange={(e) => setArgumentText(e.target.value)}
            className="textarea"
            rows={5}
            placeholder="Paste the argument you'd be cross-examined on..."
          />
          <button
            onClick={handleCX}
            disabled={busy || !argumentText.trim()}
            className="btn-primary"
          >
            {busy ? (
              <>
                <span className="spinner" /> Simulating...
              </>
            ) : (
              <>
                <MicIcon size={12} /> Simulate CX
              </>
            )}
          </button>

          {cx && (
            <div className="space-y-3 anim-fade-in">
              {cx.turns.map((t, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="chat-bubble chat-bubble-user max-w-[88%]">
                    <strong className="text-[10px] uppercase tracking-wider opacity-70 block mb-1">
                      Q
                    </strong>
                    {t.questioner}
                  </div>
                  <div className="chat-bubble chat-bubble-coach max-w-[88%]">
                    <strong className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                      A
                    </strong>
                    {t.answerer}
                  </div>
                  {t.followUp && (
                    <div className="ml-6 text-[11px] italic text-[var(--text-tertiary)]">
                      Follow-up: {t.followUp}
                    </div>
                  )}
                </div>
              ))}
              {cx.takeaways.length > 0 && (
                <div className="surface-elev p-4">
                  <h3 className="text-[12px] font-semibold mb-2">Takeaways</h3>
                  <ul className="space-y-1">
                    {cx.takeaways.map((t, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        · {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit */}
      {tab === "audit" && (
        <div className="space-y-4">
          <textarea
            value={argumentText}
            onChange={(e) => setArgumentText(e.target.value)}
            className="textarea"
            rows={8}
            placeholder="Paste your full argument (1NC shell, aff case, etc.). The audit gives brutal honest feedback."
          />
          <button
            onClick={handleAudit}
            disabled={busy || !argumentText.trim()}
            className="btn-primary"
          >
            {busy ? (
              <>
                <span className="spinner" /> Auditing...
              </>
            ) : (
              <>
                <SparkleIcon size={12} /> Audit
              </>
            )}
          </button>

          {audit && (
            <div className="space-y-3 anim-fade-in">
              <div className="surface-elev p-4 flex items-center justify-between">
                <div>
                  <span className="badge badge-purple uppercase">{audit.archetype}</span>
                </div>
                <div
                  className="text-[28px] font-bold"
                  style={{
                    color:
                      audit.overall >= 75
                        ? "var(--accent-green)"
                        : audit.overall >= 55
                        ? "var(--accent-amber)"
                        : "var(--accent-red)",
                  }}
                >
                  {audit.overall}/100
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="surface p-3">
                  <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-green)]">
                    Strengths
                  </h3>
                  <ul className="space-y-1">
                    {audit.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        + {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="surface p-3">
                  <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-red)]">
                    Weaknesses
                  </h3>
                  <ul className="space-y-1">
                    {audit.weaknesses.map((w, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        − {w}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="surface p-3">
                  <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-amber)]">
                    Missing pieces
                  </h3>
                  <ul className="space-y-1">
                    {audit.missingPieces.map((m, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        ? {m}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="surface p-3">
                  <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-purple)]">
                    Likely aff answers
                  </h3>
                  <ul className="space-y-1">
                    {audit.affAnswers.map((a, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        ↩ {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="surface p-3 border-l-2 border-[var(--accent-red)]">
                <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-red)]">
                  Red lines (don&apos;t concede)
                </h3>
                <ul className="space-y-1">
                  {audit.redLines.map((r, i) => (
                    <li key={i} className="text-[11.5px] text-[var(--text-secondary)]">
                      ⚠ {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card eval */}
      {tab === "evaluate" && (
        <div className="space-y-3">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="input"
            placeholder="Tag"
          />
          <input
            value={cite}
            onChange={(e) => setCite(e.target.value)}
            className="input"
            placeholder="Citation"
          />
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            className="textarea"
            rows={8}
            placeholder="Evidence text (with <mark> tags if highlighted)"
          />
          <button
            onClick={handleEvaluate}
            disabled={busy || !tag || !evidence}
            className="btn-primary"
          >
            {busy ? (
              <>
                <span className="spinner" /> Evaluating...
              </>
            ) : (
              <>
                <SparkleIcon size={12} /> Evaluate
              </>
            )}
          </button>

          {evaluation && (
            <div className="space-y-3 anim-fade-in">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="stat-tile">
                  <div className="stat-tile-label">Tag</div>
                  <div className="stat-tile-value">{evaluation.tag.score}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Read time</div>
                  <div className="stat-tile-value">
                    {evaluation.readTime.seconds}s
                  </div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Highlighted</div>
                  <div className="stat-tile-value">
                    {evaluation.readTime.highlightedWords}w
                  </div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Total</div>
                  <div className="stat-tile-value">
                    {evaluation.readTime.totalWords}w
                  </div>
                </div>
              </div>
              {evaluation.deepEvaluation && (
                <div className="surface-elev p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[12.5px] font-semibold">
                      Deep evaluation
                    </h3>
                    <span
                      className="text-[20px] font-bold"
                      style={{
                        color:
                          evaluation.deepEvaluation.overall >= 75
                            ? "var(--accent-green)"
                            : evaluation.deepEvaluation.overall >= 55
                            ? "var(--accent-amber)"
                            : "var(--accent-red)",
                      }}
                    >
                      {evaluation.deepEvaluation.overall}/100
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    {(
                      [
                        ["Author", evaluation.deepEvaluation.authorScore],
                        ["Recency", evaluation.deepEvaluation.recencyScore],
                        ["Specificity", evaluation.deepEvaluation.specificityScore],
                        ["Warrant", evaluation.deepEvaluation.warrantDepthScore],
                      ] as const
                    ).map(([label, val]) => (
                      <div key={label} className="surface p-2">
                        <div className="text-[10px] text-[var(--text-faint)]">
                          {label}
                        </div>
                        <div className="text-[14px] font-mono font-bold">
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-1 mb-2">
                    {evaluation.deepEvaluation.notes.map((n, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        · {n}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] italic text-[var(--text-tertiary)]">
                    {evaluation.deepEvaluation.comparedToTop}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rebuttal */}
      {tab === "rebuttal" && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {["1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"].map((s) => (
              <button
                key={s}
                onClick={() => setRebuttalSpeech(s)}
                className={`px-3 py-1.5 text-[11px] rounded-md border ${
                  rebuttalSpeech === s
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                    : "border-[var(--border-default)] text-[var(--text-tertiary)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={rebuttalScenario}
            onChange={(e) => setRebuttalScenario(e.target.value)}
            className="input"
            placeholder="Scenario (what was the round state going into this speech?)"
          />
          <textarea
            value={rebuttalTranscript}
            onChange={(e) => setRebuttalTranscript(e.target.value)}
            className="textarea"
            rows={10}
            placeholder="Paste a transcript or detailed notes from the rebuttal you gave..."
          />
          <button
            onClick={handleRebuttal}
            disabled={busy || !rebuttalTranscript.trim()}
            className="btn-primary"
          >
            {busy ? (
              <>
                <span className="spinner" /> Reviewing...
              </>
            ) : (
              <>
                <SparkleIcon size={12} /> Coach this rebuttal
              </>
            )}
          </button>

          {rebuttal && (
            <div className="space-y-3 anim-fade-in">
              <div className="surface-elev p-4 flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-wider text-[var(--text-faint)]">
                  Score
                </span>
                <div
                  className="text-[28px] font-bold"
                  style={{
                    color:
                      rebuttal.score >= 80
                        ? "var(--accent-green)"
                        : rebuttal.score >= 60
                        ? "var(--accent-amber)"
                        : "var(--accent-red)",
                  }}
                >
                  {rebuttal.score}/100
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="surface p-3">
                  <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-green)]">
                    What worked
                  </h3>
                  <ul className="space-y-1">
                    {rebuttal.whatWorked.map((w, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        + {w}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="surface p-3">
                  <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-red)]">
                    What to fix
                  </h3>
                  <ul className="space-y-1">
                    {rebuttal.whatToFix.map((w, i) => (
                      <li
                        key={i}
                        className="text-[11.5px] text-[var(--text-secondary)]"
                      >
                        − {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="surface-elev p-4 border-l-2 border-[var(--accent-blue)]">
                <h3 className="text-[12px] font-semibold mb-2">Ideal version</h3>
                <MarkdownView text={rebuttal.ideal} />
              </div>
              <div className="surface p-3">
                <h3 className="text-[11px] font-semibold mb-2 text-[var(--accent-cyan)]">
                  Drill recommendations
                </h3>
                <ul className="space-y-1">
                  {rebuttal.drillRecommendations.map((d, i) => (
                    <li
                      key={i}
                      className="text-[11.5px] text-[var(--text-secondary)]"
                    >
                      → {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explain */}
      {tab === "explain" && (
        <div className="space-y-3">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="input"
            placeholder="Card tag"
          />
          <input
            value={cite}
            onChange={(e) => setCite(e.target.value)}
            className="input"
            placeholder="Citation (optional)"
          />
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            className="textarea"
            rows={8}
            placeholder="Evidence text..."
          />
          <button
            onClick={handleExplain}
            disabled={busy || !tag || !evidence}
            className="btn-primary"
          >
            {busy ? (
              <>
                <span className="spinner" /> Explaining...
              </>
            ) : (
              <>
                <SparkleIcon size={12} /> Explain like I&apos;m 5
              </>
            )}
          </button>
          {explanation && (
            <div className="surface-elev p-4 anim-fade-in">
              <MarkdownView text={explanation} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
