"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import { ScalesIcon, SparkleIcon } from "@/components/ui/icons";
import MarkdownView from "@/components/ui/MarkdownView";
import {
  compareImpacts,
  type ImpactClaim,
  type ImpactComparison,
} from "@/lib/strategy-engine";

interface AICalc {
  overview: string;
  comparisons: Array<{
    axis: string;
    winner: "aff" | "neg";
    explanation: string;
    judgeInstruction: string;
  }>;
  evenIfLayers: string[];
  twoNRClose: string;
  twoARClose: string;
}

const DEFAULT_AFF: ImpactClaim = {
  label: "Heg good — extinction via great-power war",
  magnitude: 95,
  probability: 35,
  timeframe: 6,
  reversibility: 95,
  scope: "global",
};
const DEFAULT_NEG: ImpactClaim = {
  label: "Politics DA — econ crash",
  magnitude: 60,
  probability: 70,
  timeframe: 2,
  reversibility: 50,
  scope: "national",
};

function ScoringRow({
  label,
  value,
  onChange,
  max = 100,
  unit = "",
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  unit?: string;
  help?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-[var(--text-tertiary)]">
          {label}
          {help && (
            <span className="text-[var(--text-faint)] ml-2 text-[10px]">
              {help}
            </span>
          )}
        </label>
        <span className="text-[11.5px] font-mono text-white">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export default function ImpactCalcPage() {
  const { selectedJudgeId } = useApp();
  const toast = useToast();

  const [aff, setAff] = useState<ImpactClaim>(DEFAULT_AFF);
  const [neg, setNeg] = useState<ImpactClaim>(DEFAULT_NEG);
  const [perspective, setPerspective] = useState<"aff" | "neg">("aff");
  const [scoringResult, setScoringResult] = useState<ImpactComparison | null>(
    null
  );
  const [aiCalc, setAiCalc] = useState<AICalc | null>(null);
  const [loading, setLoading] = useState(false);

  const runScoring = () => {
    const r = compareImpacts(aff, neg);
    setScoringResult(r);
  };

  const generateAI = async () => {
    setLoading(true);
    setAiCalc(null);
    try {
      const res = await fetch("/api/impact-calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affImpact: aff.label,
          negImpact: neg.label,
          perspective,
          judgeId: selectedJudgeId,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Calc failed", data.error);
      } else {
        setAiCalc(data);
        toast.success(
          "Impact calc generated",
          `${data?.comparisons?.length || 0} comparisons`
        );
      }
    } catch (err) {
      toast.error(
        "Calc failed",
        err instanceof Error ? err.message : "Unknown"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
          <ScalesIcon size={18} className="text-[var(--accent-green)]" />
          Impact calculus
        </h1>
        <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1">
          Score impacts on the 5 axes. Generate the closing weighing paragraph.
          Calibrated to your selected judge paradigm.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aff impact */}
        <div className="surface-elev p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge badge-blue">AFF</span>
            <h2 className="text-[13px] font-semibold text-white">
              Affirmative impact
            </h2>
          </div>
          <input
            value={aff.label}
            onChange={(e) => setAff({ ...aff, label: e.target.value })}
            className="input mb-3 text-[12.5px]"
            placeholder="e.g., Heg good — extinction via great-power war"
          />
          <div className="space-y-3">
            <ScoringRow
              label="Magnitude"
              value={aff.magnitude}
              onChange={(v) => setAff({ ...aff, magnitude: v })}
              help="how big the harm"
            />
            <ScoringRow
              label="Probability"
              value={aff.probability}
              onChange={(v) => setAff({ ...aff, probability: v })}
              unit="%"
              help="how likely it occurs"
            />
            <ScoringRow
              label="Timeframe"
              value={aff.timeframe}
              onChange={(v) => setAff({ ...aff, timeframe: v })}
              max={50}
              unit="y"
              help="years until impact"
            />
            <ScoringRow
              label="Reversibility"
              value={aff.reversibility}
              onChange={(v) => setAff({ ...aff, reversibility: v })}
              help="harder to reverse = higher"
            />
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1.5 block">
                Scope
              </label>
              <select
                value={aff.scope}
                onChange={(e) =>
                  setAff({ ...aff, scope: e.target.value as ImpactClaim["scope"] })
                }
                className="input text-[12px]"
              >
                <option value="individual">Individual</option>
                <option value="regional">Regional</option>
                <option value="national">National</option>
                <option value="global">Global</option>
                <option value="structural">Structural</option>
              </select>
            </div>
          </div>
        </div>

        {/* Neg impact */}
        <div className="surface-elev p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge badge-red">NEG</span>
            <h2 className="text-[13px] font-semibold text-white">
              Negative impact
            </h2>
          </div>
          <input
            value={neg.label}
            onChange={(e) => setNeg({ ...neg, label: e.target.value })}
            className="input mb-3 text-[12.5px]"
            placeholder="e.g., Spending DA — econ crash"
          />
          <div className="space-y-3">
            <ScoringRow
              label="Magnitude"
              value={neg.magnitude}
              onChange={(v) => setNeg({ ...neg, magnitude: v })}
            />
            <ScoringRow
              label="Probability"
              value={neg.probability}
              onChange={(v) => setNeg({ ...neg, probability: v })}
              unit="%"
            />
            <ScoringRow
              label="Timeframe"
              value={neg.timeframe}
              onChange={(v) => setNeg({ ...neg, timeframe: v })}
              max={50}
              unit="y"
            />
            <ScoringRow
              label="Reversibility"
              value={neg.reversibility}
              onChange={(v) => setNeg({ ...neg, reversibility: v })}
            />
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1.5 block">
                Scope
              </label>
              <select
                value={neg.scope}
                onChange={(e) =>
                  setNeg({ ...neg, scope: e.target.value as ImpactClaim["scope"] })
                }
                className="input text-[12px]"
              >
                <option value="individual">Individual</option>
                <option value="regional">Regional</option>
                <option value="national">National</option>
                <option value="global">Global</option>
                <option value="structural">Structural</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <span className="text-[11px] text-[var(--text-tertiary)]">
          Writing for:
        </span>
        {(["aff", "neg"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPerspective(p)}
            className={`px-3 py-1.5 text-[11.5px] rounded-md border transition-colors ${
              perspective === p
                ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
            }`}
          >
            {p === "aff" ? "2AR" : "2NR"} ({p.toUpperCase()})
          </button>
        ))}
        <button onClick={runScoring} className="btn-secondary">
          Quick score
        </button>
        <button onClick={generateAI} disabled={loading} className="btn-primary ml-auto">
          {loading ? (
            <>
              <span className="spinner" /> Generating...
            </>
          ) : (
            <>
              <SparkleIcon size={12} /> Generate AI calc
            </>
          )}
        </button>
      </div>

      {/* Quick score */}
      {scoringResult && (
        <div className="surface-elev p-4 mt-4 anim-slide-up">
          <h2 className="text-[13px] font-semibold mb-2">Local heuristic</h2>
          <div
            className="text-[20px] font-semibold mb-2"
            style={{
              color:
                scoringResult.winner === "aff"
                  ? "var(--accent-blue)"
                  : scoringResult.winner === "neg"
                  ? "var(--accent-red)"
                  : "var(--text-tertiary)",
            }}
          >
            {scoringResult.winner === "toss-up"
              ? "Toss-up"
              : `${scoringResult.winner.toUpperCase()} wins`}{" "}
            <span className="text-[12px] text-[var(--text-tertiary)]">
              ({scoringResult.margin}% margin)
            </span>
          </div>
          <ul className="space-y-1">
            {scoringResult.reasoning.map((r, i) => (
              <li key={i} className="text-[11.5px] text-[var(--text-secondary)]">
                · {r}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-[var(--text-faint)] mt-2">
            Weakest axis: {scoringResult.weakestAxis}
          </p>
        </div>
      )}

      {/* AI calc */}
      {aiCalc && (
        <div className="space-y-4 mt-5 anim-fade-in">
          <div className="surface-elev p-4">
            <h2 className="text-[13px] font-semibold mb-2">Overview</h2>
            <MarkdownView text={aiCalc.overview} />
          </div>

          <div className="space-y-2">
            {aiCalc.comparisons.map((c, i) => (
              <div
                key={i}
                className="surface p-3 border-l-2"
                style={{
                  borderLeftColor:
                    c.winner === "aff" ? "var(--accent-blue)" : "var(--accent-red)",
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="badge badge-neutral uppercase">{c.axis}</span>
                  <span
                    className="badge"
                    style={{
                      background:
                        c.winner === "aff"
                          ? "rgba(79,138,246,.15)"
                          : "rgba(239,68,68,.15)",
                      color: c.winner === "aff" ? "#93b8fa" : "#fca5a5",
                    }}
                  >
                    {c.winner.toUpperCase()} wins
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                  {c.explanation}
                </p>
                <p className="text-[11px] text-[var(--accent-blue)] mt-2 italic">
                  Judge instruction: {c.judgeInstruction}
                </p>
              </div>
            ))}
          </div>

          {aiCalc.evenIfLayers.length > 0 && (
            <div className="surface-elev p-4">
              <h3 className="text-[12px] font-semibold mb-2 text-[var(--accent-purple)]">
                Even-if layers
              </h3>
              <ul className="space-y-2">
                {aiCalc.evenIfLayers.map((l, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-purple)] font-bold">
                      {i + 1}.
                    </span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="surface-elev p-4 border-l-2 border-[var(--accent-red)]">
              <h3 className="text-[11.5px] uppercase tracking-wider text-[var(--accent-red)] mb-2">
                2NR close
              </h3>
              <p className="text-[12px] text-white leading-relaxed">
                {aiCalc.twoNRClose}
              </p>
            </div>
            <div className="surface-elev p-4 border-l-2 border-[var(--accent-blue)]">
              <h3 className="text-[11.5px] uppercase tracking-wider text-[var(--accent-blue)] mb-2">
                2AR close
              </h3>
              <p className="text-[12px] text-white leading-relaxed">
                {aiCalc.twoARClose}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
